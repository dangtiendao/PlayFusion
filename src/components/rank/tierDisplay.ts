/**
 * ==============================================================================
 * BẢN ĐỒ SKIN & HIỂN THỊ GIAO DIỆN BẬC RANK (SRC/COMPONENTS/RANK/TIERDISPLAY.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC QUAN TRỌNG:
 * - TÊN BẬC VÀ NGƯỠNG ĐIỂM ĐƯỢC ĐỊNH NGHĨA DUY NHẤT TẠI `packages/rating/tiers.ts`.
 * - File này CHỈ LÀ SKIN (Icon Emoji, Token màu sắc Tailwind, Gradient hiệu ứng) phục vụ
 *   hiển thị trực quan cho tầng UI (Light Theme & Dark Theme), tuyệt đối không chứa logic tính toán.
 * ==============================================================================
 */

import type { TierId } from '@rating';

export interface TierSkin {
  /**
   * Biểu tượng Emoji chính thức của bậc rank.
   */
  readonly icon: string;

  /**
   * Token màu chữ của tên bậc (hỗ trợ Light / Dark).
   */
  readonly colorClass: string;

  /**
   * Token màu nền cho Huy hiệu RankBadge.
   */
  readonly bgClass: string;

  /**
   * Token màu viền cho Huy hiệu RankBadge.
   */
  readonly borderClass: string;

  /**
   * Gradient màu cho thanh tiến độ RankProgressBar.
   */
  readonly gradientClass: string;
}

/**
 * Bản đồ Skin hiển thị cho từng Bậc Rank trong toàn bộ ứng dụng.
 */
export const TIER_DISPLAY_MAP: Record<TierId, TierSkin> = {
  bronze: {
    icon: '🟤',
    colorClass: 'text-amber-900 dark:text-amber-200',
    bgClass: 'bg-amber-100/80 dark:bg-amber-950/60',
    borderClass: 'border-amber-300 dark:border-amber-700',
    gradientClass: 'from-amber-600 to-amber-700',
  },
  silver: {
    icon: '⚪',
    colorClass: 'text-slate-800 dark:text-slate-100',
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    borderClass: 'border-slate-300 dark:border-slate-600',
    gradientClass: 'from-slate-400 to-slate-500',
  },
  gold: {
    icon: '🟡',
    colorClass: 'text-amber-700 dark:text-amber-300',
    bgClass: 'bg-amber-50 dark:bg-amber-950/50',
    borderClass: 'border-amber-400 dark:border-amber-500',
    gradientClass: 'from-amber-400 to-yellow-500',
  },
  platinum: {
    icon: '🔵',
    colorClass: 'text-blue-800 dark:text-blue-200',
    bgClass: 'bg-blue-50 dark:bg-blue-950/50',
    borderClass: 'border-blue-300 dark:border-blue-700',
    gradientClass: 'from-blue-500 to-cyan-500',
  },
  diamond: {
    icon: '💎',
    colorClass: 'text-cyan-800 dark:text-cyan-200',
    bgClass: 'bg-cyan-50 dark:bg-cyan-950/50',
    borderClass: 'border-cyan-300 dark:border-cyan-600',
    gradientClass: 'from-cyan-400 to-blue-600',
  },
  master: {
    icon: '👑',
    colorClass: 'text-purple-800 dark:text-purple-200',
    bgClass: 'bg-purple-50 dark:bg-purple-950/50',
    borderClass: 'border-purple-300 dark:border-purple-700',
    gradientClass: 'from-purple-500 to-pink-500',
  },
};
