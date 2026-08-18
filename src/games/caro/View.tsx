/**
 * ==============================================================================
 * CARO GAME VIEW COMPONENT (GIAO DIỆN TRÒ CHƠI CỜ CARO CHÍNH THỨC)
 * ==============================================================================
 *
 * ⚠️ KIẾN TRÚC STATE MACHINE GIAO DIỆN (UI SCREEN STATE MACHINE):
 * 1. 'setup': Màn hình cấu hình chọn chế độ chơi (`ModeSelect.tsx`).
 * 2. 'playing': Màn hình bàn cờ đang diễn ra trận đấu (`InteractiveBoard.tsx`).
 * 3. 'finished': Màn hình kết thúc ván đấu (hiển thị kết quả, ván mới, đổi chế độ).
 *
 * ⚠️ RANH GIỚI KIẾN TRÚC & QUY ƯỚC:
 * - Nhận `GameViewProps` từ GameShell (`definition`, `isPaused`, `onGameEnd`, `shellApi`).
 * - Sử dụng `caroEngine` thuần để quản lý luật cờ và tính toán trạng thái ván đấu.
 * - Mọi hiệu ứng âm thanh và rung phản hồi ĐỀU đi qua `shellApi` để đảm bảo testability.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { GameViewProps } from '../types';
import type { MatchResultReport, MatchResultParticipant } from '@engines/types';
import { caroEngine, DEFAULT_CARO_OPTIONS, checkWinAt, type CaroState } from '@engines/caro';
import { InteractiveBoard, ModeSelect } from './components';
import type { CaroMatchConfig, CaroScreen } from './types';
import { getAiLevelLabel } from '../labels';

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

  // 5. Quản lý thời gian để lập MatchResultReport
  const startTimeRef = useRef<number>(Date.now());
  const reportSentRef = useRef<boolean>(false);

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
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
  }, []);

  // Chơi lại ván mới giữ nguyên cấu hình đã chọn (finished -> playing)
  const handleResetGame = useCallback(() => {
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
    startTimeRef.current = Date.now();
    reportSentRef.current = false;
    setScreen('playing');
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [shellApi]);

  // Quay lại màn hình chọn chế độ chơi (finished -> setup)
  const handleBackToSetup = useCallback(() => {
    setMatchConfig(null);
    setIsGameOver(false);
    setWinLine(null);
    setWinner(null);
    setErrorMessage(null);
    reportSentRef.current = false;
    setScreen('setup');
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
  }, [shellApi]);

  // ============================================================================
  // LUỒNG XỬ LÝ NƯỚC ĐI (MOVE HANDLER)
  // ============================================================================
  const handleMoveConfirmed = useCallback(
    (cellIndex: number) => {
      if (isPaused || isGameOver) return;

      const currentPlayer = gameState.currentPlayer;

      try {
        setErrorMessage(null);

        // 1. Áp dụng nước đi qua Caro Engine thuần
        const nextState = caroEngine.applyMove(gameState, cellIndex, currentPlayer);
        setGameState(nextState);

        // 2. Kiểm tra xem ván cờ đã đạt trạng thái kết thúc (Terminal) hay chưa
        const terminalResult = caroEngine.isTerminal(nextState);

        if (terminalResult.over) {
          setIsGameOver(true);
          setScreen('finished');

          const winOutcome = terminalResult.outcomes?.find((o) => o.outcome === 'win');

          if (winOutcome !== undefined) {
            // Trường hợp có người thắng: Tìm chuỗi 5 quân thắng cuộc để highlight
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
            // Trường hợp hòa cờ (kín bàn)
            setWinner(null);
            setWinLine(null);
            shellApi?.playSfx('click');
          }

          // 3. Gửi báo cáo kết quả trận đấu MatchResultReport cho GameShell / Store
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
        } else {
          // Ván cờ tiếp tục: Âm thanh đặt quân
          shellApi?.playSfx('click');
        }
      } catch (err: unknown) {
        // Bắt lỗi EngineError (ô không hợp lệ, sai lượt) mà KHÔNG gây crash ứng dụng
        const msg = err instanceof Error ? err.message : 'Nước đi không hợp lệ';
        setErrorMessage(msg);
        shellApi?.hapticError();
        shellApi?.playSfx('error');
      }
    },
    [isPaused, isGameOver, gameState, matchConfig, onGameEnd, shellApi],
  );

  // ============================================================================
  // XỬ LÝ LƯỢT ĐI CỦA BOT AI (VS_AI MODE)
  // ============================================================================
  const isVsAi = matchConfig?.mode === 'vs_ai';
  const humanSeat = matchConfig?.humanSeat ?? 0;
  const isAiTurn = isVsAi && gameState.currentPlayer !== humanSeat;

  useEffect(() => {
    // Chỉ kích hoạt khi đang trong màn hình playing, ván chưa kết thúc, không bị pause và đúng lượt máy
    if (screen !== 'playing' || isGameOver || isPaused || !isAiTurn) {
      return;
    }

    /**
     * [P1.4b]: Tại Phase P1.4b sẽ thay thế stub này bằng lời gọi useCaroAi() qua Web Worker.
     * Stub tạm thời: Tự động đánh nước đi hợp lệ đầu tiên sau 500ms để kiểm thử state machine.
     */
    const timer = setTimeout(() => {
      const legalMoves = caroEngine.legalMoves(gameState, gameState.currentPlayer);
      const stubMove = legalMoves[0];
      if (stubMove !== undefined) {
        handleMoveConfirmed(stubMove);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [screen, isGameOver, isPaused, isAiTurn, gameState, handleMoveConfirmed]);

  // ============================================================================
  // RENDER MÀN HÌNH 1: SETUP (CHỌN CHẾ ĐỘ CHƠI)
  // ============================================================================
  if (screen === 'setup') {
    return <ModeSelect definition={definition} onStart={handleStartMatch} shellApi={shellApi} />;
  }

  // ============================================================================
  // RENDER MÀN HÌNH 2 & 3: PLAYING & FINISHED
  // ============================================================================
  const isBoardDisabled = isPaused || isGameOver || isAiTurn;

  return (
    <div
      data-testid="caro-game-view"
      className="flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[560px] p-2 sm:p-4 select-none"
    >
      {/* 
        ========================================================================
        BANNER THÔNG TIN LƯỢT ĐÁNH (NÂNG CẤP THEO TỪNG CHẾ ĐỘ)
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
                    isAiTurn ? (
                      <span className="flex items-center gap-1 animate-pulse">
                        🤖 Máy đang suy nghĩ... ({getAiLevelLabel(matchConfig.aiLevel ?? 'easy')})
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

            <div className="text-right">
              <span className="text-xs text-slate-400 font-medium">Nước đi</span>
              <p className="text-sm font-bold text-slate-200">{gameState.moveCount + 1}</p>
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

        {/* Thông báo lỗi nếu có */}
        {errorMessage && (
          <div
            data-testid="error-banner"
            className="w-full px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs text-center font-medium animate-shake"
          >
            ⚠️ {errorMessage}
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
        onMoveConfirmed={handleMoveConfirmed}
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
