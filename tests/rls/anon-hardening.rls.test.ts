import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  anonClient,
  userAClient,
  userAId,
  expectRlsBlocked,
} from './setup';

describe('RLS & Permission Hardening: Thu Hồi Quyền Anon & Cô Lập Hàm (0010_hardening)', () => {
  const ALL_15_TABLES = [
    'profiles',
    'games',
    'seasons',
    'matches',
    'match_participants',
    'player_ratings',
    'wallets',
    'wallet_transactions',
    'shop_items',
    'user_inventory',
    'user_equipped',
    'purchases',
    'audit_logs',
    'system_config',
    'orders',
  ];

  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    await teardownRlsTestContext();
  });

  it('[Hardening] [Ma trận: RPC -> EXECUTE (anon)] anonClient KHÔNG THỂ gọi RPC audit_wallet_balance', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      anonClient.rpc('audit_wallet_balance', {
        p_user_id: userAId || '00000000-0000-0000-0000-000000000000',
      }),
    );
  });

  it('[Hardening] [Ma trận: RPC -> EXECUTE (authenticated)] userA KHÔNG THỂ gọi RPC audit_wallet_balance (Chỉ service_role)', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(userAClient.rpc('audit_wallet_balance', { p_user_id: userAId }));
  });

  it('[Hardening] [Ma trận: ALL TABLES -> SELECT (anon)] anonClient KHÔNG THỂ đọc bất kỳ bảng nào trong 15 bảng (REVOKE ALL)', async () => {
    if (!isRlsTestConfigured()) return;

    for (const tableName of ALL_15_TABLES) {
      const { data, error } = await anonClient.from(tableName).select('*').limit(5);

      // Thao tác bị chặn khi: có lỗi PostgREST (42501 permission denied) HOẶC trả về mảng rỗng (0 dòng)
      const isBlockedOrEmpty =
        Boolean(error) || (Array.isArray(data) && data.length === 0) || data === null;
      expect(
        isBlockedOrEmpty,
        `Bảng ${tableName} vẫn cho phép anon đọc dữ liệu: ${JSON.stringify(data)}`,
      ).toBe(true);
    }
  });
});
