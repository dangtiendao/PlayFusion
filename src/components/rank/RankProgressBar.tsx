/**
 * ==============================================================================
 * THANH TIẾN ĐỘ BẬC XẾP HẠNG (SRC/COMPONENTS/RANK/RANKPROGRESSBAR.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Hiển thị tỷ lệ % hoàn thành bậc rank hiện tại (`progress.percent`).
 * - Dòng mô tả chi tiết số điểm hiện tại và số điểm cần để thăng hạng lên bậc kế tiếp.
 * - Hỗ trợ tắt animation khi người dùng bật chế độ `prefers-reduced-motion`.
 * ==============================================================================
 */

import React from 'react';
import type { TierProgress } from '@rating';
import { TIER_DISPLAY_MAP } from './tierDisplay';

export interface RankProgressBarProps {
  /**
   * Đối tượng tiến độ bậc rank được trả về từ `getTierProgress(rating)`.
   */
  readonly progress: TierProgress;

  /**
   * Class tùy biến container từ bên ngoài.
   */
  readonly className?: string;
}

export const RankProgressBar: React.FC<RankProgressBarProps> = ({ progress, className = '' }) => {
  const currentSkin = TIER_DISPLAY_MAP[progress.tier.id] ?? TIER_DISPLAY_MAP.bronze;
  const nextSkin = progress.nextTier ? (TIER_DISPLAY_MAP[progress.nextTier.id] ?? null) : null;

  const currentRating = progress.tier.minRating + progress.pointsInTier;

  return (
    <div className={`space-y-1.5 w-full ${className}`} data-testid="rank-progress-bar">
      {/* Thanh tiến độ trực quan */}
      <div className="w-full bg-slate-200/80 dark:bg-slate-700/60 rounded-full h-2 overflow-hidden">
        <div
          data-testid="rank-progress-fill"
          className={`h-full rounded-full bg-gradient-to-r ${currentSkin.gradientClass} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      {/* Dòng mô tả điểm số và mục tiêu kế tiếp */}
      <div
        data-testid="rank-progress-text"
        className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium"
      >
        {progress.nextTier ? (
          <>
            <span className="font-mono">
              {currentRating} / {progress.nextTier.minRating}
            </span>
            <span>
              còn{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {progress.pointsToNext}
              </strong>{' '}
              điểm tới{' '}
              <span className={nextSkin?.colorClass ?? ''}>
                {progress.nextTier.name} {nextSkin?.icon}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="font-mono">{currentRating} điểm</span>
            <span className="text-purple-600 dark:text-purple-400 font-semibold">
              👑 Bậc cao nhất!
            </span>
          </>
        )}
      </div>
    </div>
  );
};
