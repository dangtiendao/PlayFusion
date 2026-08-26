/**
 * ==============================================================================
 * THẺ QUY TẮC THƯỞNG XU & GIỚI HẠN CHỐNG FARM (SRC/COMPONENTS/WALLET/REWARDRULESCARD.TSX)
 * ==============================================================================
 *
 * MỤC TIÊU:
 * - Hiển thị minh bạch bảng tỷ lệ thưởng xu và luật chống farm cho người chơi.
 * - Toàn bộ số liệu được truyền từ Props (đọc từ system_config), KHÔNG hard-code số.
 * ==============================================================================
 */

import React, { useState } from 'react';
import type { WalletRewardConfigs } from '../../repositories/walletRepository';

export interface RewardRulesCardProps {
  /** Cấu hình các mức thưởng từ hệ thống */
  readonly configs: WalletRewardConfigs;
  /** Class CSS tùy biến */
  readonly className?: string;
}

export const RewardRulesCard: React.FC<RewardRulesCardProps> = ({ configs, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      data-testid="reward-rules-card"
      className={`w-full rounded-2xl bg-slate-900/70 border border-slate-800 overflow-hidden ${className}`}
    >
      <button
        type="button"
        data-testid="reward-rules-toggle-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full min-h-[44px] px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📜</span>
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Quy tắc thưởng xu & Giới hạn
          </span>
        </div>
        <span
          className={`text-slate-400 text-xs transition-transform duration-200 ${
            isOpen ? 'rotate-180' : 'rotate-0'
          }`}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div
          data-testid="reward-rules-content"
          className="px-4 pb-4 pt-1 border-t border-slate-800/60 space-y-2 text-xs text-slate-300"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <span className="text-slate-400">Thắng ván xếp hạng:</span>
              <span className="font-bold text-emerald-400">+{configs.winRanked} xu</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <span className="text-slate-400">Hòa ván xếp hạng:</span>
              <span className="font-bold text-emerald-400">+{configs.drawRanked} xu</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <span className="text-slate-400">Thua ván xếp hạng:</span>
              <span className="font-bold text-emerald-400">+{configs.lossRanked} xu</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <span className="text-slate-400">Điểm danh hàng ngày:</span>
              <span className="font-bold text-amber-400">+{configs.dailyLogin} xu</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <span className="text-slate-400">Trần thưởng ván đấu:</span>
              <span className="font-bold text-cyan-400">{configs.dailyCap} xu/ngày</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <span className="text-slate-400">Phạt bỏ ván đấu (Timeout):</span>
              <span className="font-bold text-rose-400">{configs.abandonPenalty} xu</span>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-slate-400 leading-relaxed space-y-1">
            <p>
              • <strong>Chống farm gặp lại</strong>: Đấu cùng 1 đối thủ trong ngày: 2 trận đầu 100%
              thưởng, trận 3-5 giảm 50%, từ trận 6 trở đi không nhận thêm xu.
            </p>
            <p>
              • <strong>Múi giờ làm mới</strong>: Mọi giới hạn ngày được làm mới vào lúc{' '}
              <strong>00:00 (0h sáng) Giờ Việt Nam</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
