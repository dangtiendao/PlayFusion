/**
 * ==============================================================================
 * CARO ONLINE MATCH SCREEN (SRC/GAMES/CARO/ONLINEMATCHSCREEN.TSX)
 * ==============================================================================
 *
 * MÀN HÌNH VÁN ĐẤU CARO ONLINE 1V1 HOÀN CHỈNH (PHASE P3.3, P3.4 & P3.5)
 *
 * NGUYÊN TẮC BẤT BIẾN:
 * 1. SERVER LÀ NGUỒN CHÂN LÝ DUY NHẤT (SERVER-DRIVEN CLOCK & STATE):
 *    - Toàn bộ thay đổi thế cờ và phán quyết thời gian đến từ Server.
 *    - Client TUYỆT ĐỐI KHÔNG áp dụng Optimistic move và KHÔNG tự phán thắng/thua khi giờ về 0.
 * 2. PIPELINE RESYNC THỐNG NHẤT (P3.5b):
 *    - Gom toàn bộ các điểm kéo dữ liệu về `resyncFromServer()` duy nhất.
 *    - THAY TOÀN BỘ State local bằng server state khi có live_state, không merge từng phần.
 *    - Khôi phục kết quả trận đấu từ `matches` nếu trận đã kết thúc trong lúc offline (Đường b).
 *    - Reset cờ auto-claim `hasClaimedRef = false` theo deadline mới.
 * 3. AUTO-RECONNECT VỚI ĐỒNG HỒ TRUNG THỰC (P3.5a):
 *    - Khi rớt mạng (status 'reconnecting'): Bàn cờ bị khóa, đồng hồ VẪN CHẠY TIẾP theo dữ liệu server.
 *    - Nối lại thành công -> tự động kích hoạt `resyncFromServer()`.
 * 4. THEO DÕI PRESENCE ĐỐI THỦ VỚI DEBOUNCE 5S (P3.5c):
 *    - Debounce 5s trước khi chuyển sang trạng thái 'away' để tránh nhấp nháy khi mạng chập chờn.
 *    - Khi đối thủ away: Hiện badge cảnh báo và đếm ngược thời gian hết giờ nếu là lượt của họ.
 *    - THÔNG TIN HIỂN THỊ THUẦN TÚY: Presence KHÔNG BAO GIỜ là căn cứ xử thua, auto-claim P3.4 lo phán quyết.
 *    - Lượt của mình khi đối thủ away: Vẫn đánh bình thường, không khóa gì cả.
 * ==============================================================================
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { GameShell } from '@/components/game-shell/GameShell';
import { ConfirmDialog } from '@/components/game-shell/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { MatchResultReport } from '@engines/types';
import { caroManifest } from '@engines/caro/manifest';
import { caroEngine, DEFAULT_CARO_OPTIONS, checkWinAt, type CaroState } from '@engines/caro';
import {
  InteractiveBoard,
  MatchEndOverlay,
  MatchClock,
  CorrespondenceDeadline,
} from './components';
import { useMatchChannel, type PresenceMember } from '@/transport';
import { useTransportReconnectAttempt } from '@/stores/transportStore';
import { refereeRepository } from '@/repositories/refereeRepository';
import { matchRepository } from '@/repositories/matchRepository';
import { invalidateLeaderboardCache } from '@/repositories/leaderboardRepository';
import { useAuthStore } from '@/stores/authStore';
import { computeOffset, calculateRemainingMs, formatMmSs } from '@/core/serverClock';
import { hapticTap } from '@/core/haptics';
import { getTierByRating, compareTiers, resolveRankView, PLACEMENT_GAMES_DEFAULT } from '@rating';
import type { MatchSettledData } from './components/MatchEndOverlay';

/** Thời gian debounce (5 giây) trước khi kết luận đối thủ đã rời presence (P3.5c) */
const OPPONENT_AWAY_DEBOUNCE_MS = 5000;

export interface OnlineMatchScreenProps {
  /** ID ván đấu (UUID) */
  readonly matchId?: string;
  /** Vị trí ghế của người chơi (0: X - đi trước, 1: O - đi sau) */
  readonly mySeat?: number;
  /** Mã phòng 6 ký tự (nếu có) */
  readonly roomCode?: string;
}

export const OnlineMatchScreen: React.FC<OnlineMatchScreenProps> = (props) => {
  const params = useParams<{ matchId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const matchId = props.matchId ?? params.matchId ?? '';
  const mySeat = props.mySeat ?? (location.state as { mySeat?: number })?.mySeat ?? 0;
  const roomCode = props.roomCode ?? (location.state as { roomCode?: string })?.roomCode ?? '';

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const reconnectAttempt = useTransportReconnectAttempt();

  // 1. STATE MÁY TRẠNG THÁI VÁN ĐẤU
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [gameState, setGameState] = useState<CaroState>(() =>
    caroEngine.init({ playerCount: 2, options: DEFAULT_CARO_OPTIONS }),
  );
  const [moveIndex, setMoveIndex] = useState(0);
  const [currentSeat, setCurrentSeat] = useState(0);
  const [lastMoveCell, setLastMoveCell] = useState<number | null>(null);

  // ĐỒNG HỒ & BÙ LỆCH GIỜ (P3.4c & P3.6c)
  const [clock, setClock] = useState<Record<string, number> | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [timeControl, setTimeControl] = useState<{
    kind?: 'realtime' | 'correspondence';
    baseSeconds?: number;
    incrementSeconds?: number;
    perMoveSeconds?: number;
  } | null>(null);

  // Trạng thái gửi nước đi & Lỗi có thể retry
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{
    message: string;
    isRetryable: boolean;
    moveSerialized: string;
    expectedMoveIndex: number;
  } | null>(null);

  // Trạng thái kết thúc trận đấu & Lý do kết thúc
  const [isGameOver, setIsGameOver] = useState(false);
  const [endReason, setEndReason] = useState<string>('normal');
  const [winnerSeat, setWinnerSeat] = useState<number | null>(null);
  const [winLine, setWinLine] = useState<readonly number[] | null>(null);

  // Trạng thái kết toán xếp hạng từ broadcast match_settled (P4.3c)
  const [settledData, setSettledData] = useState<MatchSettledData | null>(null);
  const processedSettledMatchIdRef = useRef<string | null>(null);

  // Thông tin đối thủ & Toast đồng bộ
  const [opponentName, setOpponentName] = useState<string>('Đối thủ');
  const [resyncToast, setResyncToast] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  // Presence Đối thủ & Trạng thái Away Debounce (P3.5c)
  const [isOpponentAway, setIsOpponentAway] = useState(false);
  const [hasEverSeenOpponent, setHasEverSeenOpponent] = useState(false);
  const awayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dialog Đầu Hàng / Hủy ván / Thoát trận
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);

  // Ref lưu thời điểm tham gia cho Presence
  const joinedAtRef = useRef<string>(new Date().toISOString());

  // Ref lưu moveIndex và cờ claim timeout để tránh stale closure / spam
  const moveIndexRef = useRef(0);
  moveIndexRef.current = moveIndex;

  const hasClaimedRef = useRef<boolean>(false);

  // Cấu hình Presence Member của bản thân
  const selfMember = useMemo<PresenceMember>(() => {
    return {
      userId: user?.id || 'player-anon',
      displayName: profile?.displayName || (user?.isAnonymous ? 'Khách' : 'Người chơi'),
      joinedAt: joinedAtRef.current,
    };
  }, [user?.id, user?.isAnonymous, profile?.displayName]);

  // ==============================================================================
  // 2. PIPELINE RESYNC THỐNG NHẤT (P3.5b)
  // ==============================================================================
  const resyncFromServer = useCallback(
    async (retryCount = 0) => {
      if (!matchId || isGameOver) return;

      setIsResyncing(true);
      setResyncError(null);

      try {
        const liveState = await matchRepository.getLiveState(matchId);

        // ------------------------------------------------------------------------
        // ĐƯỜNG A: TRẬN ĐẤU ĐANG SỐNG (liveState !== null)
        // THAY TOÀN BỘ LOCAL STATE BẰNG SERVER STATE (KHÔNG MERGE TỪNG PHẦN)
        // ------------------------------------------------------------------------
        if (liveState) {
          const nextBoardState = caroEngine.deserialize(liveState.stateSerialized);
          setGameState(nextBoardState);
          setMoveIndex(liveState.moveIndex);
          setCurrentSeat(liveState.currentSeat);
          if (liveState.clock) setClock(liveState.clock);
          if (liveState.turnDeadline) setTurnDeadline(liveState.turnDeadline);

          // RESET CỜ AUTO-CLAIM THEO DEADLINE MỚI (CHỐNG CLAIM DỰA TRÊN DỮ LIỆU CŨ)
          hasClaimedRef.current = false;

          // Cập nhật ô cờ cuối từ movesSerialized nếu có
          if (liveState.movesSerialized) {
            const moves = liveState.movesSerialized.split(',').map(Number);
            if (moves.length > 0) {
              const lastCell = moves[moves.length - 1];
              if (typeof lastCell === 'number' && !isNaN(lastCell)) {
                setLastMoveCell(lastCell);
              }
            }
          }

          setResyncToast('Đã đồng bộ lại thế cờ với máy chủ');
          setTimeout(() => setResyncToast(null), 3000);
          setIsResyncing(false);
          return;
        }

        // ------------------------------------------------------------------------
        // ĐƯỜNG B: TRẬN ĐÃ KẾT THÚC TRONG LÚC OFFLINE (liveState === null)
        // LÝ DO PHẢI ĐI QUA matches: ĐỐI THỦ ĐÃ CLAIM TIMEOUT HOẶC RESIGN XONG
        // ------------------------------------------------------------------------
        const matchDetail = await matchRepository.getMatchById(matchId);
        if (matchDetail && matchDetail.endedAt) {
          setIsGameOver(true);
          setEndReason(matchDetail.endReason || 'normal');

          const winnerPart = matchDetail.participants.find((p) => p.result === 'win');
          setWinnerSeat(winnerPart ? winnerPart.seatIndex : null);
          setIsResyncing(false);
          return;
        }

        // Không tìm thấy match hoặc ván bị hủy bất thường
        setInitError('Ván đấu không tồn tại hoặc đã bị hủy.');
        setIsResyncing(false);
      } catch (err: unknown) {
        // RETRY TỐI ĐA 3 LẦN CHO LỖI MẠNG RETRYABLE (CÁCH NHAU 2S)
        if (retryCount < 3) {
          setTimeout(() => {
            void resyncFromServer(retryCount + 1);
          }, 2000);
        } else {
          setIsResyncing(false);
          const msg = (err as Error)?.message || 'Lỗi kết nối khi đồng bộ dữ liệu.';
          setResyncError(msg);
        }
      }
    },
    [matchId, isGameOver],
  );

  // 3. KHỞI TẠO VÁN ĐẤU (INIT MATCH IDEMPOTENT)
  const initOnlineMatch = useCallback(async () => {
    if (!matchId) {
      setInitError('Không tìm thấy mã ván đấu.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setInitError(null);

      // Gọi Trọng tài Server khởi tạo thế cờ và đồng hồ
      const liveState = await refereeRepository.initMatch(matchId);

      // Deserialize thế cờ ban đầu
      const initialBoardState = caroEngine.deserialize(liveState.stateSerialized);
      setGameState(initialBoardState);
      setMoveIndex(liveState.moveIndex);
      setCurrentSeat(liveState.currentSeat);

      if (liveState.clock) setClock(liveState.clock);
      if (liveState.turnDeadline) setTurnDeadline(liveState.turnDeadline);
      if (liveState.serverNow) setClockOffset(computeOffset(liveState.serverNow));
      if (liveState.timeControl) setTimeControl(liveState.timeControl);

      // Nạp thông tin đối thủ từ bảng match_participants
      try {
        const matchDetail = await matchRepository.getMatchById(matchId);
        if (matchDetail) {
          if (matchDetail.mode === 'online_correspondence') {
            setTimeControl((prev) => prev || { kind: 'correspondence', perMoveSeconds: 86400 });
          }
          const opp = matchDetail.participants.find(
            (p: { seatIndex: number; displayName?: string }) => p.seatIndex !== mySeat,
          );
          if (opp?.displayName) {
            setOpponentName(opp.displayName);
          }
        }
      } catch {
        // Bỏ qua lỗi nạp tên đối thủ phụ
      }
    } catch (err) {
      const msg =
        (err as { message?: string })?.message ||
        'Không thể khởi tạo ván đấu trực tuyến từ máy chủ.';
      setInitError(msg);
    } finally {
      setLoading(false);
    }
  }, [matchId, mySeat]);

  useEffect(() => {
    void initOnlineMatch();
  }, [initOnlineMatch]);

  // 4. XỬ LÝ NHẬN BROADCAST REALTIME TỪ MÁY CHỦ
  const handleRealtimeMessage = useCallback(
    async (env: { type: string; payload: unknown }) => {
      // ------------------------------------------------------------------------
      // SỰ KIỆN: 'move_accepted'
      // ------------------------------------------------------------------------
      if (env.type === 'move_accepted') {
        const p = env.payload as {
          moveIndex: number;
          seatIndex?: number;
          currentSeat: number;
          moveSerialized: string;
          stateSerialized: string;
          terminal?: {
            winner: number | null;
            isDraw: boolean;
            reason?: string;
          } | null;
          clock?: Record<string, number> | null;
          turnDeadline?: string | null;
          serverNow?: string | null;
        };

        if (!p || typeof p.moveIndex !== 'number') return;

        const currentLocalIndex = moveIndexRef.current;

        // TH 1: ĐÚNG TUẦN TỰ (p.moveIndex === currentLocalIndex + 1)
        if (p.moveIndex === currentLocalIndex + 1) {
          const nextState = caroEngine.deserialize(p.stateSerialized);
          const cellIndex = Number(p.moveSerialized);

          setGameState(nextState);
          setMoveIndex(p.moveIndex);
          setCurrentSeat(p.currentSeat);
          setLastMoveCell(cellIndex);
          setSubmitError(null);
          hasClaimedRef.current = false; // Reset cờ claim khi lượt mới bắt đầu

          if (p.clock) setClock(p.clock);
          if (p.turnDeadline) setTurnDeadline(p.turnDeadline);
          if (p.serverNow) setClockOffset(computeOffset(p.serverNow));

          // Kiểm tra đường 5 quân thắng
          const win = checkWinAt(
            nextState.board,
            DEFAULT_CARO_OPTIONS.boardSize,
            cellIndex,
            DEFAULT_CARO_OPTIONS,
          );
          if (win) {
            setWinLine(win.line);
          }

          if (p.terminal) {
            setIsGameOver(true);
            setEndReason('normal');
            if (p.terminal.isDraw) {
              setWinnerSeat(null);
            } else if (p.terminal.winner !== undefined && p.terminal.winner !== null) {
              setWinnerSeat(p.terminal.winner);
            }
          }
          return;
        }

        // TH 2: GÓI TIN LẶP / ĐÃ XỬ LÝ (p.moveIndex <= currentLocalIndex)
        if (p.moveIndex <= currentLocalIndex) {
          return;
        }

        // TH 3: LỆCH NHỊP / MISS BROADCAST (p.moveIndex > currentLocalIndex + 1) -> GỌI RESYNC THỐNG NHẤT
        void resyncFromServer();
        return;
      }

      // ------------------------------------------------------------------------
      // SỰ KIỆN: 'match_ended' (Resign, Timeout, Abort)
      // ------------------------------------------------------------------------
      if (env.type === 'match_ended') {
        const p = env.payload as {
          matchId: string;
          reason: string;
          outcomes?: { playerIndex: number; outcome: 'win' | 'loss' | 'draw' }[] | null;
          serverNow?: string;
        };

        if (!p) return;

        setIsGameOver(true);
        setEndReason(p.reason || 'normal');

        if (p.reason === 'abort' || !p.outcomes) {
          setWinnerSeat(null);
        } else {
          const winOutcome = p.outcomes.find((o) => o.outcome === 'win');
          setWinnerSeat(winOutcome ? winOutcome.playerIndex : null);
        }
        return;
      }

      // ------------------------------------------------------------------------
      // SỰ KIỆN: 'match_settled' (P4.3c - Kết toán xếp hạng & Biến động điểm)
      // ------------------------------------------------------------------------
      if (env.type === 'match_settled') {
        const p = env.payload as {
          matchId: string;
          deltas?: { userId: string; ratingDelta: number; newRating: number; coins: number }[];
          serverNow?: string;
        };

        if (!p || p.matchId !== matchId) return;

        // CHỐNG ÁP 2 LẦN (IDEMPOTENCY): Broadcast trùng lặp cho cùng matchId sẽ bị bỏ qua
        if (processedSettledMatchIdRef.current === p.matchId) {
          return;
        }
        processedSettledMatchIdRef.current = p.matchId;

        // Tìm delta của người chơi hiện tại (lọc theo auth userId)
        const myUserId = user?.id || 'player-anon';
        const myDelta = p.deltas?.find((d) => d.userId === myUserId);
        if (!myDelta) return;

        // Tính toán chuyển bậc (oldRating -> newRating)
        const oldRating = myDelta.newRating - myDelta.ratingDelta;
        const tierBefore = getTierByRating(oldRating);
        const tierAfter = getTierByRating(myDelta.newRating);
        const comparison = compareTiers(tierAfter, tierBefore);
        const rankChange: 'up' | 'down' | 'same' =
          comparison > 0 ? 'up' : comparison < 0 ? 'down' : 'same';

        // Kiểm tra Khiên bảo vệ rớt hạng (Demotion Shield Rule)
        let isShielded = false;
        if (rankChange === 'down') {
          const rankView = resolveRankView({
            rating: myDelta.newRating,
            gamesPlayed: 15,
            placementGames: PLACEMENT_GAMES_DEFAULT,
            lastMatch: {
              ratingBefore: oldRating,
              ratingAfter: myDelta.newRating,
            },
          });
          isShielded = rankView.kind === 'ranked' && rankView.shield === true;
        }

        setSettledData({
          ratingDelta: myDelta.ratingDelta,
          newRating: myDelta.newRating,
          oldRating,
          coins: myDelta.coins,
          tierBefore,
          tierAfter,
          rankChange,
          isShielded,
        });

        // Xóa bộ đệm cache bảng xếp hạng của game này để trang Leaderboard cập nhật mới nhất
        invalidateLeaderboardCache('caro');
      }
    },
    [resyncFromServer, matchId, user?.id],
  );

  // 5. KẾT NỐI REALTIME TRANSPORT QUA USEMATCHCHANNEL (P3.5a ĐẤU NỐI ONRECONNECTED)
  // Duy trì kết nối khi kết thúc ván để nhận broadcast 'match_settled' gửi ngay sau 'match_ended'
  const {
    status: transportStatus,
    members,
    reconnect,
  } = useMatchChannel({
    matchId,
    self: selfMember,
    enabled: !loading,
    onMessage: handleRealtimeMessage,
    onReconnected: () => {
      setResyncToast('Đã kết nối lại máy chủ');
      setTimeout(() => setResyncToast(null), 2500);
      void resyncFromServer();
    },
  });

  // 6. THEO DÕI PRESENCE ĐỐI THỦ VỚI DEBOUNCE 5 GIÂY (P3.5c)
  useEffect(() => {
    const isOpponentInPresence = members.some((m) => m.userId !== user?.id);

    if (isOpponentInPresence) {
      // Đối thủ đang hiện diện trong kênh
      if (awayTimerRef.current) {
        clearTimeout(awayTimerRef.current);
        awayTimerRef.current = null;
      }

      if (isOpponentAway) {
        // Vừa quay lại sau khi away
        setResyncToast('Đối thủ đã kết nối lại');
        setTimeout(() => setResyncToast(null), 3000);
      }

      setIsOpponentAway(false);
      setHasEverSeenOpponent(true);
    } else {
      // Đối thủ không có trong members (có thể rớt mạng hoặc đang auto-reconnect)
      if (hasEverSeenOpponent && !awayTimerRef.current && !isOpponentAway) {
        awayTimerRef.current = setTimeout(() => {
          awayTimerRef.current = null;
          setIsOpponentAway(true);
        }, OPPONENT_AWAY_DEBOUNCE_MS);
      }
    }

    return () => {
      if (awayTimerRef.current) {
        clearTimeout(awayTimerRef.current);
        awayTimerRef.current = null;
      }
    };
  }, [members, user?.id, hasEverSeenOpponent, isOpponentAway]);

  // 7. AUTO-CLAIM TIMEOUT KHI ĐỐI THỦ QUÁ HẠN (P3.4c - GIỮ NGUYÊN)
  // Grace period 2s phía server + 1s đệm client = -3000ms
  useEffect(() => {
    if (isGameOver || loading || currentSeat === mySeat || !turnDeadline) return;

    const checkAutoClaim = async () => {
      const remaining = calculateRemainingMs(turnDeadline, clockOffset);
      if (remaining <= -3000 && !hasClaimedRef.current) {
        hasClaimedRef.current = true;
        try {
          const res = await refereeRepository.claimTimeout(matchId);
          if (res.kind === 'too_early') {
            if (res.serverNow) setClockOffset(computeOffset(res.serverNow));
            if (res.turnDeadline) setTurnDeadline(res.turnDeadline);
            hasClaimedRef.current = false;
          } else if (res.kind === 'accepted') {
            setIsGameOver(true);
            setEndReason(res.reason);
            const winOut = res.outcomes?.find((o) => o.outcome === 'win');
            setWinnerSeat(winOut ? winOut.playerIndex : null);
          }
        } catch {
          // Bỏ qua lỗi claim mạng
        }
      }
    };

    const interval = setInterval(checkAutoClaim, 1000);
    return () => clearInterval(interval);
  }, [isGameOver, loading, currentSeat, mySeat, turnDeadline, clockOffset, matchId]);

  // 8. GỬI NƯỚC ĐI LÊN TRỌNG TÀI SERVER (SUBMIT MOVE)
  const handleMoveConfirmed = useCallback(
    async (cellIndex: number) => {
      if (
        currentSeat !== mySeat ||
        isSubmitting ||
        isGameOver ||
        transportStatus === 'failed' ||
        isResyncing
      ) {
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);

      const moveSerialized = String(cellIndex);
      const expectedMoveIndex = moveIndex;

      try {
        const res = await refereeRepository.submitMove(matchId, moveSerialized, expectedMoveIndex);

        if (res.kind === 'accepted') {
          setIsSubmitting(false);
          if (res.clock) setClock(res.clock);
          if (res.turnDeadline) setTurnDeadline(res.turnDeadline);
          if (res.serverNow) setClockOffset(computeOffset(res.serverNow));
          return;
        }

        if (res.kind === 'duplicate' || res.kind === 'stale') {
          setIsSubmitting(false);
          void resyncFromServer();
          return;
        }

        if (res.kind === 'timeout') {
          setIsSubmitting(false);
          setIsGameOver(true);
          setEndReason('timeout');
          setWinnerSeat(1 - mySeat);
          return;
        }
      } catch (err: unknown) {
        setIsSubmitting(false);
        const repoErr = err as { code?: string; isRetryable?: boolean; message?: string };

        if (repoErr.code === 'FATAL') {
          setSubmitError({
            message: repoErr.message || 'Nước đi không hợp lệ theo thẩm định của trọng tài.',
            isRetryable: false,
            moveSerialized,
            expectedMoveIndex,
          });
          return;
        }

        setSubmitError({
          message: repoErr.message || 'Lỗi mạng khi gửi nước đi. Vui lòng bấm gửi lại.',
          isRetryable: true,
          moveSerialized,
          expectedMoveIndex,
        });
      }
    },
    [
      currentSeat,
      mySeat,
      isSubmitting,
      isGameOver,
      transportStatus,
      isResyncing,
      moveIndex,
      matchId,
      resyncFromServer,
    ],
  );

  // Xử lý gửi lại nước đi khi gặp lỗi mạng RETRYABLE
  const handleRetrySubmit = useCallback(async () => {
    if (!submitError || isSubmitting) return;

    setIsSubmitting(true);
    const { moveSerialized, expectedMoveIndex } = submitError;

    try {
      const res = await refereeRepository.submitMove(matchId, moveSerialized, expectedMoveIndex);
      setIsSubmitting(false);
      setSubmitError(null);

      if (res.kind === 'duplicate' || res.kind === 'stale') {
        void resyncFromServer();
      }
    } catch (err: unknown) {
      setIsSubmitting(false);
      const repoErr = err as { message?: string };
      setSubmitError((prev) =>
        prev ? { ...prev, message: repoErr.message || 'Gửi lại thất bại. Thử lại.' } : null,
      );
    }
  }, [submitError, isSubmitting, matchId, resyncFromServer]);

  // 9. XỬ LÝ ĐẦU HÀNG / HỦY VÁN
  const handleResign = useCallback(async () => {
    try {
      setShowResignDialog(false);
      const res = await refereeRepository.resign(matchId);
      setIsGameOver(true);
      setEndReason(res.reason);
      if (res.reason === 'resign') {
        setWinnerSeat(1 - mySeat);
      } else {
        setWinnerSeat(null);
      }
    } catch {
      // Bỏ qua lỗi
    }
  }, [matchId, mySeat]);

  // Xác định chế độ chơi theo lượt (Correspondence) hay Thời gian thực (Realtime)
  const isCorrespondence = timeControl?.kind === 'correspondence';

  // 10. XỬ LÝ THOÁT KHỎI GAMESHELL AN TOÀN (P3.4c & P3.6c)
  const handleExitRequest = useCallback(() => {
    if (isGameOver) {
      navigate('/');
      return;
    }
    setShowExitDialog(true);
  }, [isGameOver, navigate]);

  const handleConfirmExit = useCallback(async () => {
    setShowExitDialog(false);
    // [LƯU Ý P3.6c]: CHẾ ĐỘ CORRESPONDENCE ĐƯỢC THOÁT TỰ DO KHÔNG RESIGN
    if (!isCorrespondence) {
      try {
        await refereeRepository.resign(matchId);
      } catch {
        // Bỏ qua
      }
    }
    navigate('/');
  }, [isCorrespondence, matchId, navigate]);

  // Xác định trạng thái lượt & Khóa bàn cờ
  // [LƯU Ý P3.5c]: Lượt của mình khi đối thủ away VẪN ĐƯỢC ĐÁNH BÌNH THƯỜNG (không khóa bàn cờ của mình)
  const isMyTurn =
    currentSeat === mySeat &&
    !isGameOver &&
    !isSubmitting &&
    !isResyncing &&
    transportStatus !== 'failed';
  const isBoardDisabled = !isMyTurn || isSubmitting || isGameOver || isResyncing;

  const matchReport: MatchResultReport = useMemo(
    () => ({
      gameId: 'caro',
      mode: isCorrespondence ? 'online_correspondence' : 'online_1v1',
      durationMs: 60000,
      participants: [
        {
          playerIndex: 0,
          outcome: winnerSeat === 0 ? 'win' : winnerSeat === 1 ? 'loss' : 'draw',
          score: winnerSeat === 0 ? 1 : 0,
        },
        {
          playerIndex: 1,
          outcome: winnerSeat === 1 ? 'win' : winnerSeat === 0 ? 'loss' : 'draw',
          score: winnerSeat === 1 ? 1 : 0,
        },
      ],
    }),
    [isCorrespondence, winnerSeat],
  );

  if (loading) {
    return <LoadingSpinner message="Đang kết nối ván đấu trực tuyến..." />;
  }

  if (initError) {
    return (
      <div
        data-testid="online-match-init-error"
        className="flex flex-col items-center justify-center min-h-[70vh] p-4 max-w-md mx-auto text-center space-y-4 animate-fade-in"
      >
        <div className="text-4xl">⚠️</div>
        <h2 className="text-base font-black text-slate-900 dark:text-white">
          Không thể tham gia ván đấu
        </h2>
        <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{initError}</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs shadow-md active:scale-95 transition-all"
        >
          Quay về Trang chủ
        </button>
      </div>
    );
  }

  return (
    <GameShell
      definition={caroManifest}
      onExit={handleExitRequest}
      isGameCompleted={true}
      hasAutoSave={false}
    >
      <div
        data-testid="caro-online-match-screen"
        className="relative flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[560px] p-2 sm:p-4 select-none"
      >
        {/* Toast thông báo Resync & Kết nối lại */}
        {resyncToast && (
          <div
            data-testid="resync-toast"
            className="w-full max-w-md mx-auto mb-2 px-3 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 text-xs text-center font-bold animate-fade-in"
          >
            🔄 {resyncToast}
          </div>
        )}

        {/* 
          ========================================================================
          BANNER TRẠNG THÁI & ĐỒNG HỒ THI ĐẤU
          ========================================================================
        */}
        <div className="w-full flex flex-col items-center gap-2 mb-2">
          {/* Header thông tin phòng & Đấu thủ */}
          <div className="w-full flex items-center justify-between px-3 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-white text-xs shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-base">👑</span>
              <span className="font-bold text-slate-200">
                Bạn:{' '}
                <span className={mySeat === 0 ? 'text-cyan-400' : 'text-rose-400'}>
                  {mySeat === 0 ? 'Quân X' : 'Quân O'}
                </span>
              </span>
            </div>

            {roomCode && (
              <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-cyan-400 border border-cyan-500/30">
                #{roomCode}
              </span>
            )}

            <div className="flex items-center gap-1.5">
              {isOpponentAway ? (
                <span
                  data-testid="opponent-away-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse"
                >
                  <span>📶❌</span>
                  <span>Mất kết nối</span>
                </span>
              ) : (
                <span
                  data-testid="opponent-presence-dot"
                  className={`w-2 h-2 rounded-full ${hasEverSeenOpponent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}
                />
              )}
              <span className="font-medium text-slate-300 truncate max-w-[90px]">
                {opponentName}
              </span>
            </div>
          </div>

          {/* Dòng phụ cảnh báo đối thủ mất kết nối & Đếm ngược hết giờ (P3.5c) */}
          {isOpponentAway && !isGameOver && currentSeat !== mySeat && turnDeadline && (
            <div
              data-testid="opponent-away-subtext"
              className="w-full px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-medium flex items-center justify-between animate-fade-in"
            >
              <div className="flex items-center gap-1.5 truncate">
                <span>⏳</span>
                <span className="truncate">
                  Đối thủ đang mất kết nối. Nếu không quay lại, bạn sẽ tự thắng khi hết giờ:
                </span>
              </div>
              <span className="font-mono font-bold flex-shrink-0 text-amber-200">
                {formatMmSs(Math.max(0, calculateRemainingMs(turnDeadline, clockOffset)))}
              </span>
            </div>
          )}

          {/* ĐỒNG HỒ / HẠN NƯỚC ĐI VÁN CỜ TRỰC TUYẾN (P3.4c & P3.6c) */}
          {isCorrespondence ? (
            <CorrespondenceDeadline
              turnDeadline={turnDeadline}
              clockOffset={clockOffset}
              isMyTurn={isMyTurn}
              isGameOver={isGameOver}
              opponentName={opponentName}
              onTick={() => hapticTap()}
            />
          ) : (
            <MatchClock
              clock={clock}
              turnDeadline={turnDeadline}
              currentSeat={currentSeat}
              mySeat={mySeat}
              opponentName={opponentName}
              clockOffset={clockOffset}
              isGameOver={isGameOver}
              onHapticTick={() => hapticTap()}
            />
          )}

          {/* Banner trạng thái MẤT KẾT NỐI — ĐANG TỰ ĐỘNG NỐI LẠI (P3.5a & P3.5b) */}
          {transportStatus === 'reconnecting' && (
            <div
              data-testid="transport-reconnecting-banner"
              className="w-full p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2 animate-pulse"
            >
              <span className="animate-spin">🔄</span>
              <span>Mất kết nối — đang kết nối lại (lần {reconnectAttempt})...</span>
            </div>
          )}

          {/* Banner trạng thái KHÔNG THỂ KẾT NỐI LẠI (FAILED) HOẶC LỖI RESYNC (P3.5b) */}
          {(transportStatus === 'failed' || resyncError) && (
            <div
              data-testid="transport-failed-banner"
              className="w-full p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between animate-shake"
            >
              <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                <span>⚠️</span>
                <span className="truncate">{resyncError || 'Không thể kết nối lại máy chủ'}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  data-testid="manual-retry-btn"
                  onClick={() => {
                    setResyncError(null);
                    void reconnect();
                    void resyncFromServer();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold active:scale-95 transition-all cursor-pointer"
                >
                  Về sảnh
                </button>
              </div>
            </div>
          )}

          {/* Banner Đang Đồng Bộ Dữ Liệu */}
          {isResyncing && (
            <div
              data-testid="resyncing-banner"
              className="w-full p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium flex items-center justify-center gap-2"
            >
              <span className="animate-spin">⏳</span>
              <span>Đang đồng bộ dữ liệu ván đấu từ máy chủ...</span>
            </div>
          )}

          {/* Banner Lỗi gửi nước đi RETRYABLE */}
          {submitError && (
            <div
              data-testid="submit-error-banner"
              className="w-full p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-between animate-shake"
            >
              <span className="truncate max-w-[240px]">{submitError.message}</span>
              {submitError.isRetryable && (
                <button
                  type="button"
                  data-testid="retry-submit-btn"
                  onClick={handleRetrySubmit}
                  disabled={isSubmitting}
                  className="px-3 py-1 rounded-xl bg-amber-600 text-white text-xs font-bold active:scale-95 transition-all"
                >
                  Gửi lại
                </button>
              )}
            </div>
          )}

          {/* Banner chỉ báo lượt đánh & Nút Đầu hàng/Hủy ván */}
          <div
            data-testid="online-turn-indicator"
            className={`flex items-center justify-between w-full px-4 py-2.5 rounded-2xl border backdrop-blur-md shadow-lg transition-all ${
              isMyTurn
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300'
                : 'bg-slate-900/80 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm border shadow-sm ${
                  currentSeat === 0
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                }`}
              >
                {currentSeat === 0 ? 'X' : 'O'}
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-bold leading-tight">
                  {isSubmitting
                    ? 'Đang xác nhận nước đi...'
                    : isResyncing
                      ? 'Đang đồng bộ...'
                      : isMyTurn
                        ? 'Lượt của bạn!'
                        : `${opponentName} đang suy nghĩ...`}
                </span>
                <span className="text-[10px] opacity-75 font-mono">Nước #{moveIndex + 1}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Spinner khi đang gửi nước */}
              {isSubmitting && (
                <span data-testid="submitting-spinner" className="animate-spin text-base">
                  ⏳
                </span>
              )}

              {/* Nút Đầu hàng / Hủy ván */}
              {!isGameOver && (
                <button
                  type="button"
                  data-testid="resign-btn"
                  onClick={() => setShowResignDialog(true)}
                  className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 active:scale-95 transition-all cursor-pointer"
                >
                  {moveIndex < 3 ? 'Hủy ván' : 'Đầu hàng'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 
          ========================================================================
          BÀN CỜ CARO TƯƠNG TÁC (INTERACTIVE BOARD)
          ========================================================================
        */}
        <div className="relative w-full flex items-center justify-center my-auto">
          <InteractiveBoard
            board={gameState.board}
            boardSize={DEFAULT_CARO_OPTIONS.boardSize}
            currentPlayer={gameState.currentPlayer}
            lastMove={lastMoveCell}
            winLine={winLine}
            disabled={isBoardDisabled}
            onMoveConfirmed={handleMoveConfirmed}
          />
        </div>

        {/* 
          ========================================================================
          OVERLAY KẾT THÚC TRẬN ĐẤU (MATCH END OVERLAY)
          ========================================================================
        */}
        {isGameOver && (
          <MatchEndOverlay
            report={matchReport}
            matchConfig={{ mode: 'online_1v1', humanSeat: mySeat }}
            moveCount={moveIndex}
            endReason={endReason}
            settledData={settledData}
            sessionScore={{
              player1Wins: winnerSeat === 0 ? 1 : 0,
              player2Wins: winnerSeat === 1 ? 1 : 0,
              draws: winnerSeat === null ? 1 : 0,
              matchNumber: 1,
            }}
            onRestart={() => navigate('/game/caro')}
            onBackToSetup={() => navigate('/game/caro')}
            onExit={() => navigate('/')}
          />
        )}

        {/* Modal xác nhận Đầu Hàng / Hủy ván */}
        <ConfirmDialog
          isOpen={showResignDialog}
          title={moveIndex < 3 ? 'Hủy ván đấu?' : 'Xác nhận đầu hàng?'}
          message={
            moveIndex < 3
              ? 'Ván đấu chưa đủ 3 nước đi. Hủy ván sẽ kết thúc trận mà không tính thắng thua cho cả 2 bên.'
              : 'Bạn có chắc chắn muốn đầu hàng? Bạn sẽ bị tính là thua ván đấu này.'
          }
          confirmText={moveIndex < 3 ? 'Hủy ván' : 'Đầu hàng'}
          cancelText="Tiếp tục chơi"
          onConfirm={handleResign}
          onCancel={() => setShowResignDialog(false)}
        />

        {/* Modal xác nhận Thoát khỏi GameShell */}
        <ConfirmDialog
          isOpen={showExitDialog}
          title={isCorrespondence ? 'Rời ván đấu?' : 'Rời khỏi ván đấu?'}
          message={
            isCorrespondence
              ? 'Ván cờ sẽ được lưu và chờ bạn quay lại. Đối thủ có thời gian để thực hiện nước đi.'
              : moveIndex < 3
                ? 'Thoát ra sẽ hủy ván đấu (không tính kết quả). Bạn có chắc chắn muốn rời phòng?'
                : 'Thoát trận giữa chừng sẽ tính là đầu hàng và bạn bị xử thua. Bạn có chắc chắn muốn rời trận?'
          }
          confirmText={isCorrespondence ? 'Rời ván' : 'Rời trận'}
          cancelText="Ở lại"
          onConfirm={handleConfirmExit}
          onCancel={() => setShowExitDialog(false)}
        />
      </div>
    </GameShell>
  );
};

export default OnlineMatchScreen;
