import React from 'react';
import { getTierByRating } from '@rating';
import { RankBadge } from '../rank/RankBadge';
import type { LeaderboardEntry } from '../../repositories/types';

export interface LeaderboardRowProps {
  /** Dữ liệu một kỳ thủ trên bảng xếp hạng */
  readonly entry: LeaderboardEntry;
  /** Cờ báo đây có phải dòng của người dùng hiện tại hay không */
  readonly isMe: boolean;
  /** Callback tùy chọn khi click vào dòng */
  readonly onClick?: () => void;
}

/**
 * Hiển thị huy hiệu / số thứ tự hạng của kỳ thủ.
 * Top 1, 2, 3 hiển thị emoji huy chương đặc biệt.
 */
function renderRankBadge(rank: number): React.ReactNode {
  if (rank === 1) {
    return (
      <span className="text-xl sm:text-2xl" role="img" aria-label="Hạng 1">
        🥇
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="text-xl sm:text-2xl" role="img" aria-label="Hạng 2">
        🥈
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="text-xl sm:text-2xl" role="img" aria-label="Hạng 3">
        🥉
      </span>
    );
  }
  return (
    <span className="font-mono font-bold text-sm sm:text-base text-slate-500 dark:text-slate-400">
      #{rank}
    </span>
  );
}

/**
 * Component hiển thị một dòng kỳ thủ trên bảng xếp hạng (Leaderboard Row).
 *
 * GHI CHÚ HIỆU NĂNG:
 * - Sử dụng `React.memo` để tránh re-render không cần thiết khi danh sách phân trang lên tới 100+ dòng.
 * - Component thuần (Pure Component): Nhận props từ ngoài, hoàn toàn không gọi repository hay chứa tên game cụ thể.
 */
export const LeaderboardRow = React.memo<LeaderboardRowProps>(function LeaderboardRow({
  entry,
  isMe,
  onClick,
}) {
  const tier = getTierByRating(entry.rating);
  const firstLetter = (entry.displayName.trim()[0] || 'K').toUpperCase();

  // Nhấn nền nhẹ cho Top 3
  const top3BgClass =
    entry.rank === 1
      ? 'bg-amber-500/5 dark:bg-amber-500/10'
      : entry.rank === 2
        ? 'bg-slate-300/10 dark:bg-slate-400/10'
        : entry.rank === 3
          ? 'bg-orange-500/5 dark:bg-orange-500/10'
          : '';

  return (
    <div
      data-testid={`leaderboard-row-${entry.userId}`}
      onClick={onClick}
      className={`relative flex items-center justify-between min-h-[56px] px-3 sm:px-4 py-2.5 rounded-xl border transition-all duration-200 ${
        isMe
          ? 'bg-primary-500/10 dark:bg-primary-500/15 border-primary-500/40 shadow-sm ring-1 ring-primary-500/30'
          : `${top3BgClass} bg-surface dark:bg-surface-dark border-surface-border dark:border-surface-dark-border hover:border-slate-300 dark:hover:border-slate-700`
      }`}
    >
      {/* CỘT TRÁI: Hạng & Avatar & Tên & RankBadge */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 pr-2">
        {/* Vị trí Hạng */}
        <div className="flex items-center justify-center w-8 sm:w-10 shrink-0 text-center">
          {renderRankBadge(entry.rank)}
        </div>

        {/* Avatar */}
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-700 border border-surface-border dark:border-surface-dark-border flex items-center justify-center shadow-inner">
          {entry.avatarUrl ? (
            <img
              src={entry.avatarUrl}
              alt={entry.displayName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="font-bold text-sm sm:text-base text-primary-600 dark:text-primary-400 select-none">
              {firstLetter}
            </span>
          )}
        </div>

        {/* Thông tin tên & Huy hiệu Bậc */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-semibold text-sm sm:text-base truncate ${
                isMe
                  ? 'text-primary-600 dark:text-primary-400 font-bold'
                  : 'text-slate-900 dark:text-white'
              }`}
              title={entry.displayName}
            >
              {entry.displayName}
            </span>
            {isMe && (
              <span
                data-testid="is-me-badge"
                className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary-500 text-white uppercase tracking-wider leading-none"
              >
                Bạn
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            <RankBadge tier={tier} size="sm" />
          </div>
        </div>
      </div>

      {/* CỘT PHẢI: Điểm Elo & Thống kê thắng/thua */}
      <div className="flex flex-col items-end shrink-0 pl-2 text-right">
        <span
          data-testid="row-rating"
          className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-wide"
        >
          {entry.rating.toLocaleString('vi-VN')}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {entry.gamesPlayed} trận • {entry.wins}W/{entry.losses}L
        </span>
      </div>
    </div>
  );
});
