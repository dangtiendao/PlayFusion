import React from 'react';
import { getTierByRating } from '@rating';
import { RankBadge } from '../rank/RankBadge';
import type { MyLeaderboardRank } from '../../repositories/types';

export interface MyRankFooterProps {
  /** Thông tin thứ hạng cá nhân của người dùng hiện tại */
  readonly myRank: MyLeaderboardRank | null;
  /** Số trận tối thiểu cần hoàn thành để lên bảng xếp hạng (thường là 10) */
  readonly minMatches: number;
  /** Class CSS tùy biến cho container ghim đáy */
  readonly className?: string;
}

/**
 * Component ghim đáy hiển thị thứ hạng cá nhân của người chơi (My Rank Footer).
 *
 * GHI CHÚ BỐ CỤC:
 * - Vị trí: `sticky bottom-0` trong container nội dung, có `backdrop-blur-md` và viền phân cách nổi bật.
 * - Tôn trọng SafeArea và không đè lên BottomNav của ứng dụng.
 * - Hỗ trợ đầy đủ 3 nhánh:
 *   1. `null`: Người chơi chưa từng đấu trận ranked nào trong game/mùa này.
 *   2. `eligible: false`: Chưa đủ số trận tối thiểu (< minMatches) -> Hiển thị thanh tiến độ mini.
 *   3. `eligible: true`: Đã lên bảng xếp hạng -> Hiển thị số thứ hạng, điểm Elo và Huy hiệu Rank.
 * - Component thuần (Pure Component): Nhận props từ ngoài, hoàn toàn không gọi repository hay chứa tên game cụ thể.
 */
export const MyRankFooter: React.FC<MyRankFooterProps> = ({
  myRank,
  minMatches,
  className = '',
}) => {
  // 1. NHÁNH 1: Người dùng chưa từng đấu xếp hạng trong game này
  if (!myRank) {
    return (
      <div
        data-testid="my-rank-footer-unranked"
        className={`sticky bottom-0 left-0 right-0 z-20 px-4 py-3 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-md shadow-lg flex items-center justify-between gap-3 select-none ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl" role="img" aria-label="Game Controller">
            🎮
          </span>
          <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
            Bạn chưa có hạng game này — đấu online để định hạng!
          </span>
        </div>
      </div>
    );
  }

  // 2. NHÁNH 2: Người dùng chưa đủ số trận tối thiểu (gamesPlayed < minMatches)
  if (!myRank.eligible) {
    const needMore = Math.max(1, minMatches - myRank.gamesPlayed);
    const progressPercent = Math.min(100, Math.max(0, (myRank.gamesPlayed / minMatches) * 100));

    return (
      <div
        data-testid="my-rank-footer-ineligible"
        className={`sticky bottom-0 left-0 right-0 z-20 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 backdrop-blur-md shadow-lg flex flex-col gap-2 select-none ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base" role="img" aria-label="Đồng hồ cát">
              ⏳
            </span>
            <span className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200 truncate">
              Cần thêm {needMore} trận để lên bảng ({myRank.gamesPlayed}/{minMatches})
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-amber-800 dark:text-amber-300 shrink-0">
            {myRank.rating} Elo
          </span>
        </div>

        {/* Thanh tiến độ mini */}
        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  // 3. NHÁNH 3: Người dùng đã đủ điều kiện và có vị trí thứ hạng cụ thể
  const tier = getTierByRating(myRank.rating);

  return (
    <div
      data-testid="my-rank-footer-eligible"
      className={`sticky bottom-0 left-0 right-0 z-20 px-4 py-3 rounded-2xl border border-primary-500/40 bg-primary-500/10 dark:bg-primary-500/15 backdrop-blur-md shadow-lg ring-1 ring-primary-500/20 flex items-center justify-between gap-3 select-none ${className}`}
    >
      {/* Cột Trái: Vị trí Thứ hạng & Huy hiệu Rank */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider leading-none mb-1">
            Hạng của bạn
          </span>
          <span className="font-mono font-extrabold text-base sm:text-lg text-primary-700 dark:text-primary-300 leading-none">
            #{myRank.rank}
          </span>
        </div>

        <div className="h-6 w-[1px] bg-primary-500/20 mx-1 shrink-0" />

        <div className="flex items-center gap-1.5">
          <RankBadge tier={tier} size="sm" />
        </div>
      </div>

      {/* Cột Phải: Điểm Elo & Số trận */}
      <div className="flex flex-col items-end shrink-0 text-right">
        <span className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-white">
          {myRank.rating.toLocaleString('vi-VN')}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {myRank.gamesPlayed} trận
        </span>
      </div>
    </div>
  );
};
