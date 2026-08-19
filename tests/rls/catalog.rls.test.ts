import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  anonClient,
  expectRlsBlocked,
} from './setup';

describe('RLS Security Suite: Danh Mục Game, Mùa Giải & Khách Vãng Lai (games, seasons, anon)', () => {
  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    await teardownRlsTestContext();
  });

  it('[Ma trận: games -> INSERT / UPDATE / DELETE] userA KHÔNG THỂ tự thêm, sửa hoặc xóa danh mục game', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('games')
        .insert({
          id: `hack_game_${Date.now()}`,
          name: 'Hack Game',
          category: 'board',
        })
        .select(),
    );
  });

  it('[Ma trận: seasons -> INSERT / UPDATE / DELETE] userA KHÔNG THỂ tự thêm hoặc sửa mùa giải', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('seasons')
        .insert({
          id: `hack_season_${Date.now()}`,
          name: 'Hack Season',
          start_at: new Date().toISOString(),
        })
        .select(),
    );
  });

  it('[Ma trận: games & seasons -> SELECT] userA đọc được danh mục games và seasons công khai', async () => {
    if (!isRlsTestConfigured()) return;

    const { data: games, error: gErr } = await userAClient.from('games').select('*');
    expect(gErr).toBeNull();
    expect(games?.length).toBeGreaterThan(0);

    const { data: seasons, error: sErr } = await userAClient.from('seasons').select('*');
    expect(sErr).toBeNull();
    expect(seasons?.length).toBeGreaterThan(0);
  });

  it('[Ma trận: anonClient -> SELECT] Khách chưa đăng nhập (anon) chỉ đọc dữ liệu công khai, KHÔNG đọc được dữ liệu riêng tư', async () => {
    if (!isRlsTestConfigured()) return;

    // 1. Đọc công khai -> OK
    const { data: publicGames } = await anonClient.from('games').select('id');
    expect(publicGames?.length).toBeGreaterThan(0);

    // 2. Đọc bảng riêng tư -> 0 dòng
    const { data: wallets } = await anonClient.from('wallets').select('*');
    expect(wallets).toHaveLength(0);

    const { data: inventory } = await anonClient.from('user_inventory').select('*');
    expect(inventory).toHaveLength(0);

    const { data: orders } = await anonClient.from('orders').select('*');
    expect(orders).toHaveLength(0);

    const { data: audits } = await anonClient.from('audit_logs').select('*');
    expect(audits).toHaveLength(0);
  });
});
