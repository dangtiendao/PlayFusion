/**
 * ==============================================================================
 * CARO GAME VIEW COMPONENT (GIAO DIỆN TRÒ CHƠI CỜ CARO CHÍNH THỨC)
 * ==============================================================================
 *
 * ⚠️ KIẾN TRÚC STATE MACHINE GIAO DIỆN:
 * 1. 'setup': Màn hình cấu hình chọn chế độ chơi (`ModeSelect.tsx`), hỗ trợ:
 *    - Khối "Tiếp tục ván dở 💾" (P1.5b) khi có ván lưu hợp lệ.
 *    - Nút "Chơi ngay ⚡" (P1.5a) theo cấu hình gần nhất.
 * 2. 'playing': Màn hình bàn cờ đang diễn ra trận đấu (`InteractiveBoard.tsx`).
 * 3. 'finished': Màn hình kết thúc ván đấu (`MatchEndOverlay.tsx`) mờ phủ trên bàn cờ.
 *
 * ⚠️ TÍCH HỢP AUTO-SAVE & KHÔI PHỤC VÁN DỞ (P1.5b):
 * - Auto-save: Sau MỖI nước đi hợp lệ (cả người lẫn máy) khi ván chưa kết thúc.
 *   + Ghi chú hiệu năng: Trạng thái bàn cờ Caro 15x15 sau khi serialize chỉ ~300 bytes chuỗi JSON nén,
 *     việc ghi vào storage sau mỗi nước đi là tức thời (<1ms) và hoàn toàn an toàn.
 *   + Tránh lưu khi AI đang suy nghĩ để loại bỏ nguy cơ khôi phục ra trạng thái "AI nghĩ mãi".
 * - Xóa save: Ngay khi ván kết thúc (terminal) hoặc khi người chơi bắt đầu ván mới/hủy ván.
 * - Pipeline khôi phục 6 bước (a-f): Tuyệt đối không có trạng thái nửa vời, hỏng là xóa sạch.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { GameViewProps } from '../types';
import type { MatchResultReport, MatchResultParticipant } from '@engines/types';
import { caroEngine, DEFAULT_CARO_OPTIONS, checkWinAt, type CaroState } from '@engines/caro';
import { InteractiveBoard, ModeSelect, MatchEndOverlay, type SessionScore } from './components';
import type { CaroMatchConfig, CaroScreen, CaroSavedSessionExtra } from './types';
import { getAiLevelLabel } from '../labels';
import { useCaroAi } from './useCaroAi';
import {
  getStats,
  recordResult,
  getLastConfig,
  setLastConfig,
  saveMatch,
  getSavedMatch,
  clearSavedMatch,
  type GameLocalStats,
  type SavedMatch,
} from '../../core/gameLocalData';

export const CaroGameView: React.FC<GameViewProps> = ({
  definition,
  isPaused = false,
  onGameEnd,
  shellApi,
}) => {
  // 1. Quản lý trạng thái màn hình (State Machine: 'setup' | 'playing' | 'finished')
  const [screen, setScreen] = useState<CaroScreen>('setup');

  // 2. Cấu hình trận đấu được chọn từ màn hình setup
  const [matchConfig, setMatchConfig] = useState<CaroMatchConfig | null>(null);

  // 3. Cấu hình gần nhất đã lưu trong Local Data (P1.5a)
  const [lastConfig, setLastConfigState] = useState<CaroMatchConfig | null>(() =>
    getLastConfig<CaroMatchConfig>('caro'),
  );

  // 4. Ván đấu dở dang đã lưu trong Local Data (P1.5b)
  const [savedMatch, setSavedMatchState] = useState<SavedMatch | null>(() => getSavedMatch('caro'));

  // 5. Toast thông báo lỗi khôi phục ván dở (nếu có)
  const [recoveryToast, setRecoveryToast] = useState<string | null>(null);

  // 6. Thống kê tích lũy toàn cục lưu trong Local Data (P1.5a)
  const [accumulatedStats, setAccumulatedStats] = useState<GameLocalStats | null>(() =>
    getStats('caro'),
  );

  // 7. Tỷ số phiên đấu hiện tại (Session Score - in-memory)
  const [sessionScore, setSessionScore] = useState<SessionScore>({
    player1Wins: 0,
    player2Wins: 0,
    draws: 0,
    matchNumber: 1,
  });

  const sessionScoreRef = useRef(sessionScore);
  useEffect(() => {
    sessionScoreRef.current = sessionScore;
  }, [sessionScore]);

  // 8. Trạng thái bàn cờ Caro Engine thuần
  const [gameState, setGameState] = useState<CaroState>(() =>
    caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    }),
  );

  // 9. State quản lý kết thúc ván đấu
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [, setWinner] = useState<number | null>(null); // 0: X, 1: O, null: Hòa / Chưa xong
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [latestReport, setLatestReport] = useState<MatchResultReport | null>(null);

  // 10. Seed ngẫu nhiên cố định cho mỗi ván đấu (để tái lập ván cờ khi debug / replay)
  const matchSeedRef = useRef<string>(`caro_seed_${Date.now()}`);

  // 11. Quản lý thời gian để lập MatchResultReport
  const startTimeRef = useRef<number>(Date.now());
  const reportSentRef = useRef<boolean>(false);

  // 12. Hook quản lý Web Worker AI Cờ Caro
  const { requestMove, isThinking, cancel } = useCaroAi({ minDelayMs: 500 });

  // ============================================================================
  // HÀM DÙNG CHUNG THỰC THI NƯỚC ĐI (UNIFIED MOVE EXECUTION + AUTO-SAVE P1.5b)
  // ============================================================================
  const executeMove = useCallback(
    (cellIndex: number, playerIndex: number) => {
      if (isGameOver) return;

      try {
        setErrorMessage(null);
        setAiError(null);

        // 1. Áp dụng nước đi qua Caro Engine thuần
        const nextState = caroEngine.applyMove(gameState, cellIndex, playerIndex);
        setGameState(nextState);

        // 2. Phát âm thanh đặt quân (cho cả người và máy)
        shellApi?.playSfx('click');

        // 3. Kiểm tra xem ván cờ đã đạt trạng thái kết thúc (Terminal) hay chưa
        const terminalResult = caroEngine.isTerminal(nextState);

        if (terminalResult.over) {
          // ====================================================================
          // VÁN ĐÃ KẾT THÚC: XÓA SẠCH VÁN LƯU DỞ DANG NGAY LẬP TỨC (P1.5b)
          // ====================================================================
          clearSavedMatch('caro');
          setSavedMatchState(null);

          setIsGameOver(true);
          setScreen('finished');

          const winOutcome = terminalResult.outcomes?.find((o) => o.outcome === 'win');

          if (winOutcome !== undefined) {
            // Có người thắng: Tìm chuỗi 5 quân thắng cuộc để highlight trên bàn cờ
            const winCheck = checkWinAt(
              nextState.board,
              nextState.options.boardSize,
              cellIndex,
              nextState.options,
            );

            setWinner(winOutcome.playerIndex);
            setWinLine(winCheck?.line ? [...winCheck.line] : null);
          } else {
            // Hòa cờ
            setWinner(null);
            setWinLine(null);
          }

          // 4. Lập báo cáo kết quả trận đấu chuẩn MatchResultReport
          const durationMs = Date.now() - startTimeRef.current;
          const participants: MatchResultParticipant[] =
            winOutcome !== undefined
              ? [
                  {
                    playerIndex: winOutcome.playerIndex,
                    outcome: 'win',
                  },
                  {
                    playerIndex: winOutcome.playerIndex === 0 ? 1 : 0,
                    outcome: 'loss',
                  },
                ]
              : [
                  { playerIndex: 0, outcome: 'draw' },
                  { playerIndex: 1, outcome: 'draw' },
                ];

          const report: MatchResultReport = {
            gameId: 'caro',
            mode: matchConfig?.mode ?? 'local_pvp',
            participants,
            durationMs,
          };

          setLatestReport(report);

          // 5. Ghi nhận kết quả vào Tầng dữ liệu Local Data (P1.5a)
          const isVsAiMode = matchConfig?.mode === 'vs_ai';
          const currentHumanSeat = matchConfig?.humanSeat ?? 0;
          const modeKey = isVsAiMode ? `vs_ai:${matchConfig.aiLevel ?? 'easy'}` : 'local_pvp';

          let outcomeType: 'win' | 'loss' | 'draw' | 'none' = 'none';
          if (winOutcome === undefined) {
            outcomeType = 'draw';
          } else if (isVsAiMode) {
            outcomeType = winOutcome.playerIndex === currentHumanSeat ? 'win' : 'loss';
          } else {
            // local_pvp có thắng/thua nhưng không ghi nhận win/loss cá nhân
            outcomeType = 'none';
          }

          const updatedStats = recordResult('caro', modeKey, outcomeType);
          setAccumulatedStats(updatedStats);

          // 6. Cập nhật tỷ số phiên đấu (Session Score - in-memory)
          setSessionScore((prev) => {
            let p1Won = false;
            let p2Won = false;
            let isDrawMatch = false;

            if (winOutcome !== undefined) {
              if (isVsAiMode) {
                if (winOutcome.playerIndex === currentHumanSeat) {
                  p1Won = true;
                } else {
                  p2Won = true;
                }
              } else {
                if (winOutcome.playerIndex === 0) {
                  p1Won = true;
                } else {
                  p2Won = true;
                }
              }
            } else {
              isDrawMatch = true;
            }

            return {
              player1Wins: prev.player1Wins + (p1Won ? 1 : 0),
              player2Wins: prev.player2Wins + (p2Won ? 1 : 0),
              draws: prev.draws + (isDrawMatch ? 1 : 0),
              matchNumber: prev.matchNumber,
            };
          });

          // Gửi báo cáo kết quả trận đấu cho GameShell / App store
          if (onGameEnd && !reportSentRef.current) {
            reportSentRef.current = true;
            onGameEnd(report);
          }
        } else {
          // ====================================================================
          // VÁN ĐANG DIỄN RA: TỰ ĐỘNG LƯU TRẠNG THÁI VÁN DỞ (AUTO-SAVE P1.5b)
          // ====================================================================
          // Chỉ lưu tại thời điểm state ổn định NGAY SAU applyMove (không lưu giữa chừng lúc AI nghĩ)
          if (matchConfig) {
            const serialized = caroEngine.serialize(nextState);
            const sessionExtra: CaroSavedSessionExtra = {
              sessionScore: sessionScoreRef.current,
              matchSeed: matchSeedRef.current,
            };

            saveMatch('caro', {
              schemaVersion: 1,
              engineStateSerialized: serialized,
              gameConfig: matchConfig,
              sessionExtra,
              savedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err: unknown) {
        // Bắt lỗi EngineError (ô không hợp lệ, sai lượt)
        const msg = err instanceof Error ? err.message : 'Nước đi không hợp lệ';
        setErrorMessage(msg);
        shellApi?.hapticError();
        shellApi?.playSfx('error');
      }
    },
    [isGameOver, gameState, matchConfig, onGameEnd, shellApi],
  );

  // ============================================================================
  // CÁC HÀM CHUYỂN TRẠNG THÁI (STATE MACHINE TRANSITIONS & RECOVERY PIPELINE)
  // ============================================================================

  // Bắt đầu ván đấu mới từ ModeSelect (setup -> playing)
  const handleStartMatch = useCallback((config: CaroMatchConfig) => {
    // Xóa ván dở cũ (nếu có) khi người chơi chủ động bắt đầu ván mới
    clearSavedMatch('caro');
    setSavedMatchState(null);
    setRecoveryToast(null);

    // Lưu cấu hình gần nhất vào Local Data (P1.5a)
    setLastConfig('caro', config);
    setLastConfigState(config);

    setMatchConfig(config);
    setSessionScore({
      player1Wins: 0,
      player2Wins: 0,
      draws: 0,
      matchNumber: 1,
    });
    setGameState(
      caroEngine.init({
        playerCount: 2,
        options: DEFAULT_CARO_OPTIONS,
      }),
    );
    setIsGameOver(false);
    setWinLine(null);
    setWinner(null);
    setErrorMessage(null);
    setAiError(null);
    setLatestReport(null);
    matchSeedRef.current = `caro_seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
  }, []);

  /**
   * LUỒNG KHÔI PHỤC VÁN DỞ (PIPELINE A-F - P1.5b)
   * Toàn bộ pipeline được bọc trong try/catch: Bất kỳ bước a-c nào lỗi -> dọn sạch và báo Toast.
   */
  const handleResumeSavedMatch = useCallback(() => {
    setRecoveryToast(null);
    const currentSaved = getSavedMatch('caro');

    if (!currentSaved) {
      setSavedMatchState(null);
      return;
    }

    try {
      // (a) Validate gameConfig đúng cấu trúc CaroMatchConfig và hợp lệ với manifest
      const cfg = currentSaved.gameConfig as CaroMatchConfig | undefined;
      if (!cfg || !definition.modes.includes(cfg.mode)) {
        throw new Error('Cấu hình chế độ chơi không còn tương thích');
      }
      if (cfg.mode === 'vs_ai') {
        const availableAiLevels = definition.aiLevels ?? ['easy', 'medium', 'hard'];
        if (!cfg.aiLevel || !availableAiLevels.includes(cfg.aiLevel)) {
          throw new Error('Cấp độ AI không còn được hỗ trợ');
        }
      }

      // (b) caroEngine.deserialize(engineStateSerialized) — throw EngineError nếu dữ liệu hỏng
      const restoredState = caroEngine.deserialize(currentSaved.engineStateSerialized);

      // (c) Đối chiếu chéo: isTerminal(restoredState).over phải là false (ván chưa xong)
      const terminalCheck = caroEngine.isTerminal(restoredState);
      if (terminalCheck.over) {
        throw new Error('Ván cờ đã kết thúc, không thể tiếp tục');
      }

      // (d) Khôi phục sessionExtra (validate, nếu hỏng thì dùng giá trị an toàn)
      const extra = currentSaved.sessionExtra as CaroSavedSessionExtra | undefined;
      if (
        extra?.sessionScore &&
        typeof extra.sessionScore.player1Wins === 'number' &&
        typeof extra.sessionScore.player2Wins === 'number'
      ) {
        setSessionScore(extra.sessionScore);
      }
      if (extra?.matchSeed && typeof extra.matchSeed === 'string') {
        matchSeedRef.current = extra.matchSeed;
      }

      // (e) Khôi phục thành công -> Chuyển sang màn hình PLAYING
      setMatchConfig(cfg);
      setGameState(restoredState);
      setIsGameOver(false);
      setWinLine(null);
      setWinner(null);
      setErrorMessage(null);
      setAiError(null);
      setLatestReport(null);
      startTimeRef.current = Date.now();
      reportSentRef.current = false;
      setSavedMatchState(null);
      setScreen('playing');

      shellApi?.playSfx('click');
      shellApi?.hapticSuccess();
    } catch (err: unknown) {
      // (f) BẤT KỲ bước nào fail -> clearSavedMatch + toast lỗi + ở lại setup bình thường
      clearSavedMatch('caro');
      setSavedMatchState(null);
      const msg = err instanceof Error ? err.message : 'Dữ liệu ván cờ bị hỏng';
      setRecoveryToast(`⚠️ Ván lưu bị lỗi: ${msg}. Đã tự động dọn dẹp.`);
      shellApi?.playSfx('error');
      shellApi?.hapticError();
    }
  }, [definition, shellApi]);

  // Hủy bỏ ván dở từ ModeSelect
  const handleDiscardSavedMatch = useCallback(() => {
    clearSavedMatch('caro');
    setSavedMatchState(null);
    setRecoveryToast(null);
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [shellApi]);

  // Chơi lại ván mới giữ nguyên cấu hình đã chọn (trong lúc đang chơi hoặc nút reset nhanh)
  const handleResetGame = useCallback(() => {
    cancel();
    clearSavedMatch('caro');
    setSavedMatchState(null);

    setGameState(
      caroEngine.init({
        playerCount: 2,
        options: DEFAULT_CARO_OPTIONS,
      }),
    );
    setIsGameOver(false);
    setWinLine(null);
    setWinner(null);
    setErrorMessage(null);
    setAiError(null);
    setLatestReport(null);
    matchSeedRef.current = `caro_seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [cancel, shellApi]);

  /**
   * Chơi lại ván mới KÈM ĐỔI BÊN ĐI TRƯỚC (Sau khi ván kết thúc - Luật công bằng Caro)
   */
  const handleRestartWithSwap = useCallback(() => {
    cancel();
    clearSavedMatch('caro');
    setSavedMatchState(null);

    // 1. Cập nhật cấu hình đổi bên đi trước
    let nextConfig = matchConfig;
    if (matchConfig) {
      if (matchConfig.mode === 'vs_ai') {
        // Đảo ghế người chơi (0 -> 1 hoặc 1 -> 0)
        const nextHumanSeat = (matchConfig.humanSeat ?? 0) === 0 ? 1 : 0;
        nextConfig = { ...matchConfig, humanSeat: nextHumanSeat };
      }
      setMatchConfig(nextConfig);
    }

    // 2. Tăng số thứ tự ván trong phiên
    setSessionScore((prev) => ({
      ...prev,
      matchNumber: prev.matchNumber + 1,
    }));

    // 3. Khởi tạo lại bàn cờ mới
    setGameState(
      caroEngine.init({
        playerCount: 2,
        options: DEFAULT_CARO_OPTIONS,
      }),
    );
    setIsGameOver(false);
    setWinLine(null);
    setWinner(null);
    setErrorMessage(null);
    setAiError(null);
    setLatestReport(null);
    matchSeedRef.current = `caro_seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
  }, [cancel, matchConfig]);

  // Quay lại màn hình chọn chế độ chơi (finished/playing -> setup)
  const handleBackToSetup = useCallback(() => {
    cancel();
    setMatchConfig(null);
    setIsGameOver(false);
    setWinLine(null);
    setWinner(null);
    setErrorMessage(null);
    setAiError(null);
    setLatestReport(null);
    reportSentRef.current = false;
    // Cập nhật lại lastConfig & savedMatch từ Storage khi về setup
    setLastConfigState(getLastConfig<CaroMatchConfig>('caro'));
    setSavedMatchState(getSavedMatch('caro'));
    setScreen('setup');
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [cancel, shellApi]);

  // Người chơi xác nhận đánh nước cờ trên bàn
  const handleHumanMoveConfirmed = useCallback(
    (cellIndex: number) => {
      if (isPaused || isGameOver || isThinking) return;

      const isVsAi = matchConfig?.mode === 'vs_ai';
      const humanSeat = matchConfig?.humanSeat ?? 0;

      // Trong chế độ đấu máy: Chỉ cho phép người đánh khi đúng lượt của người
      if (isVsAi && gameState.currentPlayer !== humanSeat) {
        return;
      }

      executeMove(cellIndex, gameState.currentPlayer);
    },
    [isPaused, isGameOver, isThinking, matchConfig, gameState.currentPlayer, executeMove],
  );

  // ============================================================================
  // XỬ LÝ LƯỢT ĐI CỦA BOT AI QUA USE_CARO_AI
  // ============================================================================
  const isVsAi = matchConfig?.mode === 'vs_ai';
  const humanSeat = matchConfig?.humanSeat ?? 0;
  const isAiTurn = isVsAi && gameState.currentPlayer !== humanSeat;

  // Biến retry trigger để người dùng có thể bấm "Thử lại lượt máy" khi gặp lỗi
  const [retryCounter, setRetryCounter] = useState(0);
  const handleRetryAi = useCallback(() => {
    setAiError(null);
    setRetryCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    // Điều kiện kích hoạt lượt máy:
    // Đang trong màn hình playing, chế độ vs_ai, ván chưa kết thúc, không bị pause, đúng lượt máy
    if (screen !== 'playing' || !isVsAi || isGameOver || isPaused || !isAiTurn) {
      return;
    }

    let isEffectActive = true;

    const runAiCalculation = async () => {
      try {
        setAiError(null);
        const aiSeat = gameState.currentPlayer;

        // Gửi yêu cầu tính toán sang Web Worker
        const aiMove = await requestMove(gameState, {
          level: matchConfig?.aiLevel ?? 'easy',
          seed: matchSeedRef.current,
        });

        // Nếu effect đã bị cleanup (do unmount, reset, hoặc pause), hủy bỏ việc apply nước đi
        if (!isEffectActive) {
          return;
        }

        executeMove(aiMove, aiSeat);
      } catch (err: unknown) {
        if (!isEffectActive) {
          return;
        }

        // Nếu là lỗi bị hủy (CARO_AI_REQUEST_CANCELLED) do pause/reset thì bỏ qua an toàn
        if (err instanceof Error && err.message === 'CARO_AI_REQUEST_CANCELLED') {
          return;
        }

        // Xử lý khi Worker bị crash / lỗi thuật toán -> hiện thông báo lỗi kèm nút thử lại
        const msg = err instanceof Error ? err.message : 'Lỗi tính toán không xác định';
        setAiError(`Máy gặp lỗi tính toán: ${msg}`);
        shellApi?.playSfx('error');
        shellApi?.hapticError();
      }
    };

    runAiCalculation();

    // Cleanup effect: Hủy bỏ worker tính toán và đánh dấu effect không còn active
    return () => {
      isEffectActive = false;
      cancel();
    };
  }, [
    screen,
    isVsAi,
    isGameOver,
    isPaused,
    isAiTurn,
    gameState,
    matchConfig?.aiLevel,
    requestMove,
    cancel,
    executeMove,
    shellApi,
    retryCounter,
  ]);

  // ============================================================================
  // RENDER MÀN HÌNH 1: SETUP (CHỌN CHẾ ĐỘ CHƠI + TIẾP TỤC VÁN DỞ)
  // ============================================================================
  if (screen === 'setup') {
    return (
      <div className="w-full flex flex-col items-center">
        {recoveryToast && (
          <div
            data-testid="recovery-toast"
            className="w-full max-w-md mx-auto mb-3 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs text-center font-medium animate-shake"
          >
            {recoveryToast}
          </div>
        )}
        <ModeSelect
          definition={definition}
          savedMatch={savedMatch}
          onResumeSavedMatch={handleResumeSavedMatch}
          onDiscardSavedMatch={handleDiscardSavedMatch}
          lastConfig={lastConfig}
          onStart={handleStartMatch}
          shellApi={shellApi}
        />
      </div>
    );
  }

  // ============================================================================
  // RENDER MÀN HÌNH 2 & 3: PLAYING & FINISHED (KÈM MATCH_END_OVERLAY)
  // ============================================================================
  const isBoardDisabled = isPaused || isGameOver || isThinking || isAiTurn;

  return (
    <div
      data-testid="caro-game-view"
      className="relative flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[560px] p-2 sm:p-4 select-none"
    >
      {/* 
        ========================================================================
        BANNER THÔNG TIN LƯỢT ĐÁNH & TỶ SỐ PHIÊN ĐẤU
        ========================================================================
      */}
      <div className="w-full flex flex-col items-center gap-1.5 mb-2">
        <div
          data-testid="turn-indicator"
          className="flex items-center justify-between w-full px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-lg"
        >
          <div className="flex items-center gap-2.5">
            {/* Icon quân cờ của lượt hiện tại */}
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm border shadow-sm ${
                gameState.currentPlayer === 0
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-cyan-500/10'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-rose-500/10'
              }`}
            >
              {gameState.currentPlayer === 0 ? 'X' : 'O'}
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">
                  Ván {sessionScore.matchNumber}
                </span>
                {sessionScore.matchNumber > 1 && (
                  <span className="text-[11px] text-slate-400 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
                    {sessionScore.player1Wins} - {sessionScore.player2Wins}
                  </span>
                )}
              </div>

              <span
                className={`text-sm font-bold ${
                  gameState.currentPlayer === 0 ? 'text-cyan-400' : 'text-rose-400'
                }`}
              >
                {isVsAi ? (
                  isAiTurn || isThinking ? (
                    <span data-testid="ai-thinking-indicator" className="flex items-center gap-1.5">
                      <span>🤖 Máy đang suy nghĩ</span>
                      {/* 3 chấm động CSS với prefers-reduced-motion */}
                      <span className="inline-flex items-center gap-0.5 pt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce motion-reduce:animate-none" />
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce motion-reduce:animate-none [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce motion-reduce:animate-none [animation-delay:0.4s]" />
                      </span>
                      <span className="text-xs font-normal opacity-80">
                        ({getAiLevelLabel(matchConfig?.aiLevel ?? 'easy')})
                      </span>
                    </span>
                  ) : (
                    `Lượt của bạn (Quân ${gameState.currentPlayer === 0 ? 'X' : 'O'})`
                  )
                ) : (
                  `Quân ${gameState.currentPlayer === 0 ? 'X' : 'O'} (2 người 1 máy)`
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs text-slate-400 font-medium">Nước đi</span>
              <p className="text-sm font-bold text-slate-200">{gameState.moveCount + 1}</p>
            </div>

            {/* Nút reset ván nhanh trong khi chơi */}
            <button
              type="button"
              data-testid="in-game-reset-btn"
              onClick={handleResetGame}
              title="Chơi lại ván mới"
              className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-xs shadow-sm active:scale-95 transition-all"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Thông báo lỗi nước đi */}
        {errorMessage && (
          <div
            data-testid="error-banner"
            className="w-full px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs text-center font-medium animate-shake"
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Thông báo lỗi AI kèm nút thử lại */}
        {aiError && (
          <div
            data-testid="ai-error-banner"
            className="w-full px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between font-medium animate-shake"
          >
            <span>⚠️ {aiError}</span>
            <button
              type="button"
              data-testid="retry-ai-btn"
              onClick={handleRetryAi}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-900 font-bold text-xs hover:bg-amber-400 active:scale-95 transition-all"
            >
              Đi lại lượt máy
            </button>
          </div>
        )}
      </div>

      {/* 
        ========================================================================
        BÀN CỜ TƯƠNG TÁC CHÍNH (INTERACTIVE BOARD)
        ========================================================================
      */}
      <InteractiveBoard
        board={gameState.board}
        boardSize={gameState.options.boardSize}
        lastMove={gameState.lastMove}
        winLine={winLine}
        disabled={isBoardDisabled}
        currentPlayer={gameState.currentPlayer}
        onMoveConfirmed={handleHumanMoveConfirmed}
        onSfx={(name) => shellApi?.playSfx(name)}
      />

      {/* 
        ========================================================================
        OVERLAY MÀN HÌNH KẾT THÚC TRẬN ĐẤU (MATCH END OVERLAY)
        ========================================================================
      */}
      {screen === 'finished' && latestReport && matchConfig && (
        <MatchEndOverlay
          report={latestReport}
          matchConfig={matchConfig}
          moveCount={gameState.moveCount}
          sessionScore={sessionScore}
          accumulatedStats={accumulatedStats}
          onRestart={handleRestartWithSwap}
          onBackToSetup={handleBackToSetup}
          shellApi={shellApi}
        />
      )}
    </div>
  );
};

export default CaroGameView;
