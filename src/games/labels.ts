import type { GameCategory, GameMode, AiLevel } from '@engines/types';

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
 * Bảng mô tả ngắn gọn cho từng Chế độ chơi (GameMode).
 */
export const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  solo: 'Luyện tập giải thế cờ và câu đố một mình',
  vs_ai: 'Thử thách trí tuệ với bot AI 3 cấp độ thông minh',
  local_pvp: 'Chơi đối kháng 2 người trực tiếp trên cùng một màn hình',
  online_1v1: 'Ghép trận đối kháng trực tuyến 1 vs 1 tính điểm xếp hạng Elo',
  online_ffa: 'Tranh tài tự do nhiều người chơi trực tuyến',
  online_team: 'Hợp tác đồng đội đối đầu theo nhóm',
};

/**
 * Bảng ánh xạ Cấp độ AI (AiLevel) sang nhãn tiếng Việt.
 */
export const AI_LEVEL_LABELS: Record<AiLevel, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

/**
 * Bảng mô tả ngắn gọn 1 dòng cho từng Cấp độ AI.
 */
export const AI_LEVEL_DESCRIPTIONS: Record<AiLevel, string> = {
  easy: 'Nước đi nhanh, thỉnh thoảng sơ hở — phù hợp làm quen',
  medium: 'Biết phòng thủ và tấn công cơ bản — thử thách cân não',
  hard: 'Tính toán sâu, công thủ toàn diện — độ khó cao nhất',
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

/**
 * Lấy mô tả tiếng Việt cho một chế độ chơi.
 */
export function getModeDescription(mode: GameMode): string {
  return MODE_DESCRIPTIONS[mode] ?? '';
}

/**
 * Lấy nhãn tiếng Việt cho cấp độ AI.
 */
export function getAiLevelLabel(level: AiLevel): string {
  return AI_LEVEL_LABELS[level] ?? level;
}

/**
 * Lấy mô tả tiếng Việt cho cấp độ AI.
 */
export function getAiLevelDescription(level: AiLevel): string {
  return AI_LEVEL_DESCRIPTIONS[level] ?? '';
}

/**
 * Lấy nhãn tiếng Việt cho một modeKey tổng hợp (ví dụ: 'vs_ai:hard', 'local_pvp', 'vs_ai:all').
 */
export function getModeKeyLabel(modeKey: string): string {
  if (modeKey === 'vs_ai:all') {
    return 'Đấu máy (Tất cả cấp độ)';
  }

  if (modeKey.startsWith('vs_ai:')) {
    const levelKey = modeKey.split(':')[1] as AiLevel;
    const levelName = AI_LEVEL_LABELS[levelKey] ?? levelKey;
    return `Đấu máy (${levelName})`;
  }

  if (modeKey in MODE_LABELS) {
    return MODE_LABELS[modeKey as GameMode];
  }

  return modeKey;
}

export interface OutcomeVisualConfig {
  readonly label: string;
  readonly icon: string;
  readonly badgeClass: string;
}

/**
 * Lấy cấu hình nhãn và màu sắc hiển thị cho kết quả trận đấu ('win', 'loss', 'draw', 'neutral').
 */
export function getOutcomeConfig(
  result: 'win' | 'loss' | 'draw' | 'neutral' | null | undefined,
): OutcomeVisualConfig {
  switch (result) {
    case 'win':
      return {
        label: 'Thắng',
        icon: '✓',
        badgeClass:
          'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
      };
    case 'loss':
      return {
        label: 'Thua',
        icon: '✗',
        badgeClass:
          'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
      };
    case 'draw':
      return {
        label: 'Hòa',
        icon: '=',
        badgeClass:
          'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
      };
    case 'neutral':
    default:
      return {
        label: 'Đối kháng',
        icon: '👥',
        badgeClass:
          'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
      };
  }
}
