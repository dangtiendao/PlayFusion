import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  serviceClient,
  userAId,
  userBId,
  expectRlsBlocked,
} from './setup';

describe('RLS Security Suite: Cấu Hình, Nhật Ký & Đơn Hàng (system_config, audit_logs, orders)', () => {
  const INTERNAL_CONFIG_KEY = `rls.test.internal_${Date.now()}`;

  beforeAll(async () => {
    await setupRlsTestContext();
    if (isRlsTestConfigured()) {
      // Seed 1 config nội bộ bằng serviceClient để test lọc tiền tố RLS
      await serviceClient.from('system_config').insert({
        key: INTERNAL_CONFIG_KEY,
        value: { secret: 'super_confidential_data' },
        description: 'Internal config for RLS test',
      });
    }
  });

  afterAll(async () => {
    if (isRlsTestConfigured() && serviceClient) {
      await serviceClient.from('system_config').delete().eq('key', INTERNAL_CONFIG_KEY);
    }
    await teardownRlsTestContext();
  });

  it('[Ma trận: system_config -> SELECT] userA thấy key công khai reward/match nhưng KHÔNG THẤY key nội bộ', async () => {
    if (!isRlsTestConfigured()) return;

    // Đọc key công khai -> Thấy
    const { data: publicConfig } = await userAClient
      .from('system_config')
      .select('key')
      .eq('key', 'reward.win_ranked');
    expect(publicConfig).toHaveLength(1);

    // Đọc key nội bộ -> Không thấy (0 dòng)
    const { data: internalConfig } = await userAClient
      .from('system_config')
      .select('key')
      .eq('key', INTERNAL_CONFIG_KEY);
    expect(internalConfig).toHaveLength(0);
  });

  it('[Ma trận: system_config -> INSERT / UPDATE] userA KHÔNG THỂ tự sửa cấu hình hệ thống', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('system_config')
        .update({ value: { coins: 999999 } })
        .eq('key', 'reward.win_ranked')
        .select(),
    );
  });

  it('[Ma trận: audit_logs -> SELECT / INSERT] userA KHÔNG THỂ đọc hoặc ghi vào nhật ký audit_logs (Khóa trắng)', async () => {
    if (!isRlsTestConfigured()) return;

    // Cấm SELECT (0 dòng)
    const { data: auditData } = await userAClient.from('audit_logs').select('*');
    expect(auditData).toHaveLength(0);

    // Cấm INSERT
    await expectRlsBlocked(
      userAClient
        .from('audit_logs')
        .insert({
          admin_id: userAId,
          action: 'hack_admin',
          reason: 'Lý do hack trái phép',
        })
        .select(),
    );
  });

  it('[Ma trận: orders -> INSERT / SELECT other] userA KHÔNG THỂ tạo orders hoặc xem đơn của userB', async () => {
    if (!isRlsTestConfigured()) return;

    // Cấm INSERT
    await expectRlsBlocked(
      userAClient
        .from('orders')
        .insert({
          user_id: userAId,
          package_id: 'pkg_test',
          amount_vnd: 50000,
          coins: 500,
          idempotency_key: `order-hack-${Date.now()}`,
        })
        .select(),
    );

    // Cấm xem orders của userB
    const { data: otherOrders } = await userAClient
      .from('orders')
      .select('*')
      .eq('user_id', userBId);
    expect(otherOrders).toHaveLength(0);
  });
});
