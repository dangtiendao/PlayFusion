import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  userAId,
  userBId,
  expectRlsBlocked,
} from './setup';

describe('RLS Security Suite: Tiền Tệ & Sổ Cái (wallets, wallet_transactions)', () => {
  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    await teardownRlsTestContext();
  });

  it('[DoD Gốc] [Ma trận: wallet_transactions -> INSERT (authenticated)] userA KHÔNG THỂ tự insert sổ cái để cộng xu', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('wallet_transactions')
        .insert({
          user_id: userAId,
          amount: 10000,
          balance_after: 10000,
          type: 'admin_adjust',
          idempotency_key: `hack-coins-${Date.now()}`,
        })
        .select(),
    );
  });

  it('[DoD Gốc] [Ma trận: wallets -> UPDATE (authenticated)] userA KHÔNG THỂ tự update số dư ví của mình hoặc người khác', async () => {
    if (!isRlsTestConfigured()) return;

    // Thử sửa ví của chính mình
    await expectRlsBlocked(
      userAClient.from('wallets').update({ balance: 999999 }).eq('user_id', userAId).select(),
    );

    // Thử sửa ví của userB
    await expectRlsBlocked(
      userAClient.from('wallets').update({ balance: 0 }).eq('user_id', userBId).select(),
    );
  });

  it('[Ma trận: wallets -> INSERT (authenticated)] userA KHÔNG THỂ tự insert ví mới', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('wallets')
        .insert({
          user_id: userAId,
          balance: 500,
        })
        .select(),
    );
  });

  it('[Ma trận: wallets -> SELECT (authenticated)] userA chỉ đọc được ví của mình, KHÔNG đọc được ví của userB', async () => {
    if (!isRlsTestConfigured()) return;

    // Đọc ví chính mình -> Thành công
    const { data: ownWallet, error: ownErr } = await userAClient
      .from('wallets')
      .select('*')
      .eq('user_id', userAId);
    expect(ownErr).toBeNull();
    expect(ownWallet).toBeDefined();

    // Đọc ví userB -> 0 dòng
    const { data: otherWallet, error: otherErr } = await userAClient
      .from('wallets')
      .select('*')
      .eq('user_id', userBId);
    expect(otherErr).toBeNull();
    expect(otherWallet).toHaveLength(0);
  });

  it('[Ma trận: wallet_transactions -> SELECT (authenticated)] userA KHÔNG THỂ đọc lịch sử giao dịch của userB', async () => {
    if (!isRlsTestConfigured()) return;

    const { data: otherTxns, error } = await userAClient
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userBId);
    expect(error).toBeNull();
    expect(otherTxns).toHaveLength(0);
  });
});
