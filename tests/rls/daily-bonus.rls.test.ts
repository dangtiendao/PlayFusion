/**
 * ==============================================================================
 * RLS & IDEMPOTENCY SUITE: ĐIỂM DANH HÀNG NGÀY (TESTS/RLS/DAILY-BONUS.RLS.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P4.5B):
 * 1. RPC claim_daily_bonus (Lần 1): Thành công `claimed: true`, ví +20 xu, sổ cái có 1 dòng key 'daily:{uid}:{today}'.
 * 2. RPC claim_daily_bonus (Lần 2 cùng ngày): `already: true, claimed: false`, ví KHÔNG đổi, sổ cái vẫn 1 dòng.
 * 3. Chống Race Condition: 2 request claim song song (Promise.all) -> Đúng 1 claim thành công, 1 báo already.
 * 4. Quyền gọi RPC: anonClient bị chặn (42501).
 * 5. Ma trận RLS: Client INSERT trực tiếp vào `wallet_transactions` (type daily_bonus) bị chặn 100%.
 * 6. Kiểm tra trạng thái không cần RPC status: Client tự SELECT chính chủ trên `wallet_transactions`.
 * ==============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  userBClient,
  anonClient,
  userAId,
  userBId,
  expectRlsBlocked,
} from './setup';

function getVietnamDateString(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date()); // 'YYYY-MM-DD'
}

describe.runIf(isRlsTestConfigured())(
  'RLS Security & Idempotency Suite: Điểm Danh Hàng Ngày (P4.5b)',
  () => {
    beforeAll(async () => {
      await setupRlsTestContext();
    });

    afterAll(async () => {
      await teardownRlsTestContext();
    });

    it('1. [DoD Gốc] userA claim lần 1 -> claimed: true, ví +20 xu, ledger 1 dòng key đúng', async () => {
      // 1. Đọc số dư ví ban đầu của userA
      const { data: initialWallet } = await userAClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .maybeSingle();

      const balanceBefore = Number(initialWallet?.balance ?? 0);

      // 2. userA gọi RPC claim_daily_bonus
      const { data: claimRes, error: claimErr } = await userAClient.rpc('claim_daily_bonus');

      expect(claimErr).toBeNull();
      expect(claimRes).not.toBeNull();
      expect(claimRes.claimed).toBe(true);
      expect(claimRes.coins).toBe(20);
      expect(claimRes.balance).toBe(balanceBefore + 20);

      // 3. Đối chiếu số dư ví trong DB
      const { data: updatedWallet } = await userAClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();

      expect(Number(updatedWallet?.balance)).toBe(balanceBefore + 20);

      // 4. Đối chiếu sổ cái wallet_transactions
      const todayVn = getVietnamDateString();
      const expectedKey = `daily:${userAId}:${todayVn}`;

      const { data: txns, error: txnErr } = await userAClient
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userAId)
        .eq('type', 'daily_bonus');

      expect(txnErr).toBeNull();
      expect(txns).toHaveLength(1);
      if (txns && txns[0]) {
        expect(txns[0].idempotency_key).toBe(expectedKey);
        expect(Number(txns[0].amount)).toBe(20);
      }
    });

    it('2. [DoD Gốc] userA claim lần 2 CÙNG NGÀY -> already: true, ví KHÔNG đổi, ledger vẫn đúng 1 dòng', async () => {
      // 1. Đọc số dư ví hiện tại
      const { data: walletBefore } = await userAClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();

      const balanceBefore = Number(walletBefore?.balance);

      // 2. Gọi claim lần 2
      const { data: claimRes, error: claimErr } = await userAClient.rpc('claim_daily_bonus');

      expect(claimErr).toBeNull();
      expect(claimRes).not.toBeNull();
      expect(claimRes.claimed).toBe(false);
      expect(claimRes.already).toBe(true);
      expect(claimRes.balance).toBe(balanceBefore);

      // 3. Ví không thay đổi
      const { data: walletAfter } = await userAClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();

      expect(Number(walletAfter?.balance)).toBe(balanceBefore);

      // 4. Sổ cái vẫn đúng 1 dòng
      const { data: txns } = await userAClient
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userAId)
        .eq('type', 'daily_bonus');

      expect(txns).toHaveLength(1);
    });

    it('3. [DoD Gốc] 2 claim SONG SONG (Promise.all race) trên userB -> Đúng 1 claimed: true (Unique Key chống race)', async () => {
      // 1. Đọc số dư ví ban đầu của userB
      const { data: initialWallet } = await userBClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userBId)
        .maybeSingle();

      const balanceBefore = Number(initialWallet?.balance ?? 0);

      // 2. Bắn 2 request claim đồng thời
      const [res1, res2] = await Promise.all([
        userBClient.rpc('claim_daily_bonus'),
        userBClient.rpc('claim_daily_bonus'),
      ]);

      expect(res1.error).toBeNull();
      expect(res2.error).toBeNull();

      const results = [res1.data, res2.data];
      const successCount = results.filter((r) => r?.claimed === true).length;
      const alreadyCount = results.filter((r) => r?.already === true).length;

      // Khẳng định đúng 1 lần thành công và 1 lần báo đã nhận
      expect(successCount).toBe(1);
      expect(alreadyCount).toBe(1);

      // 3. Ví userB chỉ được cộng đúng 20 xu
      const { data: finalWallet } = await userBClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userBId)
        .single();

      expect(Number(finalWallet?.balance)).toBe(balanceBefore + 20);

      // 4. Sổ cái userB chỉ ghi nhận đúng 1 dòng
      const { data: txns } = await userBClient
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userBId)
        .eq('type', 'daily_bonus');

      expect(txns).toHaveLength(1);
    });

    it('4. [Ma trận: RPC] anonClient gọi claim_daily_bonus -> BỊ CHẶN (42501 Unauthorized)', async () => {
      const { error } = await anonClient.rpc('claim_daily_bonus');
      expect(error).not.toBeNull();
    });

    it('5. [Ma trận: RLS] Client tự INSERT trực tiếp vào wallet_transactions (daily_bonus) -> BỊ CHẶN', async () => {
      await expectRlsBlocked(
        userAClient
          .from('wallet_transactions')
          .insert({
            user_id: userAId,
            amount: 20,
            balance_after: 9999,
            type: 'daily_bonus',
            idempotency_key: `hack-daily-${Date.now()}`,
          })
          .select(),
      );
    });

    it('6. [Kiểm tra trạng thái native] Client tự SELECT wallet_transactions để biết đã nhận quà hôm nay', async () => {
      const todayVn = getVietnamDateString();
      const expectedKey = `daily:${userAId}:${todayVn}`;

      // 1. userA tra cứu bản ghi của chính mình -> Tìm thấy (canClaim = false)
      const { data: ownTxn, error: ownErr } = await userAClient
        .from('wallet_transactions')
        .select('id, created_at')
        .eq('idempotency_key', expectedKey)
        .maybeSingle();

      expect(ownErr).toBeNull();
      expect(ownTxn).not.toBeNull();
      expect(ownTxn?.id).toBeDefined();

      // 2. userB tra cứu theo key của userA -> Trả về null (RLS cô lập dữ liệu)
      const { data: otherTxn } = await userBClient
        .from('wallet_transactions')
        .select('id, created_at')
        .eq('idempotency_key', expectedKey)
        .maybeSingle();

      expect(otherTxn).toBeNull();
    });
  },
);
