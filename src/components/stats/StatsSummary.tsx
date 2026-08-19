import React, { useMemo } from 'react';
import type { PlayerGameStats } from '@/repositories/types';
import { aggregateVsAi } from '@/core/statsRules';

/**
 * ==============================================================================
 * KHỐI TỔNG QUAN THỐNG KÊ (STATS SUMMARY COMPONENT)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. QUYẾT ĐỊNH THIẾT KẾ (KHÔNG CÓ WINRATE TOÀN HỆ THỐNG):
 *    - Tuyệt đối KHÔNG tính và hiển thị "Tỷ lệ thắng chung toàn Hub".
 *    - Lý do: Tỷ lệ thắng giữa các game thể loại khác nhau (như Cờ Caro đối kháng vs
 *      Game Xếp hình puzzle) không có ý nghĩa toán học và làm sai lệch đánh giá kỹ năng.
 *    - Tỷ lệ thắng chỉ có ý nghĩa khi tính riêng biệt cho từng game trong `GameStatCard`.
 * 2. CÁC CHỈ SỐ TỔNG HỢP:
 *    - (a) Tổng số ván đã đấu trên tất cả các trò chơi.
 *    - (b) Trò chơi được chơi nhiều nhất (Game yêu thích).
 *    - (c) Tổng số ván thắng trước Bot AI.
 * ==============================================================================
 */

export interface StatsSummaryProps {
  /** Danh sách thống kê của người chơi trên tất cả các game */
  readonly allStats: PlayerGameStats[];
  /** Hàm chuyển đổi gameId sang tên hiển thị tiếng Việt */
  readonly getGameName: (gameId: string) => string;
  /** Cờ trạng thái đang tải dữ liệu (Skeleton Loading) */
  readonly isLoading?: boolean;
}

export const StatsSummary = React.memo(function StatsSummary({
  allStats,
  getGameName,
  isLoading = false,
}: StatsSummaryProps) {
  // Tính toán các chỉ số tổng hợp
  const summary = useMemo(() => {
    let totalAllMatches = 0;
    let totalAiWins = 0;
    let mostPlayedGame: { gameId: string; matches: number } | null = null;

    for (const gameStat of allStats) {
      totalAllMatches += gameStat.totalMatches;

      // Cộng dồn số ván thắng máy
      const vsAiAgg = aggregateVsAi(gameStat.byModeKey);
      totalAiWins += vsAiAgg.overall.wins;

      // Tìm game có số ván nhiều nhất
      if (!mostPlayedGame || gameStat.totalMatches > mostPlayedGame.matches) {
        mostPlayedGame = {
          gameId: gameStat.gameId,
          matches: gameStat.totalMatches,
        };
      }
    }

    return {
      totalAllMatches,
      totalAiWins,
      topGameName:
        mostPlayedGame && mostPlayedGame.matches > 0
          ? getGameName(mostPlayedGame.gameId)
          : 'Chưa có',
      topGameMatches: mostPlayedGame?.matches ?? 0,
    };
  }, [allStats, getGameName]);

  // 1. SKELETON LOADING STATE
  if (isLoading) {
    return (
      <div
        data-testid="stats-summary-skeleton"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-pulse"
      >
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="p-4 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark space-y-2"
          >
            <div className="w-20 h-3 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="w-16 h-6 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-testid="stats-summary-card" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Thẻ 1: Tổng số ván đã chơi */}
      <div className="p-4 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark shadow-sm space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>🎮</span>
          <span>Tổng số ván</span>
        </div>
        <div
          data-testid="summary-total-matches"
          className="text-2xl font-black text-slate-900 dark:text-white tracking-tight"
        >
          {summary.totalAllMatches}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Trên tất cả trò chơi đã đấu
        </p>
      </div>

      {/* Thẻ 2: Game chơi nhiều nhất */}
      <div className="p-4 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark shadow-sm space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>🔥</span>
          <span>Chơi nhiều nhất</span>
        </div>
        <div
          data-testid="summary-top-game"
          className="text-lg sm:text-xl font-bold text-primary-600 dark:text-primary-400 truncate"
        >
          {summary.topGameName}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {summary.topGameMatches > 0
            ? `${summary.topGameMatches} ván đã hoàn thành`
            : 'Chưa có dữ liệu'}
        </p>
      </div>

      {/* Thẻ 3: Tổng ván thắng Bot AI */}
      <div className="p-4 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark shadow-sm space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>🤖</span>
          <span>Thắng Bot AI</span>
        </div>
        <div
          data-testid="summary-ai-wins"
          className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight"
        >
          {summary.totalAiWins}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Tổng ván thắng các cấp độ máy
        </p>
      </div>
    </div>
  );
});
