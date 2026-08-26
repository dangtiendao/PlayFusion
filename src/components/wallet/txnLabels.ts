/**
 * ==============================================================================
 * BỘ TỪ ĐIỂN & NHÃN GIAO DỊCH SỔ CÁI VÍ (SRC/COMPONENTS/WALLET/TXNLABELS.TS)
 * ==============================================================================
 *
 * MỤC TIÊU:
 * - Ánh xạ các bản ghi sổ cái (type, amount) sang ngôn ngữ thân thiện, icon và màu sắc hiển thị.
 * - Tuyệt đối không hard-code tên giao dịch phân tán ngoài file này.
 * ==============================================================================
 */

import type { WalletTxn } from '../../repositories/walletRepository';

export interface TxnDisplayInfo {
  readonly label: string;
  readonly icon: string;
  readonly colorClass: string;
  readonly badgeBgClass: string;
  readonly isCredit: boolean;
}

/**
 * Trích xuất nhãn, icon và màu sắc hiển thị cho một giao dịch ví.
 */
export function getTxnDisplayInfo(
  txn: Pick<WalletTxn, 'type' | 'amount' | 'refType'>,
): TxnDisplayInfo {
  const { type, amount } = txn;
  const isCredit = amount > 0;

  switch (type) {
    case 'daily_bonus':
      return {
        label: 'Điểm danh hàng ngày',
        icon: '🎁',
        colorClass: 'text-amber-400',
        badgeBgClass: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
        isCredit: true,
      };

    case 'match_reward': {
      let label = 'Thưởng trận đấu';
      if (amount >= 50) {
        label = 'Thưởng thắng xếp hạng';
      } else if (amount === 20) {
        label = 'Thưởng hòa xếp hạng';
      } else if (amount > 0 && amount < 20) {
        label = 'Thưởng ván xếp hạng';
      }

      return {
        label,
        icon: '⚔️',
        colorClass: 'text-emerald-400',
        badgeBgClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
        isCredit: true,
      };
    }

    case 'match_penalty':
      return {
        label: 'Phạt bỏ trận (Timeout/AFK)',
        icon: '⚠️',
        colorClass: 'text-rose-400',
        badgeBgClass: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
        isCredit: false,
      };

    case 'purchase':
      return {
        label: 'Mua vật phẩm',
        icon: '🛍️',
        colorClass: 'text-indigo-400',
        badgeBgClass: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300',
        isCredit: false,
      };

    case 'admin_adjust':
      return {
        label: isCredit ? 'Thưởng hệ thống' : 'Điều chỉnh hệ thống',
        icon: '⚙️',
        colorClass: isCredit ? 'text-cyan-400' : 'text-slate-400',
        badgeBgClass: isCredit
          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
          : 'bg-slate-500/10 border-slate-500/20 text-slate-300',
        isCredit,
      };

    case 'topup':
      return {
        label: 'Nạp xu',
        icon: '💳',
        colorClass: 'text-emerald-400',
        badgeBgClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
        isCredit: true,
      };

    case 'refund':
      return {
        label: 'Hoàn trả xu',
        icon: '↩️',
        colorClass: 'text-cyan-400',
        badgeBgClass: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
        isCredit: true,
      };

    default:
      return {
        label: 'Biến động số dư',
        icon: '🪙',
        colorClass: isCredit ? 'text-emerald-400' : 'text-rose-400',
        badgeBgClass: 'bg-slate-800/50 border-slate-700 text-slate-300',
        isCredit,
      };
  }
}
