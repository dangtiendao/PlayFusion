/**
 * ==============================================================================
 * CARO GAME VIEW COMPONENT (GIAO DIỆN TRÒ CHƠI CỜ CARO CHÍNH THỨC)
 * ==============================================================================
 *
 * ⚠️ KIẾN TRÚC STATE MACHINE GIAO DIỆN:
 * 1. 'setup': Màn hình cấu hình chọn chế độ chơi (`ModeSelect.tsx`).
 * 2. 'playing': Màn hình bàn cờ đang diễn ra trận đấu (`InteractiveBoard.tsx`).
 * 3. 'finished': Màn hình kết thúc ván đấu (hiển thị kết quả, ván mới, đổi chế độ).
 *
 * ⚠️ TÍCH HỢP BOT AI (WEB WORKER USE_CARO_AI) & 4 CA VÒNG ĐỜI:
 * a. PAUSE giữa lúc AI đang nghĩ: `isPaused=true` -> `cancel()` ngắt worker; khi Resume -> effect tự kích hoạt lại.
 * b. VÁN MỚI / ĐỔI CHẾ ĐỘ giữa lúc AI đang nghĩ: `cancel()` chủ động + Hook chống race condition bằng requestId.
 * c. UNMOUNT (Người chơi thoát/Back): Effect cleanup gọi `cancel()`, không setState sau unmount.
 * d. AI CRASH / LỖI TÍNH TOÁN: Bắt lỗi, hiển thị thông báo "Máy gặp lỗi" kèm nút "Thử lại lượt máy", KHÔNG crash ván.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { GameViewProps } from '../types';
import type { MatchResultReport, MatchResultParticipant } from '@engines/types';
import { caroEngine, DEFAULT_CARO_OPTIONS, checkWinAt, type CaroState } from '@engines/caro';
import { InteractiveBoard, ModeSelect } from './components';
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

  // 3. Trạng thái bàn cờ Caro Engine thuần
  const [gameState, setGameState] = useState<CaroState>(() =>
    caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    }),
  );

  // 4. State quản lý kết thúc ván đấu
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [winner, setWinner] = useState<number | null>(null); // 0: X, 1: O, null: Hòa / Chưa xong
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 5. Seed ngẫu nhiên cố định cho mỗi ván đấu (để tái lập ván cờ khi debug / replay)
  const matchSeedRef = useRef<string>(`caro_seed_${Date.now()}`);

  // 6. Quản lý thời gian để lập MatchResultReport
  const startTimeRef = useRef<number>(Date.now());
  const reportSentRef = useRef<boolean>(false);

  // 7. Hook quản lý Web Worker AI Cờ Caro
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
            // Có người thắng: Tìm chuỗi 5 quân thắng cuộc để highlight
            const winCheck = checkWinAt(
              nextState.board,
              nextState.options.boardSize,
              cellIndex,
              nextState.options,
            );

            setWinner(winOutcome.playerIndex);
            setWinLine(winCheck?.line ? [...winCheck.line] : null);

            shellApi?.playSfx('success');
            shellApi?.hapticSuccess();
          } else {
            // Hòa cờ
            setWinner(null);
            setWinLine(null);
          }

          // 4. Báo cáo kết quả trận đấu MatchResultReport cho GameShell / Store
          if (onGameEnd && !reportSentRef.current) {
            reportSentRef.current = true;
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
    matchSeedRef.current = `caro_seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
  }, []);

  // Chơi lại ván mới giữ nguyên cấu hình đã chọn (finished/playing -> playing)
  // [Ca b]: Gọi cancel() để hủy dứt điểm lượt AI cũ nếu có
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
    matchSeedRef.current = `caro_seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [cancel, shellApi]);

  // Quay lại màn hình chọn chế độ chơi (finished/playing -> setup)
  // [Ca b]: Gọi cancel() trước khi xóa state cấu hình ván
  const handleBackToSetup = useCallback(() => {
    cancel();
    setMatchConfig(null);
    setIsGameOver(false);
    setWinLine(null);
    setWinner(null);
    setErrorMessage(null);
    setAiError(null);
    reportSentRef.current = false;
    setScreen('setup');
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [cancel, shellApi]);

  // Người chơi người xác nhận đánh nước cờ trên bàn
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

        // [Ca b & c]: Nếu effect đã bị cleanup (do unmount, reset, hoặc pause), hủy bỏ việc apply nước đi
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

        // [Ca d]: Xử lý khi Worker bị crash / lỗi thuật toán -> hiện thông báo lỗi kèm nút thử lại
        const msg = err instanceof Error ? err.message : 'Lỗi tính toán không xác định';
        setAiError(`Máy gặp lỗi tính toán: ${msg}`);
        shellApi?.playSfx('error');
        shellApi?.hapticError();
      }
    };

    runAiCalculation();

    // [Ca a, b, c]: Cleanup effect: Hủy bỏ worker tính toán và đánh dấu effect không còn active
    // Khi isPaused thay đổi -> effect tự hủy và chạy lại khi Resume
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
  // RENDER MÀN HÌNH 2 & 3: PLAYING & FINISHED
  // ============================================================================
  const isBoardDisabled = isPaused || isGameOver || isThinking || isAiTurn;

  return (
    <div
      data-testid="caro-game-view"
      className="flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[560px] p-2 sm:p-4 select-none"
    >
      {/* 
        ========================================================================
        BANNER THÔNG TIN LƯỢT ĐÁNH (NÂNG CẤP THEO TỪNG CHẾ ĐỘ & AI THINKING)
        ========================================================================
      */}
      <div className="w-full flex flex-col items-center gap-1.5 mb-2">
        {screen === 'playing' ? (
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
                <span className="text-xs text-slate-400 font-medium">Lượt đánh hiện tại</span>
                <span
                  className={`text-sm font-bold ${
                    gameState.currentPlayer === 0 ? 'text-cyan-400' : 'text-rose-400'
                  }`}
                >
                  {isVsAi ? (
                    isAiTurn || isThinking ? (
                      <span
                        data-testid="ai-thinking-indicator"
                        className="flex items-center gap-1.5"
                      >
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
        ) : (
          /* Banner Kết Thúc Ván Đấu (Finished Screen Banner) */
          <div
            data-testid="game-over-banner"
            className={`flex items-center justify-between w-full px-4 py-2.5 rounded-2xl border backdrop-blur-md shadow-xl animate-scale-in ${
              winner === 0
                ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-200'
                : winner === 1
                  ? 'bg-rose-950/80 border-rose-500/60 text-rose-200'
                  : 'bg-amber-950/80 border-amber-500/60 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">🏆</span>
              <div>
                <h3 className="text-base font-extrabold">
                  {isVsAi
                    ? winner === humanSeat
                      ? '🎉 BẠN ĐÃ CHIẾN THẮNG!'
                      : winner !== null
                        ? '🤖 MÁY ĐÃ CHIẾN THẮNG!'
                        : '🤝 VÁN ĐẤU HÒA!'
                    : winner === 0
                      ? '🎉 QUÂN X CHIẾN THẮNG!'
                      : winner === 1
                        ? '🎉 QUÂN O CHIẾN THẮNG!'
                        : '🤝 VÁN ĐẤU HÒA!'}
                </h3>
                <p className="text-xs opacity-80">Sau {gameState.moveCount} nước cờ kịch tính</p>
              </div>
            </div>

            {/* Nút Ván Mới Tối Giản */}
            <button
              type="button"
              data-testid="new-game-btn"
              onClick={handleResetGame}
              className="px-3.5 py-1.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs shadow-md active:scale-95 transition-all"
            >
              Ván mới
            </button>
          </div>
        )}

        {/* Thông báo lỗi nước đi */}
        {errorMessage && (
          <div
            data-testid="error-banner"
            className="w-full px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs text-center font-medium animate-shake"
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* [Ca d]: Thông báo lỗi AI kèm nút thử lại */}
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
        FOOTER ĐIỀU HƯỚNG KHI KẾT THÚC VÁN (FINISHED SCREEN ACTIONS)
        [P1.4c]: Màn hình kết thúc đẹp mắt và thống kê chi tiết sẽ được xây dựng tại P1.4c
        ========================================================================
      */}
      {screen === 'finished' && (
        <div
          data-testid="game-over-actions"
          className="flex items-center justify-center gap-3 w-full max-w-sm mt-3 pt-2 border-t border-slate-800/80"
        >
          <button
            type="button"
            data-testid="back-to-setup-btn"
            onClick={handleBackToSetup}
            className="flex-1 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm border border-slate-700 shadow-md active:scale-98 transition-all"
          >
            Đổi chế độ
          </button>

          <button
            type="button"
            data-testid="restart-game-btn"
            onClick={handleResetGame}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-cyan-500/20 active:scale-98 transition-all"
          >
            Chơi lại ván mới
          </button>
        </div>
      )}
    </div>
  );
};

export default CaroGameView;
