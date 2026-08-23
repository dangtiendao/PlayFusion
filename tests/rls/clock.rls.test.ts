/**
 * ==============================================================================
 * RLS SECURITY SUITE: MATCH CLOCK, TIME CONTROL & CONFIG (0014_MATCH_CLOCK)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM CHỨNG (PHASE P3.4a):
 * 1. `public.match_live_state` CLOCK COLUMNS:
 *    - Đấu thủ trong trận (Participant) -> SELECT đọc được đầy đủ `clock`, `turn_started_at`, `turn_deadline`.
 *    - Người ngoài cuộc (Non-participant) -> Nhận 0 dòng (không xem trộm được đồng hồ của người khác).
 * 2. CẤM CLIENT GHI ĐỒNG HỒ (DENY WRITE):
 *    - Client tự ý UPDATE `clock` hoặc `turn_deadline` -> BỊ CHẶN 100% (0 rows affected / denied).
 * 3. `public.system_config` TIME CONTROL KEYS:
 *    - Người dùng đã đăng nhập (Authenticated) -> SELECT thấy 2 key `match.default_time_control` và `match.abort_move_threshold`.
 * ==============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  userBClient,
  anonClient,
  serviceClient,
  userAId,
  userBId,
  DEV_SUPABASE_URL,
  DEV_ANON_KEY,
  expectRlsBlocked,
} from './setup';

describe('RLS Security Suite: Match Clock & Time Control (0014_match_clock - P3.4a)', () => {
  let userCClient: SupabaseClient;
  let userCId = '';
  let testMatchId = '';

  beforeAll(async () => {
    await setupRlsTestContext();

    if (!isRlsTestConfigured()) return;

    // 1. Tạo User C (người ngoài cuộc)
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const userCEmail = `rls-clock-user-c-${uniqueSuffix}@playfusion.test`;
    const testPassword = 'RlsClockPassword123!@#';

    const { data: userCRes, error: errC } = await serviceClient.auth.admin.createUser({
      email: userCEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `RLS Clock User C ${uniqueSuffix}` },
    });
    if (errC || !userCRes.user) {
      throw new Error(`Không thể khởi tạo User C: ${errC?.message}`);
    }
    userCId = userCRes.user.id;

    userCClient = createClient(DEV_SUPABASE_URL, DEV_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signinErr } = await userCClient.auth.signInWithPassword({
      email: userCEmail,
      password: testPassword,
    });
    if (signinErr) {
      throw new Error(`User C đăng nhập thất bại: ${signinErr.message}`);
    }

    // 2. Tạo trận đấu mẫu và nạp match_live_state có dữ liệu đồng hồ (Service Role)
    const { data: matchData, error: matchErr } = await serviceClient
      .from('matches')
      .insert({
        game_id: 'caro',
        game_mode: 'online_1v1',
        is_ranked: true,
        status: 'in_progress',
        time_control: { baseSeconds: 300, incrementSeconds: 5 },
      })
      .select('id')
      .single();

    if (matchErr || !matchData) {
      throw new Error(`Không thể tạo trận test: ${matchErr?.message}`);
    }
    testMatchId = matchData.id;

    // Gắn User A (Seat 0) và User B (Seat 1) vào trận
    await serviceClient.from('match_participants').insert([
      { match_id: testMatchId, seat_index: 0, user_id: userAId },
      { match_id: testMatchId, seat_index: 1, user_id: userBId },
    ]);

    // Nạp match_live_state với clock và turn_started_at
    const nowIso = new Date().toISOString();
    const deadlineIso = new Date(Date.now() + 30000).toISOString();
    await serviceClient.from('match_live_state').insert({
      match_id: testMatchId,
      state_serialized: '{"board":[]}',
      move_index: 0,
      current_seat: 0,
      moves_serialized: '',
      clock: { '0': 300000, '1': 300000 },
      turn_started_at: nowIso,
      turn_deadline: deadlineIso,
    });
  });

  afterAll(async () => {
    if (isRlsTestConfigured()) {
      if (testMatchId) {
        await serviceClient.from('matches').delete().eq('id', testMatchId);
      }
      if (userCId) {
        await serviceClient.auth.admin.deleteUser(userCId);
      }
    }
    await teardownRlsTestContext();
  });

  // ============================================================================
  // TEST CASES
  // ============================================================================

  it('1. Đấu thủ tham gia (User A & User B) SELECT thấy đầy đủ clock, turn_started_at, turn_deadline', async () => {
    if (!isRlsTestConfigured()) return;

    const { data: dataA, error: errA } = await userAClient
      .from('match_live_state')
      .select('match_id, clock, turn_started_at, turn_deadline, current_seat')
      .eq('match_id', testMatchId)
      .single();

    expect(errA).toBeNull();
    expect(dataA).not.toBeNull();
    expect(dataA?.clock).toEqual({ '0': 300000, '1': 300000 });
    expect(dataA?.turn_started_at).not.toBeNull();
    expect(dataA?.turn_deadline).not.toBeNull();

    const { data: dataB, error: errB } = await userBClient
      .from('match_live_state')
      .select('match_id, clock')
      .eq('match_id', testMatchId)
      .single();

    expect(errB).toBeNull();
    expect(dataB?.clock).toEqual({ '0': 300000, '1': 300000 });
  });

  it('2. Người ngoài cuộc (User C) và Anon SELECT match_live_state -> Nhận 0 dòng', async () => {
    if (!isRlsTestConfigured()) return;

    const { data: dataC, error: errC } = await userCClient
      .from('match_live_state')
      .select('match_id, clock')
      .eq('match_id', testMatchId);

    expect(errC).toBeNull();
    expect(dataC).toEqual([]);

    const { data: dataAnon } = await anonClient
      .from('match_live_state')
      .select('match_id, clock')
      .eq('match_id', testMatchId);

    expect(dataAnon).toEqual([]);
  });

  it('3. Client (User A) cố tình UPDATE clock hoặc turn_deadline -> Bị chặn 100%', async () => {
    if (!isRlsTestConfigured()) return;

    const res = await userAClient
      .from('match_live_state')
      .update({
        clock: { '0': 999999, '1': 0 },
        turn_deadline: new Date(Date.now() + 1000000).toISOString(),
      })
      .eq('match_id', testMatchId)
      .select();

    expectRlsBlocked(res);

    // Xác nhận giá trị trong DB không bị thay đổi
    const { data: freshState } = await serviceClient
      .from('match_live_state')
      .select('clock')
      .eq('match_id', testMatchId)
      .single();

    expect(freshState?.clock).toEqual({ '0': 300000, '1': 300000 });
  });

  it('4. Authenticated SELECT system_config thấy 2 key time control mới (match.default_time_control, match.abort_move_threshold)', async () => {
    if (!isRlsTestConfigured()) return;

    const { data: configs, error } = await userAClient
      .from('system_config')
      .select('key, value')
      .in('key', ['match.default_time_control', 'match.abort_move_threshold']);

    expect(error).toBeNull();
    expect(configs).toHaveLength(2);

    const defaultTimeControl = configs?.find((c) => c.key === 'match.default_time_control');
    expect(defaultTimeControl?.value).toEqual({
      baseSeconds: 300,
      incrementSeconds: 5,
    });

    const abortThreshold = configs?.find((c) => c.key === 'match.abort_move_threshold');
    expect(abortThreshold?.value).toEqual({ moves: 3 });
  });
});
