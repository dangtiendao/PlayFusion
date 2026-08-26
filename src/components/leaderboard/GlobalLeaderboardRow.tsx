import React from 'react';
import { getTierByRating } from '@rating';
import { RankBadge } from '../rank/RankBadge';
import type { MasterEntry, GrinderEntry } from '../../repositories/types';

export interface GlobalLeaderboardRowProps {
  /** Biến thể bảng xếp hạng ('masters' hoặc 'grinders') */
  readonly variant: 'masters' | 'grinders';
  /** Dữ liệu một người chơi trên bảng */
  readonly entry: MasterEntry | GrinderEntry;
  /** Cờ báo đây có phải dòng của người dùng hiện tại hay không */
  readonly isMe: boolean;
  /** Callback tùy chọn khi click vào dòng */
  readonly onClick?: () => void;
}

/**
 * Hiển thị huy hiệu / số thứ tự hạng của người chơi.
 * Top 1, 2, 3 hiển thị emoji huy chương đặc biệt.
 */
function renderRankBadge(rank: number): React.ReactNode {
  if (rank === 1) {
    return (
      <span
        className="text-xl sm:text-2xl"
        role="img"
        aria-label="Hạng 1"
        data-testid="rank-medal-1"
      >
        🥇
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span
        className="text-xl sm:text-2xl"
        role="img"
        aria-label="Hạng 2"
        data-testid="rank-medal-2"
      >
        🥈
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span
        className="text-xl sm:text-2xl"
        role="img"
        aria-label="Hạng 3"
        data-testid="rank-medal-3"
      >
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
 * Component hiển thị một dòng trên Bảng Xếp Hạng Toàn Hệ Thống.
 *
 * GHI CHÚ HIỆU NĂNG:
 * - Dùng `React.memo` để tránh re-render không cần thiết khi danh sách lên tới 100 dòng.
 * - Component thuần (Pure Component): Không gọi repository, nhận props từ ngoài.
 */
export const GlobalLeaderboardRow = React.memo<GlobalLeaderboardRowProps>(
  function GlobalLeaderboardRow({ variant, entry, isMe, onClick }) {
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
        data-testid={`global-leaderboard-row-${entry.userId}`}
        data-rank={entry.rank}
        onClick={onClick}
        className={`flex items-center justify-between min-h-[60px] px-3 sm:px-4 py-2.5 rounded-xl border transition-all ${
          isMe
            ? 'border-primary-500/80 bg-primary-500/10 dark:bg-primary-500/15 shadow-sm ring-1 ring-primary-500/30'
            : `border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-slate-800/50 ${top3BgClass}`
        } ${onClick ? 'cursor-pointer' : ''}`}
      >
        {/* Khối Trái: Thứ Hạng + Avatar + Tên */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
          {/* Cột Thứ Hạng */}
          <div className="w-8 sm:w-10 flex items-center justify-center shrink-0">
            {renderRankBadge(entry.rank)}
          </div>

          {/* Avatar */}
          <div className="relative shrink-0">
            {entry.avatarUrl ? (
              <img
                src={entry.avatarUrl}
                alt={entry.displayName}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                loading="lazy"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs select-none">
                {firstLetter}
              </div>
            )}
          </div>

          {/* Tên người chơi & Nhãn bạn */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`font-semibold text-sm sm:text-base truncate ${
                  isMe
                    ? 'text-primary-700 dark:text-primary-300 font-bold'
                    : 'text-slate-900 dark:text-white'
                }`}
                title={entry.displayName}
              >
                {entry.displayName}
              </span>
              {isMe && (
                <span
                  data-testid="badge-is-me"
                  className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-primary-600 text-white shrink-0 shadow-2xs"
                >
                  Bạn
                </span>
              )}
            </div>

            {/* Thông số phụ theo biến thể */}
            <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              {variant === 'masters' ? (
                <>
                  {(entry as MasterEntry).gamesCount} game • {(entry as MasterEntry).totalGames}{' '}
                  trận
                </>
              ) : (
                <>{(entry as GrinderEntry).totalMatches} trận mùa này</>
              )}
            </span>
          </div>
        </div>

        {/* Khối Phải: Điểm Số & Huy Hiệu Bậc */}
        <div className="flex flex-col items-end shrink-0 pl-2">
          {variant === 'masters' ? (
            <>
              <div className="flex items-center gap-1.5">
                <span
                  data-testid="master-weighted-rating"
                  className="font-mono font-black text-sm sm:text-base text-slate-900 dark:text-white"
                >
                  {(entry as MasterEntry).weightedRating.toLocaleString('vi-VN')}
                </span>
                <RankBadge
                  tier={getTierByRating((entry as MasterEntry).weightedRating)}
                  size="sm"
                />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                Elo trọng số
              </span>
            </>
          ) : (
            <>
              <span
                data-testid="grinder-earned-coins"
                className="font-mono font-black text-sm sm:text-base text-amber-600 dark:text-amber-400 flex items-center gap-1"
              >
                <span>🪙</span>
                {(entry as GrinderEntry).earnedCoins.toLocaleString('vi-VN')}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                Xu nhận từ trận
              </span>
            </>
          )}
        </div>
      </div>
    );
  },
);
