import React from 'react';
import type { GameDefinition } from '@engines/types';
import { getCategoryConfig, getModeLabel } from '@/games/labels';

/**
 * ==============================================================================
 * THẺ TRÒ CHƠI (GAME CARD COMPONENT)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. Component được bọc bằng `React.memo` để tối ưu hiệu năng re-render khi danh sách
 *    trò chơi trên Sảnh mở rộng lên 20-30 game trong tương lai.
 * 2. Tuyệt đối KHÔNG hard-code bất kỳ logic hay style nào theo `gameId`. Mọi hiển thị
 *    đều lấy trực tiếp từ thuộc tính trong `definition` (Manifest).
 * 3. Đạt chuẩn công thái học Mobile-First: Vùng chạm $\ge 44\times 44\text{px}$, hiệu ứng active scale nhẹ.
 * ==============================================================================
 */

export interface GameCardProps {
  /** Tờ khai năng lực của trò chơi */
  readonly definition: GameDefinition;
  /** Callback khi người dùng chạm/click vào thẻ game */
  readonly onClick?: (gameId: string) => void;
}

export const GameCard = React.memo(function GameCard({ definition, onClick }: GameCardProps) {
  const categoryConfig = getCategoryConfig(definition.category);

  const handleClick = () => {
    // Phase P0.7c sẽ gắn điều hướng chuyển sang route /game/:gameId
    onClick?.(definition.id);
  };

  const playerCountLabel =
    definition.players.min === definition.players.max
      ? `${definition.players.min} người`
      : `${definition.players.min}-${definition.players.max} người`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Mở trò chơi ${definition.name}`}
      className="group relative flex flex-col justify-between w-full min-h-[160px] p-4 text-left rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      {/* Phần trên: Icon + Badges thể loại & Xếp hạng */}
      <div className="space-y-3 w-full">
        <div className="flex items-start justify-between gap-2">
          {/* Icon Game hoặc Fallback Gradient Avatar */}
          <div className="flex-shrink-0">
            {definition.icon ? (
              <img
                src={definition.icon}
                alt={definition.name}
                className="w-12 h-12 rounded-xl object-cover shadow-sm"
                loading="lazy"
              />
            ) : (
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${categoryConfig.fallbackBgClass} flex items-center justify-center font-black text-lg shadow-sm group-hover:scale-105 transition-transform`}
              >
                {definition.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Badges Thể loại & Ranked */}
          <div className="flex flex-wrap gap-1.5 justify-end">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${categoryConfig.badgeClass}`}
            >
              <span>{categoryConfig.emoji}</span>
              <span>{categoryConfig.name}</span>
            </span>

            {definition.ranked && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <span>🏆</span>
                <span>Rank</span>
              </span>
            )}
          </div>
        </div>

        {/* Tiêu đề & Mô tả */}
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors line-clamp-1">
            {definition.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {definition.description}
          </p>
        </div>
      </div>

      {/* Phần dưới: Số người chơi & Badges Chế độ chơi */}
      <div className="pt-3 mt-2 border-t border-surface-border/60 dark:border-surface-dark-border/60 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 w-full">
        <span className="inline-flex items-center gap-1 font-medium">
          <span>👥</span>
          <span>{playerCountLabel}</span>
        </span>

        {/* Danh sách chế độ chơi */}
        <div className="flex flex-wrap gap-1 justify-end">
          {definition.modes.slice(0, 2).map((mode) => (
            <span
              key={mode}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-muted dark:bg-surface-dark-muted text-[10px] font-medium text-slate-600 dark:text-slate-300"
            >
              {getModeLabel(mode)}
            </span>
          ))}
          {definition.modes.length > 2 && (
            <span className="text-[10px] text-slate-400 font-medium">
              +{definition.modes.length - 2}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

export default GameCard;
