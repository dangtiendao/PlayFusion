import type { GameCategory, GameMode } from '@engines/types';

/**
 * ==============================================================================
 * BẢNG ÁNH XẠ NHÃN VÀ MÀU SẮC DÙNG CHUNG (GAME LABELS & METADATA HELPERS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Module này ánh xạ các enum/type trừu tượng thành nhãn hiển thị tiếng Việt và token màu Tailwind.
 * - Tuyệt đối KHÔNG hard-code theo `gameId`. Mọi màu sắc fallback và nhãn đều dựa trên `category` và `mode`.
 * ==============================================================================
 */

export interface CategoryVisualConfig {
  /** Tên tiếng Việt hiển thị của thể loại */
  readonly name: string;
  /** Emoji đại diện */
  readonly emoji: string;
  /** Class màu cho Badge thể loại */
  readonly badgeClass: string;
  /** Class gradient nền cho icon fallback khi game chưa có ảnh icon */
  readonly fallbackBgClass: string;
}

/**
 * Bảng ánh xạ Thể loại Game (GameCategory) sang thông tin hiển thị và màu sắc.
 */
export const CATEGORY_CONFIGS: Record<GameCategory, CategoryVisualConfig> = {
  board: {
    name: 'Bàn cờ',
    emoji: '♟️',
    badgeClass:
      'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    fallbackBgClass: 'from-blue-600 to-indigo-700 text-white',
  },
  arcade: {
    name: 'Arcade',
    emoji: '👾',
    badgeClass:
      'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    fallbackBgClass: 'from-purple-600 to-pink-700 text-white',
  },
  puzzle: {
    name: 'Giải đố',
    emoji: '🧩',
    badgeClass:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    fallbackBgClass: 'from-emerald-600 to-teal-700 text-white',
  },
  skill: {
    name: 'Kỹ năng',
    emoji: '🎯',
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    fallbackBgClass: 'from-amber-600 to-orange-700 text-white',
  },
  party: {
    name: 'Party',
    emoji: '🎉',
    badgeClass:
      'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    fallbackBgClass: 'from-rose-600 to-red-700 text-white',
  },
};

/**
 * Bảng ánh xạ Chế độ chơi (GameMode) sang nhãn tiếng Việt ngắn gọn.
 */
export const MODE_LABELS: Record<GameMode, string> = {
  solo: 'Chơi đơn',
  vs_ai: 'Đấu máy',
  local_pvp: '2 người 1 máy',
  online_1v1: 'Đấu 1v1 Online',
  online_ffa: 'Đấu tự do',
  online_team: 'Đấu đội',
};

/**
 * Lấy cấu hình hiển thị của một thể loại game.
 */
export function getCategoryConfig(category: GameCategory): CategoryVisualConfig {
  return (
    CATEGORY_CONFIGS[category] ?? {
      name: category,
      emoji: '🎮',
      badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
      fallbackBgClass: 'from-slate-600 to-slate-800 text-white',
    }
  );
}

/**
 * Lấy nhãn tiếng Việt cho một chế độ chơi.
 */
export function getModeLabel(mode: GameMode): string {
  return MODE_LABELS[mode] ?? mode;
}
