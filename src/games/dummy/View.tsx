import React, { useState, useEffect, useRef } from 'react';
import type { GameViewProps } from '@/games/types';
import type { Engine, MatchResultReport } from '@engines/types';
import type { DummyState, DummyMove } from '@engines/dummy/engine';

/**
 * ==============================================================================
 * DUMMY GAME VIEW (VIEW MẪU THAM CHIẾU TÍCH HỢP GAMESHELL - P0.8c)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - View mẫu tham chiếu cho các game chính thức (P1.x Caro sẽ copy cấu trúc này).
 * - Tôn trọng đầy đủ các props từ GameShell:
 *   1. `isPaused`: Khi true, disable tương tác và hiển thị nhãn tạm dừng.
 *   2. `onGameEnd`: Khi ván đấu kết thúc (terminal.over), gửi `MatchResultReport` hợp lệ.
 *   3. `shellApi`: Gọi âm thanh và rung thông qua shellApi (`playSfx`, `hapticTap`, `hapticSuccess`).
 * ==============================================================================
 */

export const DummyGameView: React.FC<GameViewProps> = ({
  definition,
  isPaused = false,
  onGameEnd,
  shellApi,
}) => {
  const [engine, setEngine] = useState<Engine<DummyState, DummyMove> | null>(null);
  const [state, setState] = useState<DummyState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gameEnded, setGameEnded] = useState<boolean>(false);

  const startTimeRef = useRef<number>(Date.now());

  // 1. Nạp Engine động qua manifest.loadEngine()
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    startTimeRef.current = Date.now();

    definition
      .loadEngine()
      .then((loadedEngine) => {
        if (isMounted) {
          const typedEngine = loadedEngine as Engine<DummyState, DummyMove>;
          setEngine(typedEngine);
          setState(typedEngine.init({ playerCount: 2 }));
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error('[DummyGameView] Không thể nạp Engine:', err);
          setLoadError('Không thể tải mã nguồn Engine của trò chơi.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [definition]);

  // 2. Xử lý nước đi của người chơi
  const handleMakeMove = (playerIndex: 0 | 1, points: 3 | 5) => {
    if (!engine || !state || isPaused) return;

    const move: DummyMove = { playerIndex, points };

    try {
      shellApi?.playSfx('click');
      shellApi?.hapticTap();

      const nextState = engine.applyMove(state, move, playerIndex);
      setState(nextState);

      // Kiểm tra kết thúc ván đấu
      const terminal = engine.isTerminal(nextState);
      if (terminal.over && terminal.outcomes && !gameEnded) {
        setGameEnded(true);

        const report: MatchResultReport = {
          gameId: definition.id,
          mode: 'local_pvp',
          participants: terminal.outcomes.map((o) => ({
            playerIndex: o.playerIndex,
            outcome: o.outcome,
            score: o.score,
          })),
          durationMs: Date.now() - startTimeRef.current,
          movesSerialized: engine.serialize(nextState),
        };

        onGameEnd?.(report);
        shellApi?.playSfx('success');
        shellApi?.hapticSuccess();
      }
    } catch (err) {
      console.warn('[DummyGameView] Nước đi không hợp lệ:', err);
      shellApi?.playSfx('error');
      shellApi?.hapticError();
    }
  };

  const handleReset = () => {
    if (!engine) return;
    shellApi?.playSfx('click');
    shellApi?.hapticTap();
    setState(engine.init({ playerCount: 2 }));
    setGameEnded(false);
    startTimeRef.current = Date.now();
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse">
        <span>Đang nạp logic Engine...</span>
      </div>
    );
  }

  if (loadError || !state || !engine) {
    return (
      <div className="p-6 text-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800">
        <span>⚠️ {loadError || 'Lỗi không xác định khi khởi tạo trò chơi.'}</span>
      </div>
    );
  }

  const terminal = engine.isTerminal(state);
  const p0Score = state.scores[0] ?? 0;
  const p1Score = state.scores[1] ?? 0;

  return (
    <div className="space-y-4 w-full text-center">
      {/* Banner Trạng thái Tạm dừng */}
      {isPaused && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs font-semibold animate-pulse">
          ⏸️ Ván đấu đang tạm dừng — Các thao tác bấm bị khóa
        </div>
      )}

      {/* Thông số bàn cờ mẫu */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className={`p-3 rounded-xl border transition-all ${
            state.currentPlayer === 0 && !terminal.over
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 ring-2 ring-primary-400/30'
              : 'border-surface-border dark:border-surface-dark-border bg-surface-muted dark:bg-surface-dark-muted'
          }`}
        >
          <div className="text-xs text-slate-500">Người chơi 1 (P0)</div>
          <div className="text-xl font-extrabold text-primary-600 dark:text-primary-400">
            {p0Score} đ
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border transition-all ${
            state.currentPlayer === 1 && !terminal.over
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 ring-2 ring-primary-400/30'
              : 'border-surface-border dark:border-surface-dark-border bg-surface-muted dark:bg-surface-dark-muted'
          }`}
        >
          <div className="text-xs text-slate-500">Người chơi 2 (P1)</div>
          <div className="text-xl font-extrabold text-primary-600 dark:text-primary-400">
            {p1Score} đ
          </div>
        </div>
      </div>

      {/* Lượt đi / Kết quả ván */}
      <div className="py-2">
        {terminal.over ? (
          <div className="text-base font-black text-emerald-600 dark:text-emerald-400 space-y-1 animate-scaleUp">
            <div>
              🎉{' '}
              {p0Score > p1Score
                ? 'Người chơi 1 Thắng Cuộc!'
                : p1Score > p0Score
                  ? 'Người chơi 2 Thắng Cuộc!'
                  : 'Ván Đấu Hòa!'}
            </div>
            <div className="text-xs text-slate-500 font-normal">
              Đã gửi MatchResultReport cho GameShell
            </div>
          </div>
        ) : (
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Lượt đi:{' '}
            <span className="text-primary-600 dark:text-primary-400">
              Người chơi {state.currentPlayer + 1}
            </span>{' '}
            (Lượt {state.turn}/{state.maxTurns})
          </div>
        )}
      </div>

      {/* Nút hành động trong game */}
      {!terminal.over ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isPaused || state.currentPlayer !== 0}
            onClick={() => handleMakeMove(0, 5)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
          >
            P1: Ghi 5 điểm
          </button>
          <button
            type="button"
            disabled={isPaused || state.currentPlayer !== 1}
            onClick={() => handleMakeMove(1, 3)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
          >
            P2: Ghi 3 điểm
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleReset}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
        >
          🔄 Chơi Lại Ván Mới
        </button>
      )}
    </div>
  );
};

export default DummyGameView;
