/**
 * ==============================================================================
 * CARO GAME VIEW COMPONENT (GIAO DIỆN TRÒ CHƠI CỜ CARO CHÍNH THỨC)
 * ==============================================================================
 *
 * ⚠️ KIẾN TRÚC STATE MACHINE GIAO DIỆN:
 * 1. 'setup': Màn hình cấu hình chọn chế độ chơi (`ModeSelect.tsx`).
 * 2. 'playing': Màn hình bàn cờ đang diễn ra trận đấu (`InteractiveBoard.tsx`).
 * 3. 'finished': Màn hình kết thúc ván đấu (`MatchEndOverlay.tsx`) mờ phủ trên bàn cờ.
 *
 * ⚠️ TÍNH NĂNG NÂNG CAO PHASE P1.4c:
 * - Màn hình kết thúc `MatchEndOverlay` xuất hiện sau 800ms, giữ bàn cờ mờ nền sau.
 * - Hiệu ứng Confetti CSS nhẹ khi chiến thắng, tự động tắt khi bật `prefers-reduced-motion`.
 * - Đổi lượt đi trước khi Chơi lại (`handleRestartWithSwap`):
 *   + vs_ai: Đảo `humanSeat` (Ván 1 người X -> Ván 2 người O máy mở màn).
 *   + local_pvp: Đảo người đi trước giữa 2 người chơi.
 * - Đếm tỷ số phiên đấu trong bộ nhớ (`SessionScore`: thắng/thua/hòa/ván số).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { GameViewProps } from '../types';
import type { MatchResultReport, MatchResultParticipant } from '@engines/types';
import { caroEngine, DEFAULT_CARO_OPTIONS, checkWinAt, type CaroState } from '@engines/caro';
import { InteractiveBoard, ModeSelect, MatchEndOverlay, type SessionScore } from './components';
import type { CaroMatchConfig, CaroScreen } from './types';
import { getAiLevelLabel } from '../labels';
import { useCaroAi } from './useCaroAi';

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

  // 3. Tỷ số phiên đấu hiện tại (Session Score - lưu trong bộ nhớ ván)
  const [sessionScore, setSessionScore] = useState<SessionScore>({
    player1Wins: 0,
    player2Wins: 0,
    draws: 0,
    matchNumber: 1,
  });

  // 4. Trạng thái bàn cờ Caro Engine thuần
  const [gameState, setGameState] = useState<CaroState>(() =>
    caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    }),
  );

  // 5. State quản lý kết thúc ván đấu
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [, setWinner] = useState<number | null>(null); // 0: X, 1: O, null: Hòa / Chưa xong
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [latestReport, setLatestReport] = useState<MatchResultReport | null>(null);

  // 6. Seed ngẫu nhiên cố định cho mỗi ván đấu (để tái lập ván cờ khi debug / replay)
  const matchSeedRef = useRef<string>(`caro_seed_${Date.now()}`);

  // 7. Quản lý thời gian để lập MatchResultReport
  const startTimeRef = useRef<number>(Date.now());
  const reportSentRef = useRef<boolean>(false);

  // 8. Hook quản lý Web Worker AI Cờ Caro
  const { requestMove, isThinking, cancel } = useCaroAi({ minDelayMs: 500 });

  // ============================================================================
  // HÀM DÙNG CHUNG THỰC THI NƯỚC ĐI (UNIFIED MOVE EXECUTION)
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

          // Cập nhật tỷ số phiên đấu
          setSessionScore((prev) => {
            const isVsAiMode = matchConfig?.mode === 'vs_ai';
            const currentHumanSeat = matchConfig?.humanSeat ?? 0;

            let p1Won = false;
            let p2Won = false;
            let isDrawMatch = false;

            if (winOutcome !== undefined) {
              if (isVsAiMode) {
                if (winOutcome.playerIndex === currentHumanSeat) {
                  p1Won = true; // Người thắng
                } else {
                  p2Won = true; // Máy thắng
                }
              } else {
                if (winOutcome.playerIndex === 0) {
                  p1Won = true; // Quân X thắng
                } else {
                  p2Won = true; // Quân O thắng
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
  // CÁC HÀM CHUYỂN TRẠNG THÁI (STATE MACHINE TRANSITIONS)
  // ============================================================================

  // Bắt đầu ván đấu mới từ ModeSelect (setup -> playing)
  const handleStartMatch = useCallback((config: CaroMatchConfig) => {
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

  // Chơi lại ván mới giữ nguyên cấu hình đã chọn (trong lúc đang chơi hoặc nút reset nhanh)
  const handleResetGame = useCallback(() => {
    cancel();
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
  // RENDER MÀN HÌNH 1: SETUP (CHỌN CHẾ ĐỘ CHƠI)
  // ============================================================================
  if (screen === 'setup') {
    return <ModeSelect definition={definition} onStart={handleStartMatch} shellApi={shellApi} />;
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
          onRestart={handleRestartWithSwap}
          onBackToSetup={handleBackToSetup}
          shellApi={shellApi}
        />
      )}
    </div>
  );
};

export default CaroGameView;
