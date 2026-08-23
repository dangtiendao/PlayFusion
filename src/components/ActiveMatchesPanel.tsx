/**
 * ==============================================================================
 * ACTIVE MATCHES PANEL COMPONENT (SRC/COMPONENTS/ACTIVEMATCHESPANEL.TSX)
 * ==============================================================================
 *
 * DANH SÁCH VÁN ĐẤU ONLINE ĐANG DIỄN RA (PHASE P3.5b & P3.6c):
 * 1. HIỂN THỊ TỐI ĐA ~5 VÁN ĐẤU SỐNG (CẢ REALTIME VÀ CORRESPONDENCE):
 *    - Icon game, tên đối thủ, chế độ chơi.
 *    - Badge nổi bật "Tới lượt bạn!" (ưu tiên xếp trên đầu) / "Chờ đối thủ".
 *    - Hạn nước đi rút gọn ("23h", "45m", "QUÁ HẠN").
 *    - Click vào dòng -> điều hướng ngay vào ván cờ.
 * 2. NGUYÊN TẮC FREE-TIER: KHÔNG POLLING LIÊN TỤC:
 *    - Nạp danh sách khi mount và khi app chuyển trạng thái `visible`.
 * ==============================================================================
 */

import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveMatchesStore } from '@/stores/activeMatchesStore';
import { formatShortDeadline } from '@/core/serverClock';
import type { ActiveMatchItem } from '@/repositories/matchRepository';

export const ActiveMatchesPanel: React.FC = () => {
  const navigate = useNavigate();
  const { matches, refresh } = useActiveMatchesStore();

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    handleRefresh();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleRefresh]);

  if (matches.length === 0) {
    return null;
  }

  const handleSelectMatch = (match: ActiveMatchItem) => {
    navigate(`/game/${match.gameId}/online/${match.matchId}`);
  };

  return (
    <div
      data-testid="active-matches-panel"
      className="w-full rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950/90 border border-amber-500/30 p-4 sm:p-5 shadow-xl shadow-amber-500/5 space-y-3.5 backdrop-blur-md animate-fade-in"
    >
      {/* Header Panel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚔️</span>
          <div>
            <h3 className="text-sm font-black text-white">Ván Đấu Đang Diễn Ra</h3>
            <p className="text-[11px] text-slate-400">
              {matches.filter((m) => m.myTurn).length > 0
                ? `Có ${matches.filter((m) => m.myTurn).length} ván đang chờ bạn đi nước!`
                : 'Các ván đấu trực tuyến chưa kết thúc'}
            </p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {matches.length} ván
        </span>
      </div>

      {/* Danh sách các ván đấu (tối đa 5 ván) */}
      <div className="space-y-2">
        {matches.slice(0, 5).map((m) => {
          const { text: deadlineText, isExpired, isUrgent } = formatShortDeadline(m.turnDeadline);
          const isCorr = m.mode === 'online_correspondence';

          return (
            <button
              key={m.matchId}
              type="button"
              data-testid={`active-match-row-${m.matchId}`}
              onClick={() => handleSelectMatch(m)}
              className={`w-full min-h-[48px] p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 text-left active:scale-[0.99] cursor-pointer ${
                m.myTurn
                  ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/40 text-slate-100 shadow-md shadow-cyan-500/5'
                  : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/70 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl flex-shrink-0">{m.gameId === 'caro' ? '⭕' : '🎮'}</span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      vs {m.opponentName}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                        isCorr
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {isCorr ? 'Theo lượt' : '1v1'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 truncate">
                    {m.myTurn ? (
                      <span className="text-cyan-400 font-bold">👉 Tới lượt bạn!</span>
                    ) : isExpired ? (
                      <span className="text-rose-400 font-bold">
                        ⚠️ Đối thủ quá hạn (Bấm để claim)
                      </span>
                    ) : (
                      <span>Đang chờ đối thủ...</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Cột hiển thị hạn chót & Nút vào trận */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  data-testid={`match-deadline-${m.matchId}`}
                  className={`text-xs font-mono font-bold px-2 py-1 rounded-lg border ${
                    isExpired
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse'
                      : isUrgent
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {deadlineText}
                </span>

                <span className="text-slate-400 text-xs font-bold">→</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveMatchesPanel;
