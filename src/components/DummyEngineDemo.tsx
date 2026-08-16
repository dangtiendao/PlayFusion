import { useState } from 'react';
import { applyDummyMove, createDummyInitialState, type DummyState } from '@engines/dummy/engine';

export function DummyEngineDemo() {
  const [gameState, setGameState] = useState<DummyState>(() => createDummyInitialState(6));
  const [lastActionLog, setLastActionLog] = useState<string>('Trò chơi khởi tạo sẵn sàng.');

  const handlePlayMove = (points: number): void => {
    if (gameState.isTerminal) {
      return;
    }

    try {
      const currentPlayer = gameState.currentPlayer;
      const nextState = applyDummyMove(gameState, {
        player: currentPlayer,
        points,
      });
      setGameState(nextState);
      setLastActionLog(`${currentPlayer.toUpperCase()} vừa đánh: +${points} điểm.`);
    } catch (err) {
      if (err instanceof Error) {
        setLastActionLog(`Lỗi: ${err.message}`);
      }
    }
  };

  const handleReset = (): void => {
    setGameState(createDummyInitialState(6));
    setLastActionLog('Đã đặt lại trạng thái bàn cờ ban đầu.');
  };

  return (
    <div className="bg-surface-subtle dark:bg-surface-dark-subtle border border-surface-border dark:border-surface-dark-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 text-left">
      <div className="flex items-center justify-between border-b border-surface-border dark:border-surface-dark-border pb-3">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🎮 Kiểm chứng Pure Engine trên Client</span>
        </h2>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
          @engines/dummy/engine
        </span>
      </div>

      {/* Game State Panel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs sm:text-sm">
        <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border">
          <p className="text-slate-500 dark:text-slate-400">Lượt đấu</p>
          <p className="font-bold text-slate-900 dark:text-white">
            {gameState.turn} / {gameState.maxTurns}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border">
          <p className="text-slate-500 dark:text-slate-400">Đang đến lượt</p>
          <p className="font-bold text-primary dark:text-primary-light uppercase">
            {gameState.isTerminal ? 'ĐÃ XONG' : gameState.currentPlayer}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border">
          <p className="text-slate-500 dark:text-slate-400">Điểm P1</p>
          <p className="font-bold text-slate-900 dark:text-white">{gameState.scores.player1}</p>
        </div>

        <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border">
          <p className="text-slate-500 dark:text-slate-400">Điểm P2</p>
          <p className="font-bold text-slate-900 dark:text-white">{gameState.scores.player2}</p>
        </div>
      </div>

      {/* Terminal Status / Winner */}
      {gameState.isTerminal ? (
        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-center space-y-1">
          <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase">
            Trận đấu đã kết thúc
          </p>
          <p className="text-base font-extrabold text-green-900 dark:text-green-100">
            {gameState.winner === 'draw'
              ? 'HÒA NHAU!'
              : `🏆 ${gameState.winner?.toUpperCase()} CHIẾN THẮNG!`}
          </p>
        </div>
      ) : null}

      {/* Action Log */}
      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-surface/50 dark:bg-surface-dark/50 p-2 rounded border border-surface-border/50 dark:border-surface-dark-border/50 truncate">
        &gt; {lastActionLog}
      </p>

      {/* Action Controls */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          type="button"
          disabled={gameState.isTerminal}
          onClick={() => handlePlayMove(3)}
          className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          Đánh thường (+3 điểm)
        </button>

        <button
          type="button"
          disabled={gameState.isTerminal}
          onClick={() => handlePlayMove(5)}
          className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-primary-dark hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          Đánh mạnh (+5 điểm)
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted text-slate-700 dark:text-slate-200 transition-colors"
        >
          Làm mới
        </button>
      </div>
    </div>
  );
}

export default DummyEngineDemo;
