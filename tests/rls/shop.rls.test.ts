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

describe('RLS Security Suite: Shop, Inventory, Equipped & Purchases', () => {
  const INACTIVE_ITEM_ID = `rls_test_inactive_${Date.now()}`;

  beforeAll(async () => {
    await setupRlsTestContext();
    if (isRlsTestConfigured()) {
      // Seed 1 item tắt (inactive) bằng serviceClient để test lọc RLS
      await serviceClient.from('shop_items').insert({
        id: INACTIVE_ITEM_ID,
        item_type: 'avatar',
        name: 'Test Inactive Avatar',
        asset_key: '/avatars/inactive.webp',
        is_active: false,
      });
    }
  });

  afterAll(async () => {
    if (isRlsTestConfigured() && serviceClient) {
      await serviceClient.from('shop_items').delete().eq('id', INACTIVE_ITEM_ID);
    }
    await teardownRlsTestContext();
  });

  it('[DoD Gốc] [Ma trận: user_inventory -> INSERT (authenticated)] userA KHÔNG THỂ tự insert kho đồ của mình', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('user_inventory')
        .insert({
          user_id: userAId,
          item_id: 'frame_basic',
          source: 'admin_grant',
        })
        .select(),
    );
  });

  it('[Ma trận: user_equipped -> INSERT / UPDATE (authenticated WITH CHECK)] userA equip item ĐÃ SỞ HỮU -> OK, CHƯA SỞ HỮU -> BỊ CHẶN', async () => {
    if (!isRlsTestConfigured()) return;

    // 1. Equip item ĐÃ SỞ HỮU (avatar_default_1 đã được trigger starter cấp phát) -> Thành công
    const { data: equipOk, error: errOk } = await userAClient
      .from('user_equipped')
      .upsert({
        user_id: userAId,
        slot_key: 'avatar',
        item_id: 'avatar_default_1',
      })
      .select();
    expect(errOk).toBeNull();
    expect(equipOk).toBeDefined();

    // 2. Equip item CHƯA SỞ HỮU (frame_basic chưa có trong inventory) -> BỊ CHẶN
    await expectRlsBlocked(
      userAClient
        .from('user_equipped')
        .insert({
          user_id: userAId,
          slot_key: 'avatar_frame',
          item_id: 'frame_basic',
        })
        .select(),
    );
  });

  it('[Ma trận: user_equipped -> INSERT (authenticated_other)] userA KHÔNG THỂ equip vào tài khoản của userB', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('user_equipped')
        .insert({
          user_id: userBId,
          slot_key: 'avatar',
          item_id: 'avatar_default_1',
        })
        .select(),
    );
  });

  it('[Ma trận: shop_items -> SELECT] userA thấy item active nhưng KHÔNG THẤY item is_active=false', async () => {
    if (!isRlsTestConfigured()) return;

    // Đọc item active -> Thấy
    const { data: activeItems } = await userAClient
      .from('shop_items')
      .select('id')
      .eq('id', 'avatar_default_1');
    expect(activeItems).toHaveLength(1);

    // Đọc item inactive -> Không thấy (0 dòng)
    const { data: inactiveItems } = await userAClient
      .from('shop_items')
      .select('id')
      .eq('id', INACTIVE_ITEM_ID);
    expect(inactiveItems).toHaveLength(0);
  });

  it('[Ma trận: shop_items -> INSERT / UPDATE] userA KHÔNG THỂ tự thêm hoặc sửa vật phẩm trong shop', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('shop_items')
        .insert({
          id: `hack_item_${Date.now()}`,
          item_type: 'avatar',
          name: 'Hack Item',
          asset_key: '/avatars/hack.webp',
        })
        .select(),
    );
  });

  it('[Ma trận: purchases -> INSERT / UPDATE / SELECT other] userA KHÔNG THỂ ghi purchases hoặc xem đơn của userB', async () => {
    if (!isRlsTestConfigured()) return;

    // Cấm INSERT
    await expectRlsBlocked(
      userAClient
        .from('purchases')
        .insert({
          user_id: userAId,
          item_id: 'frame_basic',
          price_paid: 0,
        })
        .select(),
    );

    // Cấm xem purchases của userB -> 0 dòng
    const { data: otherPurchases } = await userAClient
      .from('purchases')
      .select('*')
      .eq('user_id', userBId);
    expect(otherPurchases).toHaveLength(0);
  });
});
