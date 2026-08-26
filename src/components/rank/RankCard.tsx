/**
 * ==============================================================================
 * THẺ XẾP HẠNG TRÒ CHƠI (SRC/COMPONENTS/RANK/RANKCARD.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & QUY TẮC BẢO VỆ:
 * 1. TỰ VỆ GAME KHÔNG RANKED (SELF-DEFENSE):
 *    - Nếu `definition.ranked !== true`, component tự động trả về `null` và không render bất kỳ DOM nào.
 * 2. ĐỘC LẬP TÊN GAME (GENERIC PLUGIN ARCHITECTURE):
 *    - Không chứa bất kỳ câu điều kiện `if (gameId === ...)` nào.
 *    - Mọi thông tin game lấy trực tiếp từ `definition` (`name`, `icon`).
 * 3. HỖ TRỢ 3 TRẠNG THÁI HIỂN THỊ:
 *    - 'placement': Đang trong giai đoạn định hạng (hiển thị x/15 trận + mini progress).
 *    - 'ranked': Đã có bậc rank (hiển thị RankBadge kèm khiên nếu có + điểm Elo + RankProgressBar).
 *    - null: Chưa từng đấu ranked mùa này (thông báo + nút kêu gọi hành động onPlay).
 * ==============================================================================
 */

import React from 'react';
import type { GameDefinition } from '@/games/types';
import type { RankView } from '@rating';
import { RankBadge } from './RankBadge';
import { RankProgressBar } from './RankProgressBar';

export interface RankCardProps {
  /**
   * Định nghĩa game từ Registry.
   */
  readonly definition: GameDefinition;

  /**
   * Trạng thái hiển thị rank tổng hợp từ `resolveRankView`.
   */
  readonly rankView: RankView | null;

  /**
   * Điểm số rating thô (tùy chọn).
   */
  readonly rating?: number;

  /**
   * Callback khi nhấn nút Chơi / Đấu Xếp Hạng.
   */
  readonly onPlay?: () => void;

  /**
   * Trạng thái đang tải dữ liệu từ Cloud.
   */
  readonly isLoading?: boolean;

  /**
   * Class tùy biến container từ bên ngoài.
   */
  readonly className?: string;
}

export const RankCard: React.FC<RankCardProps> = ({
  definition,
  rankView,
  onPlay,
  isLoading = false,
  className = '',
}) => {
  // 1. TỰ VỆ: Game không hỗ trợ chế độ Ranked -> tuyệt đối không render
  if (!definition.ranked) {
    return null;
  }

  // 2. TRẠNG THÁI ĐANG TẢI (SKELETON)
  if (isLoading) {
    return (
      <div
        data-testid="rank-card-skeleton"
        className={`bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-4 shadow-xs space-y-3 animate-pulse ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-28 rounded-md bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="h-6 w-20 rounded-xl bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  return (
    <div
      data-testid="rank-card"
      data-game-id={definition.id}
      className={`bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-4 shadow-xs space-y-3.5 ${className}`}
    >
      {/* Header: Thông tin Game + Huy hiệu Rank */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl select-none" aria-hidden="true">
            {definition.icon}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {definition.name}
            </h4>
            <span className="text-[11px] font-semibold text-primary-600 dark:text-primary-400">
              ⚔️ Đấu Xếp Hạng
            </span>
          </div>
        </div>

        {/* Badge trạng thái */}
        {rankView?.kind === 'ranked' && (
          <RankBadge tier={rankView.displayTier} shield={rankView.shield} size="sm" />
        )}

        {rankView?.kind === 'placement' && (
          <span
            data-testid="placement-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-100/80 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          >
            <span>⏳</span>
            <span>Định Hạng</span>
          </span>
        )}

        {!rankView && (
          <span
            data-testid="unranked-badge"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
          >
            Chưa có hạng
          </span>
        )}
      </div>

      {/* Body: Phân nhánh nội dung theo trạng thái */}
      {rankView?.kind === 'ranked' && (
        <div className="space-y-2 pt-1 border-t border-surface-border/60 dark:border-surface-dark-border/60">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Điểm Xếp Hạng:
            </span>
            <span
              data-testid="rank-rating-value"
              className="text-base font-extrabold font-mono text-slate-900 dark:text-white"
            >
              {rankView.progress.tier.minRating + rankView.progress.pointsInTier}
            </span>
          </div>
          <RankProgressBar progress={rankView.progress} />
        </div>
      )}

      {rankView?.kind === 'placement' && (
        <div className="space-y-2 pt-1 border-t border-surface-border/60 dark:border-surface-dark-border/60">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-medium">
            <span>Tiến độ định hạng</span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
              {rankView.gamesPlayed} / {rankView.gamesNeeded} trận
            </span>
          </div>
          <div className="w-full bg-slate-200/80 dark:bg-slate-700/60 rounded-full h-2 overflow-hidden">
            <div
              data-testid="placement-progress-fill"
              className="h-full rounded-full bg-amber-500 transition-[width] duration-300 motion-reduce:transition-none"
              style={{
                width: `${Math.min(100, (rankView.gamesPlayed / rankView.gamesNeeded) * 100)}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
            Cần thêm {rankView.gamesNeeded - rankView.gamesPlayed} trận để mở khóa Bậc Xếp Hạng.
          </p>
        </div>
      )}

      {!rankView && (
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-surface-border/60 dark:border-surface-dark-border/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chưa có thành tích ranked mùa này.
          </p>
          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              data-testid="rank-play-btn"
              className="px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-xs font-bold shadow-xs transition-all active:scale-95 shrink-0"
            >
              Đấu Ngay
            </button>
          )}
        </div>
      )}
    </div>
  );
};
