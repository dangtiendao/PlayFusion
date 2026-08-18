/**
 * ==============================================================================
 * CARO GAME VIEW COMPONENT (GIAO DIỆN TRÒ CHƠI CỜ CARO CHÍNH THỨC)
 * ==============================================================================
 *
 * ⚠️ RANH GIỚI KIẾN TRÚC & QUY ƯỚC:
 * 1. Nhận `GameViewProps` từ GameShell (`definition`, `isPaused`, `onGameEnd`, `shellApi`).
 * 2. Sử dụng `caroEngine` thuần để quản lý luật cờ và tính toán trạng thái ván đấu.
 * 3. Tương tác bàn cờ qua `InteractiveBoard` (Zoom-Pan-Pinch, cơ chế 2 chạm, haptics).
 * 4. Mọi hiệu ứng âm thanh và rung phản hồi ĐỀU đi qua `shellApi` để đảm bảo testability.
 *
 * ⚠️ ĐIỂM ĐÁNH DẤU CHO PHASE P1.4:
 * [TẠM P1.3c — P1.4 sẽ thay bằng luồng chọn chế độ solo / vs AI / 2 người]:
 * Hiện tại View vận hành ở chế độ "2 Người 1 Máy" (Local Pass & Play) để kiểm chứng
 * trọn vẹn toàn bộ luồng chơi game thật trong GameShell.
 */

import React, { useState, useRef, useCallback } from 'react';
import type { GameViewProps } from '../types';
import type { MatchResultReport, MatchResultParticipant } from '@engines/types';
import { caroEngine, DEFAULT_CARO_OPTIONS, checkWinAt, type CaroState } from '@engines/caro';
import { InteractiveBoard } from './components';

export const CaroGameView: React.FC<GameViewProps> = ({
  isPaused = false,
  onGameEnd,
  shellApi,
}) => {
  // 1. Khởi tạo trạng thái bàn cờ ban đầu từ Caro Engine (2 người, 15x15, luật Việt Nam chặn 2 đầu)
  const [gameState, setGameState] = useState<CaroState>(() =>
    caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    }),
  );

  // 2. State quản lý kết thúc ván đấu
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [winner, setWinner] = useState<number | null>(null); // 0: X, 1: O, null: Hòa / Chưa xong
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Quản lý thời gian để lập MatchResultReport
  const startTimeRef = useRef<number>(Date.now());
  const reportSentRef = useRef<boolean>(false);

  // Reset ván đấu mới
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
    shellApi?.hapticTap();
  }, [shellApi]);

  // Luồng xử lý khi người chơi xác nhận đánh 1 nước cờ
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
              mode: 'local_pvp',
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
    [isPaused, isGameOver, gameState, onGameEnd, shellApi],
  );

  const isBoardDisabled = isPaused || isGameOver;

  return (
    <div
      data-testid="caro-game-view"
      className="flex flex-col items-center justify-between w-full max-w-lg mx-auto min-h-[560px] p-2 sm:p-4 select-none"
    >
      {/* 
        ========================================================================
        BANNER TRẠNG THÁI LƯỢT ĐÁNH / THÔNG BÁO KẾT QUẢ
        [TẠM P1.3c — P1.4 sẽ thay bằng Header đấu AI / Solo / 2 Người chuyên nghiệp]
        ========================================================================
      */}
      <div className="w-full flex flex-col items-center gap-1.5 mb-2">
        {!isGameOver ? (
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
                  Quân {gameState.currentPlayer === 0 ? 'X' : 'O'} (Đấu 2 người)
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 font-medium">Nước đi</span>
              <p className="text-sm font-bold text-slate-200">{gameState.moveCount + 1}</p>
            </div>
          </div>
        ) : (
          /* Banner Kết Thúc Ván Đấu */
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
                  {winner === 0
                    ? '🎉 QUÂN X CHIẾN THẮNG!'
                    : winner === 1
                      ? '🎉 QUÂN O CHIẾN THẮNG!'
                      : '🤝 VÁN ĐẤU HÒA!'}
                </h3>
                <p className="text-xs opacity-80">Sau {gameState.moveCount} nước cờ kịch tính</p>
              </div>
            </div>

            {/* Nút Ván Mới Tối Giản (P1.4 sẽ thay bằng Modal/Màn hình kết thúc hoàn chỉnh) */}
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
        FOOTER TIỆN ÍCH TỐI GIẢN KHI KẾT THÚC VÁN
        ========================================================================
      */}
      {isGameOver && (
        <div
          data-testid="game-over-actions"
          className="flex items-center justify-center gap-3 w-full max-w-sm mt-3 pt-2 border-t border-slate-800/80"
        >
          <button
            type="button"
            onClick={handleResetGame}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 active:scale-98 transition-all"
          >
            Chơi lại ván mới
          </button>
        </div>
      )}
    </div>
  );
};

export default CaroGameView;
