/**
 * ==============================================================================
 * UNIT TESTS CHO BỘ NÃO KẾT TOÁN SETTLE (SUPABASE/FUNCTIONS/TESTS/SETTLE.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P4.2C):
 * 1. buildSettlement: Bao phủ toàn bộ các nhánh No-op (unranked, abort, missing season, bot, missing result).
 * 2. buildSettlement: Kiểm tra khớp 100% các vector tính điểm Elo chuẩn P4.1 (1200v1200, cửa dưới 1200v1400, hòa, tân thủ K=60, mismatch >400).
 * 3. executeSettlement: Mocking đầy đủ luồng Settle, Idempotent applied: false, Retry STALE_RATING đúng 1 lần, và Fail-safe khi có lỗi DB.
 * ==============================================================================
 */

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      msg || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`,
    );
  }
}

function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

import {
  buildSettlement,
  executeSettlement,
  parseRepeatOpponentConfig,
  parseDailyCap,
  parseAbandonPenalty,
  getVietnamStartOfDayIso,
  type BuildSettlementInput,
} from '../referee/settle.ts';

const DEFAULT_CONFIG_ROWS: Record<string, unknown> = {
  'elo.k_placement': { k: 60 },
  'elo.k_normal': { k: 32 },
  'elo.k_high': { k: 16, threshold: 2000 },
  'elo.placement_games': { games: 15 },
  'elo.mismatch_threshold': { points: 400 },
  'elo.mismatch_dampen': { factor: 0.5 },
  'reward.win_ranked': { coins: 50 },
  'reward.loss_ranked': { coins: 5 },
  'reward.draw_ranked': { coins: 20 },
  'reward.daily_cap': { coins: 500 },
  'reward.repeat_opponent': { full_matches: 2, dampen_factor: 0.5, zero_after: 5 },
  'penalty.abandon': { coins: -20 },
};

// ==============================================================================
// 1. KIỂM THỬ CÁC NHÁNH NO-OP TRONG BUILDSETTLEMENT
// ==============================================================================
Deno.test('1. [buildSettlement: No-op] Trận unranked (is_ranked = false) -> noop', () => {
  const input: BuildSettlementInput = {
    match: {
      game_id: 'caro',
      mode: 'online_1v1',
      is_ranked: false,
      season_id: 1,
      end_reason: 'normal',
    },
    participants: [
      { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
      { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
    ],
    currentRatings: {},
    configRows: DEFAULT_CONFIG_ROWS,
  };

  const decision = buildSettlement(input);
  assertEquals(decision.is_noop, true);
  if (decision.is_noop) {
    assertEquals(decision.reason, 'unranked_match');
  }
});

Deno.test('2. [buildSettlement: No-op] Trận abort (end_reason = "abort") -> noop', () => {
  const input: BuildSettlementInput = {
    match: {
      game_id: 'caro',
      mode: 'online_1v1',
      is_ranked: true,
      season_id: 1,
      end_reason: 'abort',
    },
    participants: [
      { user_id: 'u1', seat_index: 0, result: null, is_bot: false },
      { user_id: 'u2', seat_index: 1, result: null, is_bot: false },
    ],
    currentRatings: {},
    configRows: DEFAULT_CONFIG_ROWS,
  };

  const decision = buildSettlement(input);
  assertEquals(decision.is_noop, true);
  if (decision.is_noop) {
    assertEquals(decision.reason, 'match_aborted');
  }
});

Deno.test('3. [buildSettlement: No-op] Thiếu season_id (season_id = null) -> noop', () => {
  const input: BuildSettlementInput = {
    match: {
      game_id: 'caro',
      mode: 'online_1v1',
      is_ranked: true,
      season_id: null,
      end_reason: 'normal',
    },
    participants: [
      { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
      { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
    ],
    currentRatings: {},
    configRows: DEFAULT_CONFIG_ROWS,
  };

  const decision = buildSettlement(input);
  assertEquals(decision.is_noop, true);
  if (decision.is_noop) {
    assertEquals(decision.reason, 'missing_season');
  }
});

Deno.test('4. [buildSettlement: No-op] Có Bot hoặc user_id = null -> noop', () => {
  const input: BuildSettlementInput = {
    match: {
      game_id: 'caro',
      mode: 'vs_ai',
      is_ranked: true,
      season_id: 1,
      end_reason: 'normal',
    },
    participants: [
      { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
      { user_id: null, seat_index: 1, result: 'loss', is_bot: true },
    ],
    currentRatings: {},
    configRows: DEFAULT_CONFIG_ROWS,
  };

  const decision = buildSettlement(input);
  assertEquals(decision.is_noop, true);
  if (decision.is_noop) {
    assertEquals(decision.reason, 'has_bot_or_anonymous_participant');
  }
});

Deno.test('5. [buildSettlement: No-op] Đấu thủ thiếu result (result = null) -> noop', () => {
  const input: BuildSettlementInput = {
    match: {
      game_id: 'caro',
      mode: 'online_1v1',
      is_ranked: true,
      season_id: 1,
      end_reason: 'normal',
    },
    participants: [
      { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
      { user_id: 'u2', seat_index: 1, result: null, is_bot: false },
    ],
    currentRatings: {},
    configRows: DEFAULT_CONFIG_ROWS,
  };

  const decision = buildSettlement(input);
  assertEquals(decision.is_noop, true);
  if (decision.is_noop) {
    assertEquals(decision.reason, 'missing_participant_result');
  }
});

// ==============================================================================
// 2. KIỂM THỬ RANKED 1V1 KHỚP VỚI CÁC VECTOR TOÁN HỌC P4.1
// ==============================================================================
Deno.test(
  '6. [buildSettlement: Vector a] 1200 vs 1200 (Player A win) -> delta +16 / -16, coins 50 / 5',
  () => {
    const input: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'normal',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 20 },
        u2: { rating: 1200, gamesPlayed: 20 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
    };

    const decision = buildSettlement(input);
    assertEquals(decision.is_noop, false);
    if (!decision.is_noop) {
      assertEquals(decision.payload.placement_games, 15);
      const [e0, e1] = decision.payload.entries;

      // User 1 (Win)
      assertEquals(e0.user_id, 'u1');
      assertEquals(e0.rating_before, 1200);
      assertEquals(e0.rating_after, 1216);
      assertEquals(e0.rating_delta, 16);
      assertEquals(e0.outcome, 'win');
      assertEquals(e0.coins, 50);

      // User 2 (Loss)
      assertEquals(e1.user_id, 'u2');
      assertEquals(e1.rating_before, 1200);
      assertEquals(e1.rating_after, 1184);
      assertEquals(e1.rating_delta, -16);
      assertEquals(e1.outcome, 'loss');
      assertEquals(e1.coins, 5);
    }
  },
);

Deno.test(
  '7. [buildSettlement: Vector b] Cửa dưới 1200 vs 1400 (Player A win) -> delta +24 / -24',
  () => {
    const input: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'resign', // Resign vẫn tính đủ thưởng
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 30 },
        u2: { rating: 1400, gamesPlayed: 30 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
    };

    const decision = buildSettlement(input);
    assertEquals(decision.is_noop, false);
    if (!decision.is_noop) {
      const [e0, e1] = decision.payload.entries;
      assertEquals(e0.rating_delta, 24);
      assertEquals(e0.rating_after, 1224);
      assertEquals(e0.coins, 50);

      assertEquals(e1.rating_delta, -24);
      assertEquals(e1.rating_after, 1376);
      assertEquals(e1.coins, 5);
    }
  },
);

Deno.test('8. [buildSettlement: Vector d] 1200 vs 1200 (Hòa) -> delta 0 / 0, coins 20 / 20', () => {
  const input: BuildSettlementInput = {
    match: {
      game_id: 'caro',
      mode: 'online_1v1',
      is_ranked: true,
      season_id: 1,
      end_reason: 'normal',
    },
    participants: [
      { user_id: 'u1', seat_index: 0, result: 'draw', is_bot: false },
      { user_id: 'u2', seat_index: 1, result: 'draw', is_bot: false },
    ],
    currentRatings: {
      u1: { rating: 1200, gamesPlayed: 20 },
      u2: { rating: 1200, gamesPlayed: 20 },
    },
    configRows: DEFAULT_CONFIG_ROWS,
  };

  const decision = buildSettlement(input);
  assertEquals(decision.is_noop, false);
  if (!decision.is_noop) {
    const [e0, e1] = decision.payload.entries;
    assertEquals(e0.rating_delta, 0);
    assertEquals(e0.rating_after, 1200);
    assertEquals(e0.coins, 20);

    assertEquals(e1.rating_delta, 0);
    assertEquals(e1.rating_after, 1200);
    assertEquals(e1.coins, 20);
  }
});

Deno.test(
  '9. [buildSettlement: Placement K=60] Tân thủ (3 trận, 1200) vs Thường (30 trận, 1200) -> delta +30 / -16',
  () => {
    const input: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'normal',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 3 }, // Tân thủ K=60
        u2: { rating: 1200, gamesPlayed: 30 }, // Thường K=32
      },
      configRows: DEFAULT_CONFIG_ROWS,
    };

    const decision = buildSettlement(input);
    assertEquals(decision.is_noop, false);
    if (!decision.is_noop) {
      const [e0, e1] = decision.payload.entries;
      assertEquals(e0.rating_delta, 30);
      assertEquals(e0.rating_after, 1230);
      assertEquals(e0.coins, 50);

      assertEquals(e1.rating_delta, -16);
      assertEquals(e1.rating_after, 1184);
      assertEquals(e1.coins, 5);
    }
  },
);

Deno.test(
  '10. [buildSettlement: Mismatch > 400] 1700 vs 1250 (Bên mạnh thắng) -> K_A giảm 50% (K=16) -> delta +1 / -2',
  () => {
    const input: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'normal',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1700, gamesPlayed: 50 },
        u2: { rating: 1250, gamesPlayed: 50 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
    };

    const decision = buildSettlement(input);
    assertEquals(decision.is_noop, false);
    if (!decision.is_noop) {
      const [e0, e1] = decision.payload.entries;
      assertEquals(e0.rating_delta, 1);
      assertEquals(e0.rating_after, 1701);
      assertEquals(e0.coins, 50);

      assertEquals(e1.rating_delta, -2);
      assertEquals(e1.rating_after, 1248);
      assertEquals(e1.coins, 5);
    }
  },
);

// ==============================================================================
// 3. KIỂM THỬ EXECUTE_SETTLEMENT & MOCKING WIRING
// ==============================================================================
Deno.test(
  '11. [executeSettlement: Happy Path] Kết toán thành công -> broadcast match_settled và log settled',
  async () => {
    const matchId = 'm1111111-0000-0000-0000-000000000001';
    let broadcastCalled = false;
    let broadcastEvent = '';
    let broadcastPayload: { matchId: string; deltas: { ratingDelta: number }[] } | null = null;
    const logEntries: Record<string, unknown>[] = [];

    const mockAdminClient = {
      from: (table: string) => {
        if (table === 'matches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: matchId,
                    game_id: 'caro',
                    mode: 'online_1v1',
                    is_ranked: true,
                    season_id: 1,
                    end_reason: 'normal',
                    ended_at: new Date().toISOString(),
                    settled_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'match_participants') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
                  { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'system_config') {
          return {
            select: async () => ({
              data: [
                { key: 'reward.win_ranked', value: { coins: 50 } },
                { key: 'reward.loss_ranked', value: { coins: 5 } },
              ],
              error: null,
            }),
          };
        }
        if (table === 'player_ratings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: async () => ({
                    data: [
                      { user_id: 'u1', rating: 1200, games_played: 20 },
                      { user_id: 'u2', rating: 1200, games_played: 20 },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
      rpc: async (fn: string, params: { p: Record<string, unknown> }) => {
        assertEquals(fn, 'apply_match_settlement');
        assertEquals(params.p.match_id, matchId);
        return {
          data: { applied: true, entries: 2 },
          error: null,
        };
      },
    };

    await executeSettlement(
      matchId,
      mockAdminClient as never,
      async (id, eventType, payload) => {
        assertEquals(id, matchId);
        broadcastCalled = true;
        broadcastEvent = eventType;
        broadcastPayload = payload as { matchId: string; deltas: { ratingDelta: number }[] };
      },
      (entry) => {
        logEntries.push(entry);
      },
    );

    assertEquals(broadcastCalled, true);
    assertEquals(broadcastEvent, 'match_settled');
    const payload = broadcastPayload as {
      matchId: string;
      deltas: { ratingDelta: number }[];
    } | null;
    assert(payload !== null, 'broadcastPayload không được null');
    assertEquals(payload.matchId, matchId);
    assertEquals(payload.deltas.length, 2);
    assertEquals(payload.deltas[0].ratingDelta, 16);
    assertEquals(payload.deltas[1].ratingDelta, -16);

    const settledLog = logEntries.find((l) => l.outcome === 'settled');
    assert(settledLog !== undefined, 'Phải có log outcome = settled');
  },
);

Deno.test(
  '12. [executeSettlement: Idempotent Retry] applied: false -> Không broadcast và log already_settled',
  async () => {
    const matchId = 'm2222222-0000-0000-0000-000000000002';
    let broadcastCalled = false;
    const logEntries: Record<string, unknown>[] = [];

    const mockAdminClient = {
      from: (table: string) => {
        if (table === 'matches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: matchId,
                    game_id: 'caro',
                    mode: 'online_1v1',
                    is_ranked: true,
                    season_id: 1,
                    end_reason: 'normal',
                    ended_at: new Date().toISOString(),
                    settled_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'match_participants') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
                  { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'system_config') {
          return {
            select: async () => ({ data: [], error: null }),
          };
        }
        if (table === 'player_ratings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
      rpc: async () => ({
        data: { applied: false, reason: 'already_settled_or_not_ended' },
        error: null,
      }),
    };

    await executeSettlement(
      matchId,
      mockAdminClient as never,
      () => {
        broadcastCalled = true;
        return Promise.resolve();
      },
      (entry) => {
        logEntries.push(entry);
      },
    );

    assertEquals(broadcastCalled, false, 'Không được broadcast khi applied: false');
    const alreadySettledLog = logEntries.find((l) => l.outcome === 'already_settled');
    assert(alreadySettledLog !== undefined, 'Phải có log outcome = already_settled');
  },
);

Deno.test(
  '13. [executeSettlement: STALE_RATING] Lần 1 ném STALE_RATING -> re-fetch và retry lần 2 thành công',
  async () => {
    const matchId = 'm3333333-0000-0000-0000-000000000003';
    let broadcastCalled = false;
    const logEntries: Record<string, unknown>[] = [];
    let rpcCallCount = 0;
    let fetchRatingCount = 0;

    const mockAdminClient = {
      from: (table: string) => {
        if (table === 'matches') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: matchId,
                    game_id: 'caro',
                    mode: 'online_1v1',
                    is_ranked: true,
                    season_id: 1,
                    end_reason: 'normal',
                    ended_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'match_participants') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
                  { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'system_config') {
          return {
            select: async () => ({ data: [], error: null }),
          };
        }
        if (table === 'player_ratings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: async () => {
                    fetchRatingCount++;
                    if (fetchRatingCount === 1) {
                      return {
                        data: [
                          { user_id: 'u1', rating: 1200, games_played: 20 },
                          { user_id: 'u2', rating: 1200, games_played: 20 },
                        ],
                        error: null,
                      };
                    }
                    // Lần 2 fetch ra rating tươi mới
                    return {
                      data: [
                        { user_id: 'u1', rating: 1216, games_played: 21 },
                        { user_id: 'u2', rating: 1184, games_played: 21 },
                      ],
                      error: null,
                    };
                  },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
      rpc: async () => {
        rpcCallCount++;
        if (rpcCallCount === 1) {
          return {
            data: null,
            error: { message: 'STALE_RATING cho user u1', code: 'P0407' },
          };
        }
        return {
          data: { applied: true, entries: 2 },
          error: null,
        };
      },
    };

    await executeSettlement(
      matchId,
      mockAdminClient as never,
      () => {
        broadcastCalled = true;
        return Promise.resolve();
      },
      (entry) => {
        logEntries.push(entry);
      },
    );

    assertEquals(rpcCallCount, 2, 'Phải gọi RPC đúng 2 lần (1 lần thử lại)');
    assertEquals(broadcastCalled, true, 'Lần 2 thành công phải broadcast');
    const retryLog = logEntries.find((l) => l.outcome === 'retry_stale_rating');
    assert(retryLog !== undefined, 'Phải có log outcome = retry_stale_rating');
  },
);

Deno.test(
  '14. [executeSettlement: Fail-safe] Lỗi DB bất kỳ -> log error và KHÔNG throw exception',
  async () => {
    const matchId = 'm4444444-0000-0000-0000-000000000004';
    const logEntries: Record<string, unknown>[] = [];

    const mockAdminClient = {
      from: () => {
        throw new Error('Database Connection Crashed');
      },
    };

    // Không được throw ra ngoài
    await executeSettlement(
      matchId,
      mockAdminClient as never,
      () => Promise.resolve(),
      (entry) => {
        logEntries.push(entry);
      },
    );

    const errorLog = logEntries.find((l) => l.outcome === 'error');
    assert(errorLog !== undefined, 'Phải có log outcome = error');
    assertEquals(errorLog?.error, 'Database Connection Crashed');
  },
);

// ==============================================================================
// 4. KIỂM THỬ LUẬT CHỐNG FARM XU & PENALTY (PHASE P4.5a)
// ==============================================================================
Deno.test(
  '15. [Anti-farm: Config & Timezone Helper] Parse các cấu hình chống farm và timezone VN',
  () => {
    const repeatCfg = parseRepeatOpponentConfig(DEFAULT_CONFIG_ROWS);
    assertEquals(repeatCfg.fullMatches, 2);
    assertEquals(repeatCfg.dampenFactor, 0.5);
    assertEquals(repeatCfg.zeroAfter, 5);

    const dailyCap = parseDailyCap(DEFAULT_CONFIG_ROWS);
    assertEquals(dailyCap, 500);

    const penalty = parseAbandonPenalty(DEFAULT_CONFIG_ROWS);
    assertEquals(penalty, -20);

    // Timezone VN ISO format check: YYYY-MM-DDT00:00:00+07:00
    const testDate = new Date('2026-08-26T13:30:00Z'); // 20:30 VN
    const startOfDay = getVietnamStartOfDayIso(testDate);
    assertEquals(startOfDay, '2026-08-26T00:00:00+07:00');
  },
);

Deno.test(
  '16. [Anti-farm: Dampen 3 nhánh] todayPairCount 0 -> x1 (50/5), 3 -> x0.5 (25/2), 6 -> x0 (0/0)',
  () => {
    const baseMatch: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'normal',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 20 },
        u2: { rating: 1200, gamesPlayed: 20 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
      todayPairCount: 0,
    };

    // Nhánh 1: 0 trận trước đó -> Thưởng 100% (50 xu / 5 xu)
    const d0 = buildSettlement(baseMatch);
    assertEquals(d0.is_noop, false);
    if (!d0.is_noop) {
      assertEquals(d0.payload.entries[0].coins, 50);
      assertEquals(d0.payload.entries[1].coins, 5);
    }

    // Nhánh 2: 3 trận trước đó -> Thưởng 50% (25 xu / 2 xu)
    const d3 = buildSettlement({ ...baseMatch, todayPairCount: 3 });
    assertEquals(d3.is_noop, false);
    if (!d3.is_noop) {
      assertEquals(d3.payload.entries[0].coins, 25);
      assertEquals(d3.payload.entries[1].coins, 2); // Math.floor(5 * 0.5) = 2
    }

    // Nhánh 3: 6 trận trước đó -> Thưởng 0% (0 xu / 0 xu)
    const d6 = buildSettlement({ ...baseMatch, todayPairCount: 6 });
    assertEquals(d6.is_noop, false);
    if (!d6.is_noop) {
      assertEquals(d6.payload.entries[0].coins, 0);
      assertEquals(d6.payload.entries[1].coins, 0);
    }
  },
);

Deno.test(
  '17. [Anti-farm: Timeout Penalty] end_reason = "timeout" -> Người thua bị phạt -20 xu, người thắng nhận đủ',
  () => {
    const input: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'timeout',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 20 },
        u2: { rating: 1200, gamesPlayed: 20 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
      todayPairCount: 0,
    };

    const decision = buildSettlement(input);
    assertEquals(decision.is_noop, false);
    if (!decision.is_noop) {
      assertEquals(decision.payload.entries[0].coins, 50, 'Người thắng nhận đủ 50 xu');
      assertEquals(decision.payload.entries[1].coins, -20, 'Người thua hết giờ bị phạt -20 xu');
    }
  },
);

Deno.test(
  '18. [Anti-farm: Resign Loss Reward] end_reason = "resign" -> Người đầu hàng nhận xu an ủi +5, không bị phạt',
  () => {
    const input: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'resign',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 20 },
        u2: { rating: 1200, gamesPlayed: 20 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
      todayPairCount: 0,
    };

    const decision = buildSettlement(input);
    assertEquals(decision.is_noop, false);
    if (!decision.is_noop) {
      assertEquals(decision.payload.entries[0].coins, 50);
      assertEquals(
        decision.payload.entries[1].coins,
        5,
        'Người đầu hàng nhận +5 xu an ủi bình thường',
      );
    }
  },
);

Deno.test(
  '19. [Anti-farm: Rating Invariance] Điểm Elo tính toán giữ nguyên 100% qua các nhánh giảm xu và phạt xu',
  () => {
    const baseInput: BuildSettlementInput = {
      match: {
        game_id: 'caro',
        mode: 'online_1v1',
        is_ranked: true,
        season_id: 1,
        end_reason: 'normal',
      },
      participants: [
        { user_id: 'u1', seat_index: 0, result: 'win', is_bot: false },
        { user_id: 'u2', seat_index: 1, result: 'loss', is_bot: false },
      ],
      currentRatings: {
        u1: { rating: 1200, gamesPlayed: 20 },
        u2: { rating: 1200, gamesPlayed: 20 },
      },
      configRows: DEFAULT_CONFIG_ROWS,
      todayPairCount: 0,
    };

    const dNormal = buildSettlement(baseInput);
    const dDampened = buildSettlement({ ...baseInput, todayPairCount: 6 });
    const dTimeout = buildSettlement({
      ...baseInput,
      match: { ...baseInput.match, end_reason: 'timeout' },
    });

    if (!dNormal.is_noop && !dDampened.is_noop && !dTimeout.is_noop) {
      // Assert rating deltas are identical across all 3 cases
      assertEquals(dNormal.payload.entries[0].rating_delta, 16);
      assertEquals(dDampened.payload.entries[0].rating_delta, 16);
      assertEquals(dTimeout.payload.entries[0].rating_delta, 16);

      assertEquals(dNormal.payload.entries[1].rating_delta, -16);
      assertEquals(dDampened.payload.entries[1].rating_delta, -16);
      assertEquals(dTimeout.payload.entries[1].rating_delta, -16);
    }
  },
);
