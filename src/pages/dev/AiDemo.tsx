/**
 * ==============================================================================
 * CARO AI WEB WORKER DEMO PAGE (KIỂM CHỨNG TẠM THỜI CHO P1.2c)
 * ==============================================================================
 *
 * ⚠️ LƯU Ý KỸ THUẬT:
 * Trang này là DEMO P1.2c nhằm kiểm chứng UI không bao giờ bị đơ (60 FPS) khi
 * AI Hard tính toán sâu trong Web Worker.
 * Trang này sẽ được GỠ BỎ ở Phase P1.3 khi đã có View bàn cờ Caro hoàn chỉnh.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useCaroAi } from '../../games/caro/useCaroAi';
import { caroEngine, type CaroState, type CaroMove } from '../../../packages/engines/caro';

interface MoveLog {
  readonly moveNumber: number;
  readonly player: 'X (Hard)' | 'O (Medium)';
  readonly move: CaroMove;
  readonly elapsedMs: number;
}

export const AiDemoPage: React.FC = () => {
  const { requestMove, isThinking, cancel } = useCaroAi({ minDelayMs: 300 });

  const [isRunning, setIsRunning] = useState(false);
  const [matchLogs, setMatchLogs] = useState<readonly MoveLog[]>([]);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [currentTurn, setCurrentTurn] = useState<'X (Hard)' | 'O (Medium)' | null>(null);

  const abortRef = useRef<boolean>(false);

  const handleStartMatch = useCallback(async () => {
    setIsRunning(true);
    setMatchLogs([]);
    setGameResult(null);
    abortRef.current = false;

    let state: CaroState = caroEngine.init({
      playerCount: 2,
      options: { boardSize: 11, winLength: 5 },
    });

    let moveNum = 0;
    const maxMoves = 40;

    try {
      while (moveNum < maxMoves && !abortRef.current) {
        moveNum++;
        const isX = state.currentPlayer === 0;
        const playerLabel = isX ? 'X (Hard)' : 'O (Medium)';
        const level = isX ? 'hard' : 'medium';
        setCurrentTurn(playerLabel);

        const moveStart = performance.now();
        const move = await requestMove(state, {
          level,
          seed: `demo-match-turn-${moveNum}`,
          timeBudgetMs: 1500,
        });
        const elapsedMs = Math.round(performance.now() - moveStart);

        if (abortRef.current) break;

        setMatchLogs((prev) => [
          ...prev,
          {
            moveNumber: moveNum,
            player: playerLabel,
            move,
            elapsedMs,
          },
        ]);

        state = caroEngine.applyMove(state, move, state.currentPlayer);

        const terminal = caroEngine.isTerminal(state);
        if (terminal.over) {
          if (terminal.outcomes) {
            const winner = terminal.outcomes.find((o) => o.outcome === 'win');
            if (winner) {
              setGameResult(
                `🏆 Bên ${winner.playerIndex === 0 ? 'X (Hard)' : 'O (Medium)'} THẮNG!`,
              );
            } else {
              setGameResult('🤝 HÒA CỜ!');
            }
          }
          break;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'CARO_AI_REQUEST_CANCELLED') {
        setGameResult('⏹️ Trận đấu đã bị hủy bỏ bởi người dùng.');
      } else {
        setGameResult(`❌ Lỗi: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setIsRunning(false);
      setCurrentTurn(null);
    }
  }, [requestMove]);

  const handleCancelMatch = useCallback(() => {
    abortRef.current = true;
    cancel();
    setIsRunning(false);
    setCurrentTurn(null);
    setGameResult('⏹️ Đã bấm Cancel: Dừng trận đấu ngay lập tức.');
  }, [cancel]);

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      {/* Tiêu đề & Cảnh báo */}
      <div className="border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-bold text-slate-100">Caro AI Web Worker Demo (P1.2c)</h1>
        <p className="text-sm text-slate-400 mt-1">
          Trang kiểm chứng độc lập: AI chạy trên Background Worker luồng riêng, không làm đơ Main UI
          Thread (60 FPS).
        </p>
      </div>

      {/* Thước đo độ mượt (Smoothness Gauge): CSS Spinner quay liên tục 60 FPS */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/60 border border-slate-700">
        <div
          className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"
          style={{ animationDuration: '0.8s' }}
        />
        <div>
          <div className="font-medium text-slate-200">Thước đo 60 FPS (Continuous CSS Spinner)</div>
          <div className="text-xs text-slate-400">
            Nếu spinner này quay mượt không bị khựng khi AI Hard suy nghĩ $\rightarrow$ DoD Worker
            đạt chuẩn!
          </div>
        </div>
      </div>

      {/* Bảng điều khiển */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleStartMatch}
          disabled={isRunning}
          className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-emerald-900/20"
        >
          {isRunning ? 'Đang chạy trận đấu...' : '▶ Bắt đầu: AI Hard vs Medium (11x11)'}
        </button>

        <button
          onClick={handleCancelMatch}
          disabled={!isRunning}
          className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-rose-900/20"
        >
          ⏹ Hủy / Dừng Lại (Cancel)
        </button>
      </div>

      {/* Trạng thái hiện tại */}
      {isRunning && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-950/40 border border-blue-800/50 text-blue-200 text-sm animate-pulse">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          <span>
            Lượt đi: <strong>{currentTurn}</strong> {isThinking ? '(Worker đang tính...)' : ''}
          </span>
        </div>
      )}

      {/* Kết quả ván cờ */}
      {gameResult && (
        <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 text-base font-semibold text-amber-300">
          {gameResult}
        </div>
      )}

      {/* Nhật ký nước đi */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Nhật ký nước đi ({matchLogs.length})
        </h2>
        <div className="max-h-72 overflow-y-auto rounded-xl bg-slate-900 border border-slate-800 p-3 font-mono text-xs space-y-1">
          {matchLogs.length === 0 ? (
            <div className="text-slate-500 italic">
              Chưa có nước đi nào. Bấm nút bắt đầu ở trên.
            </div>
          ) : (
            matchLogs.map((log) => (
              <div
                key={log.moveNumber}
                className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0 text-slate-300"
              >
                <span>
                  #{log.moveNumber.toString().padStart(2, '0')}:{' '}
                  <strong
                    className={log.player.startsWith('X') ? 'text-cyan-400' : 'text-amber-400'}
                  >
                    {log.player}
                  </strong>{' '}
                  đánh ô index <strong>{log.move}</strong>
                </span>
                <span className="text-slate-500">{log.elapsedMs}ms</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
