import { describe, it, expect, vi, beforeEach } from 'vitest';
import { walletRepository, getVietnamDateString, VIETNAM_TIMEZONE } from './walletRepository';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('Wallet Repository Tests (walletRepository.ts - P4.5c)', () => {
  const mockUser = { id: 'usr-1111-2222-3333-4444' };

  beforeEach(() => {
    vi.clearAllMocks();
    walletRepository.invalidateWalletCache();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: {
        user: mockUser as unknown as NonNullable<
          Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']
        >,
      },
      error: null,
    });
  });

  it('1. getVietnamDateString định dạng đúng YYYY-MM-DD theo múi giờ Việt Nam', () => {
    const fixedUtc = new Date('2026-08-26T18:30:00Z'); // 01:30 sáng 27/08 VN
    const vnDateStr = getVietnamDateString(fixedUtc);
    expect(vnDateStr).toBe('2026-08-27');
    expect(VIETNAM_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
  });

  it('2. getMyBalance đọc số dư từ bảng wallets và tận dụng Cache TTL 15s', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { balance: 250 },
      error: null,
    });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    // Lần 1: Gọi DB
    const bal1 = await walletRepository.getMyBalance();
    expect(bal1).toBe(250);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);

    // Lần 2: Cache trúng -> Không gọi lại DB
    const bal2 = await walletRepository.getMyBalance();
    expect(bal2).toBe(250);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);

    // Xóa cache -> Lần 3 gọi lại DB
    walletRepository.invalidateWalletCache();
    const bal3 = await walletRepository.getMyBalance();
    expect(bal3).toBe(250);
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });

  it('3. getMyTransactions phân trang Keyset composite cursor kép', async () => {
    const mockRows = [
      {
        id: 'txn-1',
        user_id: mockUser.id,
        amount: 50,
        balance_after: 250,
        type: 'match_reward',
        ref_type: 'match',
        ref_id: 'm-1',
        idempotency_key: 'settle:m-1:u-1',
        created_at: '2026-08-26T20:00:00Z',
      },
    ];

    const mockLimit = vi.fn().mockResolvedValue({
      data: mockRows,
      error: null,
    });

    const mockOrder2 = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const page = await walletRepository.getMyTransactions(null, 30);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.amount).toBe(50);
    expect(page.entries[0]?.type).toBe('match_reward');
    expect(page.hasMore).toBe(false);
  });

  it('4. claimDailyBonus gọi RPC và cập nhật số dư mới', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { claimed: true, coins: 20, balance: 270 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

    const res = await walletRepository.claimDailyBonus();
    expect(res.claimed).toBe(true);
    expect(res.coins).toBe(20);
    expect(res.balance).toBe(270);
  });

  it('5. getDailyBonusStatus kiểm tra sự tồn tại của bản ghi ledger hôm nay', async () => {
    const today = getVietnamDateString();
    const expectedKey = `daily:${mockUser.id}:${today}`;

    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'txn-daily-1' },
      error: null,
    });

    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });

    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const status = await walletRepository.getDailyBonusStatus();
    expect(status).toBe(true);
    expect(mockEq2).toHaveBeenCalledWith('idempotency_key', expectedKey);
  });
});
