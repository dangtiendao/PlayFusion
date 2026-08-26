/**
 * ==============================================================================
 * REPOSITORY VÍ XU & SỔ CÁI TÀI CHÍNH (SRC/REPOSITORIES/WALLETREPOSITORY.TS)
 * ==============================================================================
 *
 * MỤC TIÊU & NGUYÊN TẮC KIẾN TRÚC:
 * 1. TẬP TRUNG HÓA TRUY CẬP DỮ LIỆU VÍ:
 *    - Toàn bộ thao tác đọc số dư, lịch sử giao dịch và điểm danh hàng ngày
 *      đều tập trung tại repository này.
 * 2. BẢO MẬT & RLS CHÍNH CHỦ:
 *    - Sử dụng Supabase Client với phiên người dùng hiện tại (RLS enforce user_id = auth.uid()).
 * 3. BỘ ĐỆM CLIENT (IN-MEMORY CACHE TTL 15s):
 *    - Cache số dư ví trong 15s để tối ưu số lần gọi mạng khi chuyển tab.
 *    - Hàm `invalidateWalletCache()` xóa cache ngay khi kết toán ván đấu hoặc nhận thưởng.
 * 4. MÚI GIỜ VIỆT NAM (ASIA/HO_CHI_MINH) NHẤT QUÁN:
 *    - Hằng số `VIETNAM_TIMEZONE` tập trung tại 1 chỗ.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';

export type WalletTxnType =
  | 'match_reward'
  | 'match_penalty'
  | 'daily_bonus'
  | 'admin_adjust'
  | 'purchase'
  | 'topup'
  | 'refund';

export interface WalletTxn {
  readonly id: string;
  readonly userId: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly type: WalletTxnType;
  readonly refType: string | null;
  readonly refId: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface WalletTxnCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface WalletTxnPage {
  readonly entries: readonly WalletTxn[];
  readonly nextCursor: WalletTxnCursor | null;
  readonly hasMore: boolean;
}

export interface ClaimBonusResult {
  readonly claimed: boolean;
  readonly already?: boolean;
  readonly coins?: number;
  readonly balance: number;
}

export interface WalletRewardConfigs {
  readonly winRanked: number;
  readonly lossRanked: number;
  readonly drawRanked: number;
  readonly dailyCap: number;
  readonly dailyLogin: number;
  readonly abandonPenalty: number;
}

export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Trích xuất chuỗi ngày theo định dạng YYYY-MM-DD theo múi giờ Việt Nam.
 */
export function getVietnamDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // 'YYYY-MM-DD'
}

interface RawWalletTxnRow {
  readonly id: string;
  readonly user_id: string;
  readonly amount: number | string;
  readonly balance_after: number | string;
  readonly type: string;
  readonly ref_type: string | null;
  readonly ref_id: string | null;
  readonly idempotency_key: string;
  readonly created_at: string;
}

function mapWalletTxn(row: RawWalletTxnRow): WalletTxn {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    type: row.type as WalletTxnType,
    refType: row.ref_type,
    refId: row.ref_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

// In-memory Cache TTL 15s cho số dư ví
const BALANCE_CACHE_TTL_MS = 15_000;
let cachedBalance: { balance: number; timestamp: number } | null = null;

class WalletRepository {
  /**
   * Xóa bộ nhớ đệm số dư ví để ép buộc tải lại dữ liệu mới nhất.
   */
  invalidateWalletCache(): void {
    cachedBalance = null;
  }

  /**
   * Đọc số dư ví của người dùng hiện tại (kèm Cache TTL 15s).
   */
  async getMyBalance(forceRefresh = false): Promise<number> {
    const now = Date.now();
    if (!forceRefresh && cachedBalance && now - cachedBalance.timestamp < BALANCE_CACHE_TTL_MS) {
      return cachedBalance.balance;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return 0;
    }

    const { data, error } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const balance = Number(data?.balance ?? 0);
    cachedBalance = { balance, timestamp: now };
    return balance;
  }

  /**
   * Lấy danh sách lịch sử giao dịch của chính mình theo cơ chế Keyset Pagination (cursor kép).
   */
  async getMyTransactions(cursor?: WalletTxnCursor | null, pageSize = 30): Promise<WalletTxnPage> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { entries: [], nextCursor: null, hasMore: false };
    }

    let query = supabase
      .from('wallet_transactions')
      .select(
        'id, user_id, amount, balance_after, type, ref_type, ref_id, idempotency_key, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1);

    if (cursor) {
      // Keyset composite cursor: (created_at < cursor.created_at) OR (created_at = cursor.created_at AND id < cursor.id)
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const rows = (data as unknown as RawWalletTxnRow[]) || [];
    const hasMore = rows.length > pageSize;
    const pagedRows = hasMore ? rows.slice(0, pageSize) : rows;
    const entries = pagedRows.map(mapWalletTxn);

    let nextCursor: WalletTxnCursor | null = null;
    if (hasMore && entries.length > 0) {
      const last = entries[entries.length - 1];
      if (last) {
        nextCursor = { createdAt: last.createdAt, id: last.id };
      }
    }

    return {
      entries,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Thực hiện điểm danh nhận thưởng xu hàng ngày qua RPC `claim_daily_bonus`.
   */
  async claimDailyBonus(): Promise<ClaimBonusResult> {
    const { data, error } = await supabase.rpc('claim_daily_bonus');

    if (error) {
      throw error;
    }

    const res = (data as Record<string, unknown>) || {};
    const claimed = Boolean(res.claimed);
    const already = Boolean(res.already);
    const coins = typeof res.coins === 'number' ? res.coins : undefined;
    const balance = Number(res.balance ?? 0);

    // Xóa cache và cập nhật số dư mới
    this.invalidateWalletCache();
    cachedBalance = { balance, timestamp: Date.now() };

    return {
      claimed,
      already,
      coins,
      balance,
    };
  }

  /**
   * Kiểm tra xem người dùng hiện tại đã nhận thưởng điểm danh hôm nay chưa.
   * Suy ra trực tiếp từ bảng sổ cái `wallet_transactions` theo múi giờ VN (không cần RPC riêng).
   */
  async getDailyBonusStatus(): Promise<boolean> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const todayVn = getVietnamDateString();
    const expectedKey = `daily:${user.id}:${todayVn}`;

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('idempotency_key', expectedKey)
      .maybeSingle();

    if (error) {
      // Fail-soft: nếu có lỗi đọc sổ cái, mặc định coi như chưa nhận để nút không bị treo
      return false;
    }

    return Boolean(data);
  }

  /**
   * Tải cấu hình thưởng và phạt từ system_config để hiển thị trong UI.
   */
  async getRewardConfigs(): Promise<WalletRewardConfigs> {
    const { data } = await supabase.from('system_config').select('key, value');

    const configRows: Record<string, unknown> = {};
    if (Array.isArray(data)) {
      for (const row of data) {
        if (
          row &&
          typeof row === 'object' &&
          'key' in row &&
          typeof (row as { key?: unknown }).key === 'string' &&
          'value' in row
        ) {
          configRows[(row as { key: string }).key] = (row as { value: unknown }).value;
        }
      }
    }

    const parseCoin = (val: unknown, fallback: number): number => {
      if (
        typeof val === 'object' &&
        val !== null &&
        'coins' in val &&
        typeof (val as { coins: unknown }).coins === 'number'
      ) {
        return Math.floor((val as { coins: number }).coins);
      }
      return fallback;
    };

    return {
      winRanked: parseCoin(configRows['reward.win_ranked'], 50),
      lossRanked: parseCoin(configRows['reward.loss_ranked'], 5),
      drawRanked: parseCoin(configRows['reward.draw_ranked'], 20),
      dailyCap: parseCoin(configRows['reward.daily_cap'], 500),
      dailyLogin: parseCoin(configRows['reward.daily_login'], 20),
      abandonPenalty: parseCoin(configRows['penalty.abandon'], -20),
    };
  }
}

export const walletRepository = new WalletRepository();

export function invalidateWalletCache(): void {
  walletRepository.invalidateWalletCache();
}
