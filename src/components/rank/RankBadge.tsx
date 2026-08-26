/**
 * ==============================================================================
 * HUY HIỆU BẬC XẾP HẠNG (SRC/COMPONENTS/RANK/RANKBADGE.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Component THUẦN (Pure Component): Nhận props, không gọi repository/DB.
 * - Hiển thị Icon Emoji + Tên bậc tiếng Việt + Viền màu theo Bậc.
 * - Hỗ trợ biểu tượng Khiên Bảo Vệ Rớt Hạng (`shield = true`) kèm tooltip giải thích.
 * ==============================================================================
 */

import React from 'react';
import type { TierDef } from '@rating';
import { TIER_DISPLAY_MAP } from './tierDisplay';

export interface RankBadgeProps {
  /**
   * Định nghĩa bậc rank cần hiển thị.
   */
  readonly tier: TierDef;

  /**
   * Kích thước huy hiệu ('sm' | 'md' | 'lg'). Mặc định: 'md'.
   */
  readonly size?: 'sm' | 'md' | 'lg';

  /**
   * Cờ hiển thị biểu tượng Khiên Bảo Vệ Rớt Hạng (true nếu đang có khiên bảo vệ).
   */
  readonly shield?: boolean;

  /**
   * Class tùy biến bổ sung từ bên ngoài.
   */
  readonly className?: string;
}

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs gap-1 font-semibold',
  md: 'px-2.5 py-1 text-sm gap-1.5 font-bold',
  lg: 'px-3.5 py-1.5 text-base gap-2 font-bold',
};

const ICON_SIZES = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
};

export const RankBadge: React.FC<RankBadgeProps> = ({
  tier,
  size = 'md',
  shield = false,
  className = '',
}) => {
  const skin = TIER_DISPLAY_MAP[tier.id] ?? TIER_DISPLAY_MAP.bronze;

  return (
    <span
      data-testid="rank-badge"
      data-tier={tier.id}
      className={`relative inline-flex items-center rounded-xl border shadow-xs select-none transition-all ${
        skin.bgClass
      } ${skin.borderClass} ${SIZE_CLASSES[size]} ${className}`}
    >
      <span className={`leading-none ${ICON_SIZES[size]}`} aria-hidden="true">
        {skin.icon}
      </span>
      <span className={`${skin.colorClass} leading-tight`}>{tier.name}</span>

      {shield && (
        <span
          data-testid="rank-shield-icon"
          title="Đang được bảo vệ rớt hạng"
          aria-label="Đang được bảo vệ rớt hạng"
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 text-[10px] bg-amber-500 text-white rounded-full shadow-xs ring-1 ring-white dark:ring-slate-900 animate-pulse"
        >
          🛡️
        </span>
      )}
    </span>
  );
};
