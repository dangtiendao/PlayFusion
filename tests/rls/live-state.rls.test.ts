/**
 * ==============================================================================
 * RLS SECURITY SUITE: THẾ CỜ TRẬN ĐẤU ONLINE (MATCH_LIVE_STATE & RPC)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM CHỨNG (PHASE P3.2b):
 * 1. `public.match_live_state` SELECT:
 *    - Đấu thủ trong trận (Participant: UserA, UserB) -> Đọc được 1 dòng thế cờ của trận mình.
 *    - Người ngoài (UserC) -> Nhận mảng rỗng (0 dòng, không xem trộm được chiến thuật).
 *    - Khách chưa đăng nhập (Anon) -> Nhận mảng rỗng / Bị chặn.
 * 2. `public.match_live_state` GHI (INSERT / UPDATE / DELETE):
 *    - Khóa 100% đối với mọi client (deny-write).
 * 3. RPC `public.create_test_online_match`:
 *    - Người dùng đã đăng nhập tạo trận với đối thủ khác -> Thành công trả về match_id.
 *    - Tạo trận với chính mình -> Bị ném lỗi ngoại lệ.
 *    - Khách anon gọi -> Bị chặn mã 42501 (Permission Denied).
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
  userBId,
  DEV_SUPABASE_URL,
  DEV_ANON_KEY,
  expectRlsBlocked,
} from './setup';

describe('RLS Security Suite: match_live_state & create_test_online_match (P3.2b)', () => {
  let userCClient: SupabaseClient;
  let userCId = '';
  let createdMatchId: string | null = null;

  beforeAll(async () => {
    await setupRlsTestContext();

    if (!isRlsTestConfigured()) return;

    // Khởi tạo thêm User C (người ngoài cuộc)
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const userCEmail = `rls-test-user-c-${uniqueSuffix}@playfusion.test`;
    const testPassword = 'RlsTestPassword123!@#';

    const { data: userCRes, error: errC } = await serviceClient.auth.admin.createUser({
      email: userCEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `RLS Test User C ${uniqueSuffix}` },
    });
    if (errC || !userCRes.user) {
      throw new Error(`Không thể khởi tạo User C: ${errC?.message}`);
    }
    userCId = userCRes.user.id;

    userCClient = createClient(DEV_SUPABASE_URL, DEV_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await userCClient.auth.signInWithPassword({
      email: userCEmail,
      password: testPassword,
    });
  });

  afterAll(async () => {
    if (isRlsTestConfigured() && serviceClient) {
      // Dọn dẹp match test nếu có
      if (createdMatchId) {
        await serviceClient.from('matches').delete().eq('id', createdMatchId);
      }
      // Dọn dẹp User C
      if (userCId) {
        await serviceClient.auth.admin.deleteUser(userCId);
      }
    }

    await teardownRlsTestContext();
  });

  it('1. [Setup Match] userA tạo phòng và userB join phòng thành công để khởi tạo ván đấu', async () => {
    if (!isRlsTestConfigured()) return;

    const { data: createRes, error: createErr } = await userAClient.rpc('create_room', {
      p_game_id: 'caro',
    });
    expect(createErr).toBeNull();
    const code = createRes[0].code;

    const { data: joinRes, error: joinErr } = await userBClient.rpc('join_room', {
      p_code: code,
    });
    expect(joinErr).toBeNull();
    createdMatchId = joinRes[0].match_id;

    // Kiểm tra match_participants đã có 2 bản ghi (Seat 0 và Seat 1)
    const { data: participants } = await serviceClient
      .from('match_participants')
      .select('*')
      .eq('match_id', createdMatchId);

    expect(participants).toHaveLength(2);

    // Chèn dòng match_live_state giả lập từ Service Role (mô phỏng Edge Function referee init)
    const { error: insertErr } = await serviceClient.from('match_live_state').insert({
      match_id: createdMatchId,
      state_serialized: 'v1:15:5:0:1:0:0:-1:225.',
      move_index: 0,
      current_seat: 0,
      moves_serialized: '',
    });
    expect(insertErr).toBeNull();
  });

  it('2. [RLS: match_live_state -> SELECT] userA và userB (participants) ĐỌC ĐƯỢC thế cờ của trận mình', async () => {
    if (!isRlsTestConfigured() || !createdMatchId) return;

    // userA đọc
    const { data: dataA, error: errA } = await userAClient
      .from('match_live_state')
      .select('*')
      .eq('match_id', createdMatchId)
      .single();

    expect(errA).toBeNull();
    expect(dataA).toBeDefined();
    expect(dataA?.match_id).toBe(createdMatchId);
    expect(dataA?.state_serialized).toBe('v1:15:5:0:1:0:0:-1:225.');

    // userB đọc
    const { data: dataB, error: errB } = await userBClient
      .from('match_live_state')
      .select('*')
      .eq('match_id', createdMatchId)
      .single();

    expect(errB).toBeNull();
    expect(dataB).toBeDefined();
    expect(dataB?.match_id).toBe(createdMatchId);
  });

  it('3. [RLS: match_live_state -> SELECT] userC (người ngoài) KHÔNG THỂ xem trộm thế cờ đang đấu', async () => {
    if (!isRlsTestConfigured() || !createdMatchId) return;

    const { data: dataC } = await userCClient
      .from('match_live_state')
      .select('*')
      .eq('match_id', createdMatchId);

    // Policy USING lọc trả về mảng rỗng
    expect(dataC).toEqual([]);
  });

  it('4. [RLS: match_live_state -> SELECT] anon client KHÔNG THỂ đọc thế cờ', async () => {
    if (!isRlsTestConfigured() || !createdMatchId) return;

    const { data: dataAnon } = await anonClient
      .from('match_live_state')
      .select('*')
      .eq('match_id', createdMatchId);

    expect(dataAnon).toEqual([]);
  });

  it('5. [RLS: match_live_state -> INSERT / UPDATE / DELETE] userA KHÔNG THỂ tự ghi/sửa/xóa thế cờ (deny-write)', async () => {
    if (!isRlsTestConfigured() || !createdMatchId) return;

    // Thử UPDATE
    await expectRlsBlocked(
      userAClient
        .from('match_live_state')
        .update({ move_index: 99 })
        .eq('match_id', createdMatchId)
        .select(),
    );

    // Thử DELETE
    await expectRlsBlocked(
      userAClient.from('match_live_state').delete().eq('match_id', createdMatchId).select(),
    );

    // Thử INSERT
    await expectRlsBlocked(
      userAClient
        .from('match_live_state')
        .insert({
          match_id: 'a0000000-0000-0000-0000-000000000099',
          state_serialized: 'fake',
          move_index: 0,
          current_seat: 0,
        })
        .select(),
    );
  });

  it('6. [RPC: create_test_online_match] ĐÃ DROP -> Gọi RPC ném lỗi function not found', async () => {
    if (!isRlsTestConfigured()) return;

    const { error } = await userAClient.rpc('create_test_online_match', {
      p_opponent_id: userBId,
    });

    expect(error).not.toBeNull();
  });
});
