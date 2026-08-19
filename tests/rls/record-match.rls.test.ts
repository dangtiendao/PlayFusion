import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  anonClient,
  serviceClient,
  userAId,
  expectRlsBlocked,
} from './setup';

describe('RLS & RPC Security Suite: Ghi Ván Đấu Offline (0011_record_offline_match)', () => {
  const createdMatchIds: string[] = [];

  function generateTestMatchId(): string {
    const id = `00000000-0000-4000-a000-${Date.now().toString(16).padStart(12, '0')}`;
    createdMatchIds.push(id);
    return id;
  }

  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    if (isRlsTestConfigured() && serviceClient && createdMatchIds.length > 0) {
      // Dọn dẹp các ván đấu test đã tạo
      await serviceClient.from('match_participants').delete().in('match_id', createdMatchIds);
      await serviceClient.from('matches').delete().in('id', createdMatchIds);
    }
    await teardownRlsTestContext();
  });

  it('1. userA gọi RPC với payload hợp lệ (vs_ai) -> thành công, server TỰ GÁN user_id = A cho ghế người', async () => {
    if (!isRlsTestConfigured()) return;

    const matchId = generateTestMatchId();
    const payload = {
      match_id: matchId,
      game_id: 'caro',
      mode: 'vs_ai',
      started_at: new Date(Date.now() - 60000).toISOString(),
      duration_ms: 60000,
      end_reason: 'five_in_a_row',
      moves: '112,97,113',
      participants: [
        { seat_index: 0, is_bot: false, bot_level: null, result: 'win' },
        { seat_index: 1, is_bot: true, bot_level: 'medium', result: 'loss' },
      ],
    };

    const { data: returnedId, error } = await userAClient.rpc('record_offline_match', {
      p_match: payload,
    });

    expect(error).toBeNull();
    expect(returnedId).toBe(matchId);

    // Kiểm tra bản ghi trong DB bằng serviceClient
    const { data: matchRow } = await serviceClient
      .from('matches')
      .select('id, game_id, game_mode, is_ranked, status, duration_ms')
      .eq('id', matchId)
      .single();

    expect(matchRow?.id).toBe(matchId);
    expect(matchRow?.game_mode).toBe('vs_ai');
    expect(matchRow?.is_ranked).toBe(false);

    const { data: participants } = await serviceClient
      .from('match_participants')
      .select('seat_index, user_id, is_bot, bot_level, outcome')
      .eq('match_id', matchId)
      .order('seat_index');

    expect(participants).toHaveLength(2);
    // Ghế người: Server tự gán chính chủ userAId
    expect(participants?.[0]?.user_id).toBe(userAId);
    expect(participants?.[0]?.is_bot).toBe(false);
    expect(participants?.[0]?.outcome).toBe('win');

    // Ghế bot: user_id = null
    expect(participants?.[1]?.user_id).toBeNull();
    expect(participants?.[1]?.is_bot).toBe(true);
    expect(participants?.[1]?.bot_level).toBe('medium');
  });

  it('2. IDEMPOTENCY: Gọi lại RPC cùng match_id -> trả về cùng ID, KHÔNG tạo bản ghi trùng', async () => {
    if (!isRlsTestConfigured()) return;

    const matchId = generateTestMatchId();
    const payload = {
      match_id: matchId,
      game_id: 'caro',
      mode: 'vs_ai',
      started_at: new Date(Date.now() - 30000).toISOString(),
      duration_ms: 30000,
      end_reason: 'resigned',
      participants: [
        { seat_index: 0, is_bot: false, bot_level: null, result: 'win' },
        { seat_index: 1, is_bot: true, bot_level: 'easy', result: 'loss' },
      ],
    };

    // Lần 1
    const { data: id1, error: err1 } = await userAClient.rpc('record_offline_match', {
      p_match: payload,
    });
    expect(err1).toBeNull();
    expect(id1).toBe(matchId);

    // Lần 2 (Retry cùng match_id)
    const { data: id2, error: err2 } = await userAClient.rpc('record_offline_match', {
      p_match: payload,
    });
    expect(err2).toBeNull();
    expect(id2).toBe(matchId);

    // Kiểm tra số lượng bản ghi chỉ là 1
    const { count } = await serviceClient
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('id', matchId);
    expect(count).toBe(1);
  });

  it('3. RPC VALIDATION: Chặn mode online_1v1, game_id không tồn tại, và bot thiếu level', async () => {
    if (!isRlsTestConfigured()) return;

    // 3.1. Chặn mode online_1v1
    const matchId1 = generateTestMatchId();
    const { error: errMode } = await userAClient.rpc('record_offline_match', {
      p_match: {
        match_id: matchId1,
        game_id: 'caro',
        mode: 'online_1v1',
        started_at: new Date().toISOString(),
        duration_ms: 5000,
        participants: [
          { seat_index: 0, is_bot: false, result: 'win' },
          { seat_index: 1, is_bot: true, bot_level: 'easy', result: 'loss' },
        ],
      },
    });
    expect(errMode).not.toBeNull();
    expect(errMode?.message).toMatch(/Chế độ chơi "online_1v1" không hợp lệ/i);

    // 3.2. Chặn game_id không tồn tại
    const matchId2 = generateTestMatchId();
    const { error: errGame } = await userAClient.rpc('record_offline_match', {
      p_match: {
        match_id: matchId2,
        game_id: 'fake_game_xyz',
        mode: 'vs_ai',
        started_at: new Date().toISOString(),
        duration_ms: 5000,
        participants: [
          { seat_index: 0, is_bot: false, result: 'win' },
          { seat_index: 1, is_bot: true, bot_level: 'easy', result: 'loss' },
        ],
      },
    });
    expect(errGame).not.toBeNull();
    expect(errGame?.message).toMatch(/không tồn tại hoặc đã bị vô hiệu hóa/i);

    // 3.3. Chặn bot thiếu bot_level
    const matchId3 = generateTestMatchId();
    const { error: errBot } = await userAClient.rpc('record_offline_match', {
      p_match: {
        match_id: matchId3,
        game_id: 'caro',
        mode: 'vs_ai',
        started_at: new Date().toISOString(),
        duration_ms: 5000,
        participants: [
          { seat_index: 0, is_bot: false, result: 'win' },
          { seat_index: 1, is_bot: true, bot_level: null, result: 'loss' },
        ],
      },
    });
    expect(errBot).not.toBeNull();
    expect(errBot?.message).toMatch(/bắt buộc phải có bot_level hợp lệ/i);
  });

  it('4. CƯỠNG CHẾ BẢO MẬT: is_ranked trong payload bị server ghi đè thành false', async () => {
    if (!isRlsTestConfigured()) return;

    const matchId = generateTestMatchId();
    const payload = {
      match_id: matchId,
      game_id: 'caro',
      mode: 'vs_ai',
      is_ranked: true, // Cố tình gửi is_ranked = true
      season_id: 1, // Cố tình gửi season_id
      started_at: new Date(Date.now() - 10000).toISOString(),
      duration_ms: 10000,
      participants: [
        { seat_index: 0, is_bot: false, result: 'win' },
        { seat_index: 1, is_bot: true, bot_level: 'hard', result: 'loss' },
      ],
    };

    const { error } = await userAClient.rpc('record_offline_match', { p_match: payload });
    expect(error).toBeNull();

    // Kiểm tra DB: is_ranked bắt buộc là false, season_id là null
    const { data: matchRow } = await serviceClient
      .from('matches')
      .select('is_ranked, season_id')
      .eq('id', matchId)
      .single();

    expect(matchRow?.is_ranked).toBe(false);
    expect(matchRow?.season_id).toBeNull();
  });

  it('5. RLS BẢNG: userA INSERT trực tiếp vào matches -> VẪN BỊ CHẶN (Chỉ mở qua RPC)', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('matches')
        .insert({
          id: generateTestMatchId(),
          game_id: 'caro',
          game_mode: 'vs_ai',
          status: 'completed',
        })
        .select(),
    );
  });

  it('6. PHÂN QUYỀN RPC: anonClient gọi RPC record_offline_match -> BỊ CHẶN (42501)', async () => {
    if (!isRlsTestConfigured()) return;

    const matchId = generateTestMatchId();
    await expectRlsBlocked(
      anonClient.rpc('record_offline_match', {
        p_match: {
          match_id: matchId,
          game_id: 'caro',
          mode: 'vs_ai',
          started_at: new Date().toISOString(),
          duration_ms: 5000,
          participants: [
            { seat_index: 0, is_bot: false, result: 'win' },
            { seat_index: 1, is_bot: true, bot_level: 'easy', result: 'loss' },
          ],
        },
      }),
    );
  });
});
