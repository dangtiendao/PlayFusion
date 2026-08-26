/**
 * ==============================================================================
 * RLS & APPEND-ONLY SUITE: HUY HIỆU MÙA GIẢI (USER_SEASON_BADGES)
 * (TESTS/RLS/SEASON-BADGES.RLS.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P4.6A):
 * 1. SELECT CÔNG KHAI: service_role INSERT huy hiệu -> userA, userB và anon đều SELECT thấy.
 * 2. KHÓA GHI CLIENT 100%: userA, userB, anon INSERT/UPDATE/DELETE đều bị chặn bởi RLS.
 * 3. TRIGGER BẤT BIẾN (APPEND-ONLY): service_role UPDATE hoặc DELETE đều bị chặn bởi trigger.
 * 4. CHỐNG TRÙNG IDEMPOTENCY: service_role INSERT trùng bộ (user_id, season_id, game_id) bị ném lỗi UNIQUE (23505).
 * 5. MỞ RỘNG SYSTEM_CONFIG: authenticated và anon đọc được các key 'season.soft_reset' và 'season.decay'.
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
  serviceClient,
  userAId,
  expectRlsBlocked,
} from './setup';

describe.runIf(isRlsTestConfigured())(
  'RLS Security & Append-Only Suite: Huy Hiệu Mùa Giải (P4.6a)',
  () => {
    let testSeasonId = 1;
    let insertedBadgeId = '';

    beforeAll(async () => {
      await setupRlsTestContext();

      // Đảm bảo có ít nhất 1 mùa giải trong bảng seasons
      const { data: season } = await serviceClient
        .from('seasons')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (season?.id) {
        testSeasonId = season.id;
      }
    });

    afterAll(async () => {
      await teardownRlsTestContext();
    });

    it('1. [Ma trận: user_season_badges -> SELECT (Công Khai)] service_role tạo huy hiệu -> userA, userB, anon đều xem được', async () => {
      // 1.1 service_role cấp phát 1 huy hiệu cho userA
      const testBadge = {
        user_id: userAId,
        season_id: testSeasonId,
        game_id: 'caro',
        final_rating: 1350,
        final_tier: 'gold',
        final_rank: 5,
        games_played: 24,
        wins: 16,
        losses: 6,
        draws: 2,
      };

      const { data: inserted, error: insertErr } = await serviceClient
        .from('user_season_badges')
        .insert(testBadge)
        .select()
        .single();

      expect(insertErr).toBeNull();
      expect(inserted).toBeTruthy();
      insertedBadgeId = inserted.id;

      // 1.2 Chính chủ (userA) SELECT thấy
      const { data: dataA, error: errA } = await userAClient
        .from('user_season_badges')
        .select('*')
        .eq('id', insertedBadgeId)
        .single();

      expect(errA).toBeNull();
      expect(dataA?.user_id).toBe(userAId);
      expect(dataA?.final_tier).toBe('gold');
      expect(dataA?.final_rank).toBe(5);

      // 1.3 Người khác (userB) SELECT thấy công khai (để khoe trên profile / bảng vàng)
      const { data: dataB, error: errB } = await userBClient
        .from('user_season_badges')
        .select('*')
        .eq('id', insertedBadgeId)
        .single();

      expect(errB).toBeNull();
      expect(dataB?.id).toBe(insertedBadgeId);

      // 1.4 Khách vãng lai (anon) SELECT thấy
      const { data: dataAnon, error: errAnon } = await anonClient
        .from('user_season_badges')
        .select('*')
        .eq('id', insertedBadgeId)
        .single();

      expect(errAnon).toBeNull();
      expect(dataAnon?.id).toBe(insertedBadgeId);
    });

    it('2. [Ma trận: user_season_badges -> INSERT (Client)] userA/userB/anon tự INSERT huy hiệu -> BỊ CHẶN (42501)', async () => {
      const fakeBadge = {
        user_id: userAId,
        season_id: testSeasonId,
        game_id: 'caro',
        final_rating: 2500,
        final_tier: 'master',
        final_rank: 1,
        games_played: 100,
        wins: 100,
        losses: 0,
        draws: 0,
      };

      // userA tự phong Master
      await expectRlsBlocked(userAClient.from('user_season_badges').insert(fakeBadge).select());

      // userB cố insert cho userA
      await expectRlsBlocked(userBClient.from('user_season_badges').insert(fakeBadge).select());

      // anon cố insert
      await expectRlsBlocked(anonClient.from('user_season_badges').insert(fakeBadge).select());
    });

    it('3. [Ma trận: user_season_badges -> UPDATE/DELETE (Client)] userA/userB/anon cố UPDATE hoặc DELETE -> BỊ CHẶN (42501)', async () => {
      // userA cố sửa tier của mình lên Master
      await expectRlsBlocked(
        userAClient
          .from('user_season_badges')
          .update({ final_tier: 'master', final_rating: 3000 })
          .eq('id', insertedBadgeId)
          .select(),
      );

      // userA cố xóa huy hiệu
      await expectRlsBlocked(
        userAClient.from('user_season_badges').delete().eq('id', insertedBadgeId).select(),
      );
    });

    it('4. [Trigger Bất Biến Append-Only] service_role cố UPDATE hoặc DELETE -> BỊ CHẶN BỞI TRIGGER', async () => {
      // service_role cố UPDATE
      const { error: updateErr } = await serviceClient
        .from('user_season_badges')
        .update({ final_rating: 9999 })
        .eq('id', insertedBadgeId);

      expect(updateErr).not.toBeNull();
      expect(updateErr?.message).toContain('Season badges are permanent append-only records');

      // service_role cố DELETE
      const { error: deleteErr } = await serviceClient
        .from('user_season_badges')
        .delete()
        .eq('id', insertedBadgeId);

      expect(deleteErr).not.toBeNull();
      expect(deleteErr?.message).toContain('Season badges are permanent append-only records');
    });

    it('5. [Chống Trùng Idempotency] service_role INSERT trùng bộ (user_id, season_id, game_id) -> BỊ CHẶN (23505)', async () => {
      // Thử tạo lại huy hiệu cho userA cùng mùa và cùng game
      const duplicateBadge = {
        user_id: userAId,
        season_id: testSeasonId,
        game_id: 'caro',
        final_rating: 1200,
        final_tier: 'silver',
        games_played: 10,
      };

      const { error: dupErr } = await serviceClient
        .from('user_season_badges')
        .insert(duplicateBadge);

      expect(dupErr).not.toBeNull();
      expect(dupErr?.code).toBe('23505'); // unique_violation
    });

    it('6. [Mở Rộng system_config] Client authenticated và anon đọc được các key tiền tố "season."', async () => {
      // 6.1 userA đọc cấu hình soft-reset và decay
      const { data: configA, error: errConfigA } = await userAClient
        .from('system_config')
        .select('key, value')
        .in('key', ['season.soft_reset', 'season.decay']);

      expect(errConfigA).toBeNull();
      expect(configA).toHaveLength(2);

      const softResetConfig = configA?.find((c) => c.key === 'season.soft_reset');
      expect(softResetConfig?.value).toEqual({ factor: 0.6, offset: 480 });

      const decayConfig = configA?.find((c) => c.key === 'season.decay');
      expect(decayConfig?.value).toEqual({
        inactive_days: 30,
        points_per_week: 10,
        min_rating: 1600,
      });

      // 6.2 anon đọc cấu hình season.*
      const { data: configAnon, error: errConfigAnon } = await anonClient
        .from('system_config')
        .select('key, value')
        .eq('key', 'season.soft_reset')
        .single();

      expect(errConfigAnon).toBeNull();
      expect(configAnon?.value).toEqual({ factor: 0.6, offset: 480 });
    });

    it('7. [Ma trận: rating_decay_log -> SELECT (Chính Chủ)] userA xem được log của mình, userB/anon thấy 0 dòng', async () => {
      // 7.1 service_role tạo 1 bản ghi decay log cho userA
      const testDecayLog = {
        user_id: userAId,
        game_id: 'caro',
        season_id: testSeasonId,
        week_key: '2026-99',
        points: 10,
        rating_before: 1700,
        rating_after: 1690,
      };

      const { data: insertedLog, error: insertLogErr } = await serviceClient
        .from('rating_decay_log')
        .insert(testDecayLog)
        .select()
        .single();

      expect(insertLogErr).toBeNull();
      expect(insertedLog).toBeTruthy();
      const logId = insertedLog.id;

      // 7.2 userA (chính chủ) SELECT thấy
      const { data: dataA, error: errA } = await userAClient
        .from('rating_decay_log')
        .select('*')
        .eq('id', logId)
        .single();

      expect(errA).toBeNull();
      expect(dataA?.user_id).toBe(userAId);
      expect(dataA?.points).toBe(10);

      // 7.3 userB (người khác) SELECT -> 0 dòng
      const { data: dataB, error: errB } = await userBClient
        .from('rating_decay_log')
        .select('*')
        .eq('id', logId);

      expect(errB).toBeNull();
      expect(dataB).toHaveLength(0);

      // 7.4 anon SELECT -> 0 dòng
      const { data: dataAnon, error: errAnon } = await anonClient
        .from('rating_decay_log')
        .select('*')
        .eq('id', logId);

      expect(errAnon).toBeNull();
      expect(dataAnon).toHaveLength(0);
    });

    it('8. [Ma trận: rating_decay_log -> INSERT/UPDATE/DELETE (Client & Append-Only)] Bị chặn bởi RLS & Trigger', async () => {
      const fakeLog = {
        user_id: userAId,
        game_id: 'caro',
        season_id: testSeasonId,
        week_key: '2026-98',
        points: 10,
        rating_before: 1700,
        rating_after: 1690,
      };

      // userA cố tự INSERT
      await expectRlsBlocked(userAClient.from('rating_decay_log').insert(fakeLog).select());

      // service_role cố UPDATE bản ghi decay log -> Bị chặn bởi Trigger Append-Only
      const { error: updateErr } = await serviceClient
        .from('rating_decay_log')
        .update({ points: 99 })
        .eq('week_key', '2026-99');

      expect(updateErr).not.toBeNull();
      expect(updateErr?.message).toContain(
        'Rating decay logs are permanent append-only audit records',
      );
    });
  },
);
