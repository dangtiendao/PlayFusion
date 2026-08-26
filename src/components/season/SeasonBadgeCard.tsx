/**
 * ==============================================================================
 * THẺ HIỂN THỊ HUY HIỆU MÙA GIẢI (SRC/COMPONENTS/SEASON/SEASONBADGECARD.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & PHÒNG THỦ:
 * 1. TỰ VỆ GAME GỠ KHỎI REGISTRY (DEFENSIVE RENDERING):
 *    - Nhận prop `gameName` từ Registry. Nếu game đã bị gỡ hoặc không tìm thấy,
 *      hiển thị an toàn bằng mã `badge.gameId` thô, không gây crash ứng dụng.
 * 2. TÁI SỬ DỤNG GIAO DIỆN CHUẨN (@rating):
 *    - Tái sử dụng `RankBadge` từ Phase P4.3b để hiển thị màu sắc và biểu tượng bậc rank.
 * 3. HIỂN THỊ THỨ HẠNG RÕ RÀNG (TIE-BREAK P4.4):
 *    - Top 1/2/3 hiển thị huân chương danh dự (🥇/🥈/🥉).
 *    - Kỳ thủ < 10 ván (finalRank === null) hiển thị trạng thái "Hoàn thành mùa".
 * ==============================================================================
 */

import React from 'react';
import type { SeasonBadge } from '@/repositories/types';
import { TIER_TABLE, type TierDef } from '@rating';
import { RankBadge } from '@/components/rank';

export interface SeasonBadgeCardProps {
  /** Dữ liệu huy hiệu mùa giải */
  readonly badge: SeasonBadge;
  /** Tên hiển thị của trò chơi (từ Registry hoặc fallback gameId) */
  readonly gameName: string;
  /** Class CSS tùy biến thêm */
  readonly className?: string;
}

export const SeasonBadgeCard: React.FC<SeasonBadgeCardProps> = ({
  badge,
  gameName,
  className = '',
}) => {
  const tierDef: TierDef =
    TIER_TABLE.find((t) => t.id === badge.finalTier) ?? (TIER_TABLE[0] as TierDef);

  // Render huân chương / thứ hạng
  const renderRankTag = () => {
    if (badge.finalRank === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-2xs">
          🥇 Top #1
        </span>
      );
    }
    if (badge.finalRank === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-2xs">
          🥈 Top #2
        </span>
      );
    }
    if (badge.finalRank === 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-amber-700/10 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-600/30 shadow-2xs">
          🥉 Top #3
        </span>
      );
    }
    if (badge.finalRank !== null) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
          Top #{badge.finalRank}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        Hoàn thành ({badge.gamesPlayed} ván)
      </span>
    );
  };

  return (
    <div
      data-testid="season-badge-card"
      data-badge-id={badge.id}
      data-season-id={badge.seasonId}
      data-game-id={badge.gameId}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface via-surface to-slate-50 dark:from-surface-dark dark:via-surface-dark dark:to-slate-900/60 border border-surface-border dark:border-surface-dark-border p-4 shadow-xs hover:shadow-md transition-all space-y-3 ${className}`}
    >
      {/* Header: Tên mùa & Tên trò chơi (Độc lập registry) */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
            {badge.seasonName}
          </p>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{gameName}</h4>
        </div>
        {renderRankTag()}
      </div>

      {/* Body: Huy hiệu bậc rank & Điểm Elo chốt mùa */}
      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
        <RankBadge tier={tierDef} size="md" data-testid="season-badge-rank" />
        <div className="text-right">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
            Điểm chốt mùa
          </span>
          <span className="text-base font-black font-mono text-slate-900 dark:text-white">
            {badge.finalRating.toLocaleString('vi-VN')}
          </span>
        </div>
      </div>

      {/* Footer: Thống kê thành tích mùa */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
        <span>
          <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
            {badge.wins}
          </strong>
          T •{' '}
          <strong className="text-rose-600 dark:text-rose-400 font-semibold">{badge.losses}</strong>
          B •{' '}
          <strong className="text-slate-600 dark:text-slate-400 font-semibold">
            {badge.draws}
          </strong>
          H
        </span>
        <span>Tổng {badge.gamesPlayed} ván</span>
      </div>
    </div>
  );
};
