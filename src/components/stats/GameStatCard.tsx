import React from 'react';
import type { GameDefinition, AiLevel } from '@engines/types';
import type { PlayerGameStats } from '@/repositories/types';
import {
  computeWinrateView,
  pickPrimaryModeStats,
  aggregateVsAi,
  MIN_MATCHES_FOR_WINRATE,
} from '@/core/statsRules';
import { getCategoryConfig, getModeKeyLabel, getAiLevelLabel } from '@/games/labels';

/**
 * ==============================================================================
 * THẺ THỐNG KÊ TRÒ CHƠI GENERIC (GAME STAT CARD)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. COMPONENT THUẦN (PURE PRESENTATIONAL COMPONENT):
 *    - Không tự gọi repository hay API. Toàn bộ dữ liệu do component cha (ProfilePage) bơm vào.
 *    - Cho phép tái sử dụng linh hoạt để xem hồ sơ người khác hoặc xem trong modal/drawer.
 * 2. KỶ LUẬT GENERIC TUYỆT ĐỐI:
 *    - Tuyệt đối KHÔNG hard-code bất kỳ tên game nào (như Caro, Cờ Tướng, Dummy...).
 *    - Mọi icon, tên game, danh mục và phương thức tính điểm đều đọc từ `definition` (Manifest).
 * 3. HỖ TRỢ ĐA DẠNG HỆ THỐNG ĐIỂM (SCORING SYSTEM):
 *    - 'win_loss': Hiển thị Tỷ lệ thắng (Winrate %) kèm cơ chế mở khóa sau 10 trận.
 *    - 'score' | 'time': Hiển thị Điểm kỷ lục hoặc Thời gian kỷ lục.
 * ==============================================================================
 */

export interface GameStatCardProps {
  /** Tờ khai năng lực của trò chơi từ Registry */
  readonly definition: GameDefinition;
  /** Số liệu thống kê của người chơi trên Cloud (null nếu chưa tải hoặc chưa có) */
  readonly stats: PlayerGameStats | null;
  /** Thống kê cục bộ trên thiết bị (dự phòng) */
  readonly localStats?: unknown;
  /** Callback khi người chơi bấm nút Chơi ngay */
  readonly onPlay?: () => void;
  /** Cờ trạng thái đang nạp dữ liệu (Skeleton Loading) */
  readonly isLoading?: boolean;
}

export const GameStatCard = React.memo(function GameStatCard({
  definition,
  stats,
  onPlay,
  isLoading = false,
}: GameStatCardProps) {
  const categoryConfig = getCategoryConfig(definition.category);

  // 1. SKELETON LOADING STATE
  if (isLoading) {
    return (
      <div
        data-testid={`stat-card-skeleton-${definition.id}`}
        className="p-5 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark shadow-sm space-y-4 animate-pulse"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-1.5">
              <div className="w-24 h-4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="w-16 h-3 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
          <div className="w-16 h-5 rounded-full bg-slate-200 dark:bg-slate-800" />
        </div>
        <div className="w-full h-20 rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      </div>
    );
  }

  const totalMatches = stats?.totalMatches ?? 0;
  const hasMatches = totalMatches > 0;

  return (
    <div
      data-testid={`game-stat-card-${definition.id}`}
      className="p-5 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark shadow-sm space-y-4 transition-all"
    >
      {/* 1. HEADER: Icon + Tên Game + Badge Thể loại + Tổng số trận */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {definition.icon ? (
            <img
              src={definition.icon}
              alt={definition.name}
              className="w-12 h-12 rounded-xl object-cover shadow-sm flex-shrink-0"
              loading="lazy"
            />
          ) : (
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${categoryConfig.fallbackBgClass} flex items-center justify-center font-black text-lg shadow-sm flex-shrink-0`}
            >
              {definition.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {definition.name}
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${categoryConfig.badgeClass}`}
              >
                {categoryConfig.name}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {hasMatches ? `${totalMatches} ván đã đấu` : 'Chưa có ván đấu nào'}
            </p>
          </div>
        </div>

        {hasMatches && (
          <div className="text-right flex-shrink-0">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
              📊 {totalMatches} ván
            </span>
          </div>
        )}
      </div>

      {/* 2. BODY CHÍNH THEO HỆ THỐNG ĐIỂM (SCORING) HOẶC EMPTY STATE */}
      {!hasMatches ? (
        // EMPTY STATE: Chưa có ván đấu nào
        <div
          data-testid={`empty-stat-${definition.id}`}
          className="p-4 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border/60 dark:border-surface-dark-border/60 text-center space-y-3"
        >
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Chưa có ván đấu nào được ghi nhận trên Cloud.
          </p>
          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              data-testid={`play-now-btn-${definition.id}`}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs shadow-sm transition-all active:scale-95"
            >
              <span>Chơi ngay</span>
              <span>▶</span>
            </button>
          )}
        </div>
      ) : definition.scoring === 'win_loss' && stats ? (
        // NHÁNH 1: TRÒ CHƠI TÍNH THẮNG / THUA / HÒA (WIN_LOSS)
        <div className="space-y-3">
          {(() => {
            const primaryMode = pickPrimaryModeStats(stats.byModeKey);

            if (!primaryMode) {
              return null;
            }

            const winrateView = computeWinrateView(primaryMode.stats);
            const modeName = getModeKeyLabel(primaryMode.modeKey);

            return (
              <div
                data-testid={`winrate-hero-${definition.id}`}
                className="p-3.5 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border/80 dark:border-surface-dark-border/80 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    🏆 {modeName}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {primaryMode.stats.matches} ván ({primaryMode.stats.wins} thắng -{' '}
                    {primaryMode.stats.losses} thua
                    {primaryMode.stats.draws > 0 ? ` - ${primaryMode.stats.draws} hòa` : ''})
                  </span>
                </div>

                {winrateView.kind === 'visible' ? (
                  // MỞ KHÓA TỶ LỆ THẮNG (>= 10 trận có quyết định)
                  <div className="flex items-baseline gap-2">
                    <span
                      data-testid={`winrate-pct-${definition.id}`}
                      className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight"
                    >
                      {winrateView.winratePct}%
                    </span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Tỷ lệ thắng
                    </span>
                  </div>
                ) : (
                  // CHƯA ĐỦ 10 TRẬN -> HIỆN TIẾN ĐỘ MỞ KHÓA
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1">
                        <span>🔒</span>
                        <span>Cần thêm {winrateView.needMore} trận để mở khóa Tỷ lệ thắng</span>
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400">
                        {Math.max(0, MIN_MATCHES_FOR_WINRATE - winrateView.needMore)}/
                        {MIN_MATCHES_FOR_WINRATE}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            ((MIN_MATCHES_FOR_WINRATE - winrateView.needMore) /
                              MIN_MATCHES_FOR_WINRATE) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* CHI TIẾT CÁC CẤP ĐỘ ĐẤU MÁY & LOCAL PVP */}
          <div className="space-y-1.5 pt-1">
            {(() => {
              const vsAiAgg = aggregateVsAi(stats.byModeKey);
              const hasVsAiLevels = Object.keys(vsAiAgg.byLevel).length > 0;
              const localPvpStats = stats.byModeKey['local_pvp'];

              return (
                <>
                  {hasVsAiLevels && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Chi tiết Đấu Máy (VS AI)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {Object.entries(vsAiAgg.byLevel).map(([level, lStats]) => {
                          const levelLabel = getAiLevelLabel(level as AiLevel);
                          return (
                            <div
                              key={level}
                              className="p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/60 dark:border-surface-dark-border/60 text-xs"
                            >
                              <div className="font-bold text-slate-800 dark:text-slate-200">
                                {levelLabel}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {lStats.matches} ván ({lStats.wins}W - {lStats.losses}L
                                {lStats.draws > 0 ? ` - ${lStats.draws}D` : ''})
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {localPvpStats && localPvpStats.matches > 0 && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/60 dark:border-surface-dark-border/60 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <span>👥</span>
                        <span>2 người 1 máy (Đối kháng)</span>
                      </div>
                      <span className="font-semibold text-slate-600 dark:text-slate-400">
                        {localPvpStats.matches} ván{' '}
                        {localPvpStats.draws > 0 ? `(${localPvpStats.draws} hòa)` : ''}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        // NHÁNH 2: TRÒ CHƠI TÍNH ĐIỂM HOẶC THỜI GIAN (SCORE / TIME)
        <div
          data-testid={`score-hero-${definition.id}`}
          className="p-4 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border/80 dark:border-surface-dark-border/80 text-center space-y-1"
        >
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {definition.scoring === 'time' ? '⏱️ Thời gian tốt nhất' : '🏆 Điểm cao nhất'}
          </div>
          <div className="text-2xl font-black text-primary-600 dark:text-primary-400">
            {totalMatches > 0 ? `${totalMatches} ván đã hoàn thành` : '--'}
          </div>
        </div>
      )}
    </div>
  );
});
