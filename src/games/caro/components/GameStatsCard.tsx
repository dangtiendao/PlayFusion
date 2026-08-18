/**
 * ==============================================================================
 * CARO GAME STATS CARD COMPONENT (KHỐI THỐNG KÊ THÀNH TÍCH & LỊCH SỬ VÁN ĐẤU)
 * ==============================================================================
 *
 * ⚠️ NGUYÊN TẮC THIẾT KẾ:
 * 1. Component thuần (Pure UI) riêng của Caro đặt tại `src/games/caro/components/`.
 * 2. Ẩn khối Thành tích khi `stats.totalMatches === 0` (người mới không bị thấy bảng 0-0-0 vô nghĩa).
 * 3. Hiển thị tối đa 5 ván đấu gần nhất từ `history` kèm icon kết quả, chế độ, số nước, thời gian tương đối.
 * 4. Ghi chú: Chưa có nút xem lại trận đấu (Replay Viewer sẽ được hoàn thiện ở Phase P8.1).
 */

import React from 'react';
import type { GameLocalStats, LocalMatchRecord } from '../../../core/gameLocalData';
import { formatRelativeTime } from '../../../core/text';

export interface GameStatsCardProps {
  /** Bảng thống kê thành tích cục bộ của trò chơi Caro */
  readonly stats: GameLocalStats;
  /** Danh sách lịch sử các ván đấu đã chơi */
  readonly history: readonly LocalMatchRecord[];
  /** Class CSS tùy biến */
  readonly className?: string;
}

export const GameStatsCard: React.FC<GameStatsCardProps> = ({ stats, history, className = '' }) => {
  // Lấy tối đa 5 ván gần nhất
  const recentHistory = history.slice(0, 5);

  // Thống kê theo 3 mức AI
  const easyStats = stats.byMode['vs_ai:easy'];
  const mediumStats = stats.byMode['vs_ai:medium'];
  const hardStats = stats.byMode['vs_ai:hard'];
  const pvpStats = stats.byMode['local_pvp'];

  const hasMatches = stats.totalMatches > 0;

  // Tính tỷ lệ thắng
  const winRate = stats.totalMatches > 0 ? Math.round((stats.wins / stats.totalMatches) * 100) : 0;

  return (
    <div data-testid="caro-game-stats-container" className={`w-full space-y-4 ${className}`}>
      {/* 
        ========================================================================
        1. KHỐI THỐNG KÊ THÀNH TÍCH (ẨN KHI CHƯA CHƠI VÁN NÀO - totalMatches = 0)
        ========================================================================
      */}
      {hasMatches && (
        <div
          data-testid="caro-stats-card"
          className="w-full p-4 rounded-2xl bg-slate-100/90 dark:bg-slate-850/90 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Thành tích của bạn
              </h3>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
              Tổng {stats.totalMatches} ván
            </span>
          </div>

          {/* Chỉ số chính: Tỷ lệ thắng & Chuỗi thắng */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-slate-700/40">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Tỷ lệ thắng
              </span>
              <p className="text-sm font-black text-cyan-600 dark:text-cyan-300">{winRate}%</p>
            </div>

            <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-slate-700/40">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Chuỗi thắng
              </span>
              <p className="text-sm font-black text-amber-500 dark:text-amber-300">
                {stats.currentStreak} 🔥
              </p>
            </div>

            <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-slate-700/40">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Kỷ lục chuỗi
              </span>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-300">
                {stats.bestStreak} 🏆
              </p>
            </div>
          </div>

          {/* Chi tiết theo từng cấp độ AI */}
          <div className="space-y-1.5 pt-1 text-xs text-slate-600 dark:text-slate-300">
            {easyStats && easyStats.matches > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  • Máy Dễ:
                </span>
                <span className="font-mono">
                  {easyStats.wins}T - {easyStats.losses}B - {easyStats.draws}H ({easyStats.matches}{' '}
                  ván)
                </span>
              </div>
            )}
            {mediumStats && mediumStats.matches > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-amber-700 dark:text-amber-300">• Máy Vừa:</span>
                <span className="font-mono">
                  {mediumStats.wins}T - {mediumStats.losses}B - {mediumStats.draws}H (
                  {mediumStats.matches} ván)
                </span>
              </div>
            )}
            {hardStats && hardStats.matches > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-rose-700 dark:text-rose-300">• Máy Khó:</span>
                <span className="font-mono">
                  {hardStats.wins}T - {hardStats.losses}B - {hardStats.draws}H ({hardStats.matches}{' '}
                  ván)
                </span>
              </div>
            )}
            {pvpStats && pvpStats.matches > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  • 2 Người 1 máy:
                </span>
                <span className="font-mono">{pvpStats.matches} ván đã đấu</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        2. KHỐI LỊCH SỬ VÁN GẦN ĐÂY (TỐI ĐA 5 VÁN MỚI NHẤT)
        ========================================================================
      */}
      {recentHistory.length > 0 && (
        <div
          data-testid="caro-recent-history-card"
          className="w-full p-4 rounded-2xl bg-slate-100/90 dark:bg-slate-850/90 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🕒</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Ván gần đây
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">5 ván mới nhất</span>
          </div>

          <div className="space-y-1.5">
            {recentHistory.map((rec) => {
              let outcomeBadge = '🤝 Hòa';
              let badgeClass =
                'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';

              if (rec.outcome === 'win') {
                outcomeBadge = '🏆 Thắng';
                badgeClass =
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
              } else if (rec.outcome === 'loss') {
                outcomeBadge = '❌ Thua';
                badgeClass = 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20';
              } else if (rec.outcome === 'none') {
                outcomeBadge = '👥 2 Người';
                badgeClass = 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20';
              }

              let modeLabel = '2 người 1 máy';
              if (rec.modeKey.startsWith('vs_ai:')) {
                const lvl = rec.modeKey.split(':')[1];
                modeLabel = `Đấu máy (${lvl === 'easy' ? 'Dễ' : lvl === 'medium' ? 'Vừa' : 'Khó'})`;
              }

              const summaryObj = rec.summary as { moveCount?: number } | undefined;
              const moveText =
                summaryObj?.moveCount !== undefined ? `${summaryObj.moveCount} nước` : '';

              return (
                <div
                  key={rec.id}
                  data-testid={`history-item-${rec.id}`}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${badgeClass}`}
                    >
                      {outcomeBadge}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {modeLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {moveText && <span>{moveText}</span>}
                    <span>•</span>
                    <span>{formatRelativeTime(rec.finishedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic text-center pt-1">
            💡 Tính năng xem lại ván cờ (Replay Viewer) sẽ ra mắt ở Phase P8.1
          </p>
        </div>
      )}
    </div>
  );
};

export default GameStatsCard;
