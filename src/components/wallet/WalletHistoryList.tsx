/**
 * ==============================================================================
 * DANH SÁCH LỊCH SỬ GIAO DỊCH VÍ (SRC/COMPONENTS/WALLET/WALLETHISTORYLIST.TSX)
 * ==============================================================================
 *
 * MỤC TIÊU:
 * - Hiển thị danh sách lịch sử giao dịch sổ cái với nhãn rõ ràng, thời gian tương đối.
 * - Phân trang Keyset pagination với nút "Xem thêm giao dịch".
 * - Skeleton loading & Empty state.
 * ==============================================================================
 */

import React from 'react';
import type { WalletTxn } from '../../repositories/walletRepository';
import { getTxnDisplayInfo } from './txnLabels';
import { formatRelativeTime } from '../../core/text';

export interface WalletHistoryListProps {
  /** Danh sách giao dịch ví */
  readonly transactions: readonly WalletTxn[];
  /** Cờ đang tải dữ liệu ban đầu */
  readonly isLoading?: boolean;
  /** Cờ đang tải thêm trang kế */
  readonly isLoadingMore?: boolean;
  /** Còn dữ liệu để tải tiếp không */
  readonly hasMore?: boolean;
  /** Callback tải thêm giao dịch */
  readonly onLoadMore?: () => void;
  /** Class CSS tùy biến */
  readonly className?: string;
}

export const WalletHistoryList: React.FC<WalletHistoryListProps> = ({
  transactions,
  isLoading = false,
  isLoadingMore = false,
  hasMore = false,
  onLoadMore,
  className = '',
}) => {
  // 1. SKELETON STATE
  if (isLoading) {
    return (
      <div data-testid="wallet-history-skeleton" className={`space-y-2.5 ${className}`}>
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800" />
              <div className="space-y-1.5">
                <div className="w-28 h-3.5 rounded bg-slate-800" />
                <div className="w-16 h-2.5 rounded bg-slate-800/80" />
              </div>
            </div>
            <div className="space-y-1.5 text-right">
              <div className="w-16 h-3.5 rounded bg-slate-800 ml-auto" />
              <div className="w-20 h-2.5 rounded bg-slate-800/80 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 2. EMPTY STATE
  if (transactions.length === 0) {
    return (
      <div
        data-testid="wallet-history-empty"
        className={`w-full py-12 px-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-center flex flex-col items-center justify-center gap-2 ${className}`}
      >
        <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center text-2xl mb-1 shadow-inner">
          🪙
        </div>
        <h4 className="text-sm font-bold text-slate-200">Chưa có giao dịch nào</h4>
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
          Hãy tham gia các trận đấu xếp hạng hoặc điểm danh hàng ngày để tích lũy xu.
        </p>
      </div>
    );
  }

  // 3. DANH SÁCH GIAO DỊCH
  return (
    <div data-testid="wallet-history-list" className={`space-y-2.5 ${className}`}>
      {transactions.map((txn) => {
        const info = getTxnDisplayInfo(txn);
        const isPositive = txn.amount > 0;
        const formattedAmount = isPositive ? `+${txn.amount}` : `${txn.amount}`;

        return (
          <div
            key={txn.id}
            data-testid={`wallet-txn-item-${txn.id}`}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800/80 transition-colors shadow-sm"
          >
            {/* Cột trái: Icon + Nhãn + Thời gian */}
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-lg shadow-inner">
                {info.icon}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                  {info.label}
                </h4>
                <p className="text-[11px] text-slate-400 font-normal">
                  {formatRelativeTime(txn.createdAt)}
                </p>
              </div>
            </div>

            {/* Cột phải: Số tiền biến động + Số dư sau giao dịch */}
            <div className="text-right shrink-0">
              <div
                className={`text-xs sm:text-sm font-black tracking-tight ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formattedAmount} xu
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                Dư: {txn.balanceAfter.toLocaleString('vi-VN')}
              </div>
            </div>
          </div>
        );
      })}

      {/* NÚT TẢI THÊM (KEYSET PAGINATION) */}
      {hasMore && (
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            disabled={isLoadingMore}
            data-testid="wallet-load-more-btn"
            onClick={onLoadMore}
            className="min-h-[44px] py-2.5 px-6 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
          >
            {isLoadingMore ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" />
                <span>Đang tải thêm...</span>
              </>
            ) : (
              <span>Xem thêm giao dịch cũ hơn</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
