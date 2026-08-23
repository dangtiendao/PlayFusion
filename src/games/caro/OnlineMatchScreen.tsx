/**
 * ==============================================================================
 * CARO ONLINE MATCH SCREEN (SRC/GAMES/CARO/ONLINEMATCHSCREEN.TSX)
 * ==============================================================================
 *
 * MÀN HÌNH VÁN ĐẤU CARO ONLINE 1V1 HOÀN CHỈNH (PHASE P3.3C & P3.4C)
 *
 * NGUYÊN TẮC BẤT BIẾN:
 * 1. SERVER LÀ NGUỒN CHÂN LÝ DUY NHẤT (SERVER-DRIVEN CLOCK & STATE):
 *    - Toàn bộ thay đổi thế cờ và phán quyết thời gian đến từ Server.
 *    - Client TUYỆT ĐỐI KHÔNG áp dụng Optimistic move và KHÔNG tự phán thắng/thua khi giờ về 0.
 * 2. BÙ LỆCH GIỜ & AUTO-CLAIM (P3.4c):
 *    - Tính `clockOffset` mỗi khi nhận `serverNow`.
 *    - Tự động gọi `claimTimeout` khi đối thủ quá hạn (Grace 2s + 1s đệm = -3000ms).
 * 3. ĐẦU HÀNG & HỦY VÁN THEO NGƯỠNG (THRESHOLD ABORT / RESIGN):
 *    - Trước nước 3: Nhãn "Hủy ván" (kết thúc abort, không tính kết quả).
 *    - Từ nước 3: Nhãn "Đầu hàng" (kết thúc resign, người thoát/hàng bị xử thua).
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
import { InteractiveBoard, MatchEndOverlay } from './components';
import { MatchClock } from './components/MatchClock';
import { useMatchChannel, type PresenceMember } from '@/transport';
import { refereeRepository } from '@/repositories/refereeRepository';
import { matchRepository } from '@/repositories/matchRepository';
import { useAuthStore } from '@/stores/authStore';
import { computeOffset, calculateRemainingMs } from '@/core/serverClock';
import { hapticTap } from '@/core/haptics';

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

  // 1. STATE MÁY TRẠNG THÁI VÁN ĐẤU
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [gameState, setGameState] = useState<CaroState>(() =>
    caroEngine.init({ playerCount: 2, options: DEFAULT_CARO_OPTIONS }),
  );
  const [moveIndex, setMoveIndex] = useState(0);
  const [currentSeat, setCurrentSeat] = useState(0);
  const [lastMoveCell, setLastMoveCell] = useState<number | null>(null);

  // ĐỒNG HỒ & BÙ LỆCH GIỜ (P3.4c)
  const [clock, setClock] = useState<Record<string, number> | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState<number>(0);

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

  // Thông tin đối thủ & Toast đồng bộ
  const [opponentName, setOpponentName] = useState<string>('Đối thủ');
  const [resyncToast, setResyncToast] = useState<string | null>(null);

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

  // 2. KHỞI TẠO VÁN ĐẤU (INIT MATCH IDEMPOTENT)
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

      // Nạp thông tin đối thủ từ bảng match_participants
      try {
        const matchDetail = await matchRepository.getMatchById(matchId);
        if (matchDetail) {
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

  // 3. XỬ LÝ NHẬN BROADCAST REALTIME TỪ MÁY CHỦ
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

        // TH 3: LỆCH NHỊP / MISS BROADCAST (p.moveIndex > currentLocalIndex + 1)
        try {
          const freshState = await matchRepository.getLiveState(matchId);
          if (freshState) {
            setGameState(caroEngine.deserialize(freshState.stateSerialized));
            setMoveIndex(freshState.moveIndex);
            setCurrentSeat(freshState.currentSeat);
            if (freshState.clock) setClock(freshState.clock);
            if (freshState.turnDeadline) setTurnDeadline(freshState.turnDeadline);
            hasClaimedRef.current = false;

            setResyncToast('Đã đồng bộ lại thế cờ mới nhất với máy chủ');
            setTimeout(() => setResyncToast(null), 3000);
          }
        } catch {
          // Bỏ qua lỗi resync mạng tạm thời
        }
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
      }
    },
    [matchId],
  );

  // 4. KẾT NỐI REALTIME TRANSPORT QUA USEMATCHCHANNEL
  const {
    status: transportStatus,
    members,
    reconnect,
  } = useMatchChannel({
    matchId: isGameOver ? null : matchId,
    self: selfMember,
    enabled: !loading && !isGameOver,
    onMessage: handleRealtimeMessage,
  });

  // 5. AUTO-CLAIM TIMEOUT KHI ĐỐI THỦ QUÁ HẠN (P3.4c)
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

  // 6. GỬI NƯỚC ĐI LÊN TRỌNG TÀI SERVER (SUBMIT MOVE)
  const handleMoveConfirmed = useCallback(
    async (cellIndex: number) => {
      if (currentSeat !== mySeat || isSubmitting || isGameOver || transportStatus !== 'connected') {
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
          if (res.stateSerialized) {
            setGameState(caroEngine.deserialize(res.stateSerialized));
            if (res.moveIndex !== undefined) setMoveIndex(res.moveIndex);
            if ('currentSeat' in res && typeof res.currentSeat === 'number') {
              setCurrentSeat(res.currentSeat);
            }
            if ('clock' in res && res.clock) setClock(res.clock);
            if ('turnDeadline' in res && res.turnDeadline) setTurnDeadline(res.turnDeadline);
            if ('serverNow' in res && res.serverNow) setClockOffset(computeOffset(res.serverNow));

            setResyncToast('Đã đồng bộ lại thế cờ với máy chủ');
            setTimeout(() => setResyncToast(null), 3000);
          }
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
    [currentSeat, mySeat, isSubmitting, isGameOver, transportStatus, moveIndex, matchId],
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
        if (res.stateSerialized) {
          setGameState(caroEngine.deserialize(res.stateSerialized));
          if (res.moveIndex !== undefined) setMoveIndex(res.moveIndex);
          if ('currentSeat' in res && typeof res.currentSeat === 'number') {
            setCurrentSeat(res.currentSeat);
          }
        }
      }
    } catch (err: unknown) {
      setIsSubmitting(false);
      const repoErr = err as { message?: string };
      setSubmitError((prev) =>
        prev ? { ...prev, message: repoErr.message || 'Gửi lại thất bại. Thử lại.' } : null,
      );
    }
  }, [submitError, isSubmitting, matchId]);

  // Xử lý kết nối lại thủ công khi mất mạng
  const handleReconnect = useCallback(async () => {
    try {
      await reconnect();
      const freshState = await matchRepository.getLiveState(matchId);
      if (freshState) {
        setGameState(caroEngine.deserialize(freshState.stateSerialized));
        setMoveIndex(freshState.moveIndex);
        setCurrentSeat(freshState.currentSeat);
        if (freshState.clock) setClock(freshState.clock);
        if (freshState.turnDeadline) setTurnDeadline(freshState.turnDeadline);
        setResyncToast('Đã kết nối lại và đồng bộ thế cờ thành công');
        setTimeout(() => setResyncToast(null), 3000);
      }
    } catch {
      // Bỏ qua lỗi
    }
  }, [reconnect, matchId]);

  // 7. XỬ LÝ ĐẦU HÀNG / HỦY VÁN
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

  // 8. XỬ LÝ THOÁT KHỎI GAMESHELL AN TOÀN
  const handleExitRequest = useCallback(() => {
    if (isGameOver) {
      navigate('/');
      return;
    }
    setShowExitDialog(true);
  }, [isGameOver, navigate]);

  const handleConfirmExit = useCallback(async () => {
    setShowExitDialog(false);
    try {
      await refereeRepository.resign(matchId);
    } catch {
      // Bỏ qua
    }
    navigate('/');
  }, [matchId, navigate]);

  // Xác định trạng thái lượt & Khóa bàn cờ
  const isMyTurn =
    currentSeat === mySeat && !isGameOver && !isSubmitting && transportStatus === 'connected';
  const isBoardDisabled = !isMyTurn || isSubmitting || isGameOver;

  const isOpponentOnline = useMemo(() => {
    return members.some((m) => m.userId !== user?.id);
  }, [members, user?.id]);

  const matchReport: MatchResultReport = useMemo(
    () => ({
      gameId: 'caro',
      mode: 'online_1v1',
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
    [winnerSeat],
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
      isGameCompleted={isGameOver}
      hasAutoSave={false}
    >
      <div
        data-testid="caro-online-match-screen"
        className="relative flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[560px] p-2 sm:p-4 select-none"
      >
        {/* Toast thông báo Resync */}
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
              <span
                data-testid="opponent-presence-dot"
                className={`w-2 h-2 rounded-full ${isOpponentOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}
              />
              <span className="font-medium text-slate-300 truncate max-w-[90px]">
                {opponentName}
              </span>
            </div>
          </div>

          {/* ĐỒNG HỒ VÁN CỜ TRỰC TUYẾN (P3.4c) */}
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

          {/* Banner trạng thái mạng MẤT KẾT NỐI */}
          {transportStatus === 'error' && (
            <div
              data-testid="transport-error-banner"
              className="w-full p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between animate-shake"
            >
              <div className="flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Mất kết nối máy chủ</span>
              </div>
              <button
                type="button"
                data-testid="reconnect-btn"
                onClick={handleReconnect}
                className="px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold active:scale-95 transition-all"
              >
                Kết nối lại
              </button>
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
                  className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 active:scale-95 transition-all"
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
          title="Rời khỏi ván đấu?"
          message={
            moveIndex < 3
              ? 'Thoát ra sẽ hủy ván đấu (không tính kết quả). Bạn có chắc chắn muốn rời phòng?'
              : 'Thoát trận giữa chừng sẽ tính là đầu hàng và bạn bị xử thua. Bạn có chắc chắn muốn rời trận?'
          }
          confirmText="Rời trận"
          cancelText="Ở lại"
          onConfirm={handleConfirmExit}
          onCancel={() => setShowExitDialog(false)}
        />
      </div>
    </GameShell>
  );
};

export default OnlineMatchScreen;
