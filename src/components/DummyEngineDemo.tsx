import { useState, useMemo } from 'react';
import { dummyEngine, type DummyState } from '@engines/dummy/engine';
import { dummyManifest } from '@engines/dummy/manifest';
import { validateGameDefinition, EngineError } from '@engines/types';

export function DummyEngineDemo() {
  const [gameState, setGameState] = useState<DummyState>(() =>
    dummyEngine.init({ playerCount: 2, options: { maxTurns: 6 } }),
  );
  const [lastActionLog, setLastActionLog] = useState<string>(
    'Trò chơi khởi tạo sẵn sàng qua Engine.init()',
  );

  // Kiểm chứng hàm validateGameDefinition chạy trực tiếp phía Client UI
  const manifestValidationErrors = useMemo(() => validateGameDefinition(dummyManifest), []);

  const terminalResult = useMemo(() => dummyEngine.isTerminal(gameState), [gameState]);

  const legalMoves = useMemo(
    () => dummyEngine.legalMoves(gameState, gameState.currentPlayer),
    [gameState],
  );

  const handlePlayMove = (points: number): void => {
    if (terminalResult.over) {
      return;
    }

    try {
      const activePlayer = gameState.currentPlayer;
      const nextState = dummyEngine.applyMove(
        gameState,
        { playerIndex: activePlayer, points },
        activePlayer,
      );
      setGameState(nextState);
      setLastActionLog(
        `Người chơi ${activePlayer + 1} (Seat ${activePlayer}) vừa đánh: +${points} điểm.`,
      );
    } catch (err) {
      if (err instanceof EngineError) {
        setLastActionLog(`[EngineError: ${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setLastActionLog(`Lỗi: ${err.message}`);
      }
    }
  };

  const handleReset = (): void => {
    setGameState(dummyEngine.init({ playerCount: 2, options: { maxTurns: 6 } }));
    setLastActionLog('Đã đặt lại trạng thái bàn cờ ban đầu qua dummyEngine.init().');
  };

  const p0Outcome = terminalResult.outcomes?.[0]?.outcome;
  const p1Outcome = terminalResult.outcomes?.[1]?.outcome;

  return (
    <div className="bg-surface-subtle dark:bg-surface-dark-subtle border border-surface-border dark:border-surface-dark-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 text-left">
      <div className="flex items-center justify-between border-b border-surface-border dark:border-surface-dark-border pb-3">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🎮 Kiểm chứng Engine & GameDefinition</span>
        </h2>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
          Engine&lt;S, M&gt;
        </span>
      </div>

      {/* Manifest Validation Result */}
      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs flex items-center justify-between">
        <span className="text-emerald-800 dark:text-emerald-200 font-medium">
          📋 Kiểm tra Manifest (validateGameDefinition):
        </span>
        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
          {manifestValidationErrors.length === 0
            ? '✅ Hợp lệ (0 lỗi logic)'
            : `❌ ${manifestValidationErrors.length} lỗi`}
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
          <p className="font-bold text-primary-600 dark:text-primary-400 uppercase">
            {terminalResult.over ? 'ĐÃ KẾT THÚC' : `Người chơi ${gameState.currentPlayer + 1}`}
          </p>
        </div>

        <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border">
          <p className="text-slate-500 dark:text-slate-400">Điểm P1 (Seat 0)</p>
          <p className="font-bold text-slate-900 dark:text-white">{gameState.scores[0]}</p>
        </div>

        <div className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border">
          <p className="text-slate-500 dark:text-slate-400">Điểm P2 (Seat 1)</p>
          <p className="font-bold text-slate-900 dark:text-white">{gameState.scores[1]}</p>
        </div>
      </div>

      {/* Terminal Status / Winner */}
      {terminalResult.over && terminalResult.outcomes ? (
        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-center space-y-1">
          <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase">
            Trận đấu đã kết thúc (isTerminal = true)
          </p>
          <p className="text-base font-extrabold text-green-900 dark:text-green-100">
            {p0Outcome === 'win'
              ? '🏆 NGƯỜI CHƠI 1 CHIẾN THẮNG!'
              : p1Outcome === 'win'
                ? '🏆 NGƯỜI CHƠI 2 CHIẾN THẮNG!'
                : '🤝 HÒA NHAU!'}
          </p>
        </div>
      ) : null}

      {/* Action Log */}
      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-surface/50 dark:bg-surface-dark/50 p-2 rounded border border-surface-border/50 dark:border-surface-dark-border/50 truncate">
        &gt; {lastActionLog}
      </p>

      {/* Action Controls */}
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        {legalMoves.map((move) => (
          <button
            key={move.points}
            type="button"
            disabled={terminalResult.over}
            onClick={() => handlePlayMove(move.points)}
            className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Đánh +{move.points} điểm (legalMoves)
          </button>
        ))}

        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted text-slate-700 dark:text-slate-200 transition-colors focus:outline-none"
        >
          Làm mới
        </button>
      </div>
    </div>
  );
}

export default DummyEngineDemo;
