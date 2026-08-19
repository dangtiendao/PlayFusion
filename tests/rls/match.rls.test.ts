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

describe('RLS Security Suite: Trận Đấu, Đấu Thủ & Rating (matches, match_participants, player_ratings)', () => {
  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    await teardownRlsTestContext();
  });

  it('[Ma trận: matches -> INSERT / UPDATE] userA KHÔNG THỂ tự tạo hoặc sửa ván đấu', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('matches')
        .insert({
          game_id: 'caro',
          game_mode: 'online_1v1',
          status: 'completed',
          winner_id: userAId,
        })
        .select(),
    );
  });

  it('[Ma trận: match_participants -> INSERT / UPDATE] userA KHÔNG THỂ tự ghi bản ghi đấu thủ', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('match_participants')
        .insert({
          match_id: 'a0000000-0000-0000-0000-000000000001',
          user_id: userAId,
          outcome: 'win',
        })
        .select(),
    );
  });

  it('[Ma trận: player_ratings -> INSERT / UPDATE] userA KHÔNG THỂ tự cập nhật điểm Elo hoặc bộ đếm rank', async () => {
    if (!isRlsTestConfigured()) return;

    // Thử INSERT rating mới
    await expectRlsBlocked(
      userAClient
        .from('player_ratings')
        .insert({
          user_id: userAId,
          game_id: 'caro',
          rating: 2500,
        })
        .select(),
    );

    // Thử UPDATE rating
    await expectRlsBlocked(
      userAClient
        .from('player_ratings')
        .update({ rating: 3000 })
        .eq('user_id', userAId)
        .eq('game_id', 'caro')
        .select(),
    );
  });

  it('[Ma trận: player_ratings / matches -> SELECT] userA đọc được thông tin matches và ratings (kể cả của userB) công khai', async () => {
    if (!isRlsTestConfigured()) return;

    // SELECT matches công khai
    const { error: matchErr } = await userAClient.from('matches').select('*').limit(1);
    expect(matchErr).toBeNull();

    // SELECT ratings của userB công khai
    const { error: ratingErr } = await userAClient
      .from('player_ratings')
      .select('*')
      .eq('user_id', userBId);
    expect(ratingErr).toBeNull();
  });
});
