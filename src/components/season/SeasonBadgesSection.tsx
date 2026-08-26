/**
 * ==============================================================================
 * KHỐI DANH SÁCH HUY HIỆU MÙA GIẢI (SRC/COMPONENTS/SEASON/SEASONBADGESSECTION.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. QUY TẮC ẨN KHI RỖNG (EMPTY STATE ZERO-SPACE):
 *    - Nếu người chơi chưa có bất kỳ huy hiệu mùa nào (`badges.length === 0`),
 *      component tự động trả về `null` (không render DOM, không chiếm diện tích).
 * 2. ĐỘC LẬP TÊN GAME (GENERIC PLUGIN ARCHITECTURE):
 *    - Sử dụng resolver `getGameName(gameId)` nạp từ tầng ngoài, không hard-code.
 * ==============================================================================
 */

import React from 'react';
import type { SeasonBadge } from '@/repositories/types';
import { SeasonBadgeCard } from './SeasonBadgeCard';

export interface SeasonBadgesSectionProps {
  /** Danh sách huy hiệu mùa giải */
  readonly badges: SeasonBadge[];
  /** Hàm chuyển đổi gameId sang tên hiển thị */
  readonly getGameName: (gameId: string) => string;
  /** Trạng thái đang tải dữ liệu */
  readonly isLoading?: boolean;
  /** Class CSS tùy biến thêm */
  readonly className?: string;
}

export const SeasonBadgesSection: React.FC<SeasonBadgesSectionProps> = ({
  badges,
  getGameName,
  isLoading = false,
  className = '',
}) => {
  // 1. Khi đang tải: Hiển thị Skeleton nhẹ
  if (isLoading) {
    return (
      <section className={`space-y-3 ${className}`} data-testid="season-badges-skeleton">
        <div className="h-4 w-40 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
      </section>
    );
  }

  // 2. TỰ VỆ: Người dùng chưa có huy hiệu nào -> Ẩn hoàn toàn khối
  if (badges.length === 0) {
    return null;
  }

  return (
    <section className={`space-y-3 ${className}`} data-testid="season-badges-section">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <span>🏆</span>
          <span>Kỷ Vật & Huy Hiệu Mùa Giải</span>
        </h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
          {badges.length} huy hiệu
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {badges.map((badge) => (
          <SeasonBadgeCard key={badge.id} badge={badge} gameName={getGameName(badge.gameId)} />
        ))}
      </div>
    </section>
  );
};
