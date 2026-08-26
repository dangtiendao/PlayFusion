/**
 * ==============================================================================
 * THẺ ĐIỂM DANH HÀNG NGÀY (SRC/COMPONENTS/WALLET/DAILYBONUSCARD.TSX)
 * ==============================================================================
 *
 * MỤC TIÊU:
 * - Hiển thị trạng thái điểm danh nhận xu hàng ngày (+20 xu hoặc theo config).
 * - Tương tác 1 chạm mượt mà: nút to nổi bật, sfx/haptics, hiệu ứng thành công.
 * ==============================================================================
 */

import React from 'react';

export interface DailyBonusCardProps {
  /** Đã nhận thưởng điểm danh hôm nay chưa */
  readonly alreadyClaimed: boolean;
  /** Mức thưởng xu mỗi ngày (đọc động từ config) */
  readonly dailyCoins: number;
  /** Đang trong quá trình gửi request điểm danh */
  readonly isClaiming: boolean;
  /** Vừa nhận thưởng thành công */
  readonly isSuccess?: boolean;
  /** Callback kích hoạt điểm danh */
  readonly onClaim: () => void;
  /** Class CSS tùy biến */
  readonly className?: string;
}

export const DailyBonusCard: React.FC<DailyBonusCardProps> = ({
  alreadyClaimed,
  dailyCoins,
  isClaiming,
  isSuccess,
  onClaim,
  className = '',
}) => {
  return (
    <div
      data-testid="daily-bonus-card"
      className={`w-full p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-amber-950/30 border border-amber-500/20 shadow-lg ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl shadow-inner">
            🎁
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>Điểm Danh Hàng Ngày</span>
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                +{dailyCoins} xu
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Mỗi ngày đăng nhập nhận ngay {dailyCoins} xu tích lũy
            </p>
          </div>
        </div>
      </div>

      {alreadyClaimed || isSuccess ? (
        <button
          type="button"
          disabled
          data-testid="daily-bonus-claimed-btn"
          className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-400 font-semibold text-sm cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span className="text-emerald-400">✓</span>
          <span>Đã điểm danh hôm nay — Quay lại ngày mai</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={isClaiming}
          data-testid="daily-bonus-claim-btn"
          onClick={onClaim}
          className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-sm shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isClaiming ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Đang nhận quà...</span>
            </>
          ) : (
            <>
              <span>🎁</span>
              <span>Điểm danh nhận +{dailyCoins} xu</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
