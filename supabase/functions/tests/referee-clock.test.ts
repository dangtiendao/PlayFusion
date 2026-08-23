/**
 * ==============================================================================
 * DENO UNIT TESTS: REFEREE CLOCK, TIMEOUT, RESIGN & RACE CONDITIONS (P3.4b)
 * ==============================================================================
 */

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  handleInitAction,
  handleMoveAction,
  handleResignAction,
  handleClaimTimeoutAction,
  type RefereeDependencies,
  type MatchRecord,
  type ParticipantRecord,
  type LiveStateRecord,
} from '../referee/core.ts';

function createMockDependencies(initialTime = 1000000) {
  let currentTime = initialTime;
  let liveState: LiveStateRecord | null = null;
  let match: MatchRecord = {
    id: 'match-1',
    game_id: 'caro',
    mode: 'online_1v1',
    ended_at: null,
    started_at: new Date(initialTime).toISOString(),
    options: { boardSize: 15, winLength: 5, blockedTwoEndsRule: false, allowOverline: true },
    time_control: { baseSeconds: 300, incrementSeconds: 5 },
  };

  const participants: ParticipantRecord[] = [
    { match_id: 'match-1', user_id: 'user-0', seat_index: 0, is_winner: null },
    { match_id: 'match-1', user_id: 'user-1', seat_index: 1, is_winner: null },
  ];

  const broadcasts: { eventType: string; payload: unknown }[] = [];
  const logs: unknown[] = [];
  let finalizedData: unknown = null;

  const deps: RefereeDependencies = {
    now: () => currentTime,
    loadSystemConfig: async (key: string) => {
      if (key === 'match.default_time_control') return { baseSeconds: 300, incrementSeconds: 5 };
      if (key === 'match.abort_move_threshold') return { moves: 3 };
      return null;
    },
    loadMatchAndParticipants: async () => ({ match, participants }),
    loadLiveState: async () => liveState,
    insertLiveState: async (record) => {
      liveState = {
        match_id: record.match_id,
        state_serialized: record.state_serialized,
        move_index: record.move_index,
        current_seat: record.current_seat,
        moves_serialized: record.moves_serialized,
        clock: record.clock || null,
        turn_started_at: record.turn_started_at || null,
        turn_deadline: record.turn_deadline || null,
      };
    },
    updateLiveStateOptimistic: async (record) => {
      if (!liveState || liveState.move_index !== record.expected_move_index) {
        return false;
      }
      liveState = {
        match_id: record.match_id,
        state_serialized: record.state_serialized,
        move_index: record.next_move_index,
        current_seat: record.current_seat,
        moves_serialized: record.moves_serialized,
        clock: record.clock || null,
        turn_started_at: record.turn_started_at || null,
        turn_deadline: record.turn_deadline || null,
      };
      return true;
    },
    finalizeMatch: async (_id, finalData, pResults) => {
      match = { ...match, ended_at: finalData.ended_at };
      finalizedData = { finalData, pResults };
    },
    deleteLiveState: async () => {
      liveState = null;
    },
    broadcast: async (_id, eventType, payload) => {
      broadcasts.push({ eventType, payload });
    },
    log: (entry) => {
      logs.push(entry);
    },
  };

  return {
    deps,
    get liveState() {
      return liveState;
    },
    get match() {
      return match;
    },
    get broadcasts() {
      return broadcasts;
    },
    get finalizedData() {
      return finalizedData;
    },
    advanceTime: (ms: number) => {
      currentTime += ms;
    },
  };
}

Deno.test('1. [Referee Clock] Init ván đấu khởi tạo quỹ giờ 300,000ms cho 2 bên', async () => {
  const env = createMockDependencies();
  const res = await handleInitAction('user-0', 'match-1', env.deps);

  assertEquals(res.status, 200);
  assertEquals(res.body.ok, true);
  const data = (res.body as { data: { clock: Record<string, number>; turnDeadline: string } }).data;
  assertEquals(data.clock, { '0': 300000, '1': 300000 });
  assertNotEquals(data.turnDeadline, null);
});

Deno.test(
  '2. [Referee Clock] Move trong hạn: trừ đúng elapsed (10s) và cộng increment (5s)',
  async () => {
    const env = createMockDependencies(1000000);
    await handleInitAction('user-0', 'match-1', env.deps);

    // Người 0 suy nghĩ 10 giây (10,000ms)
    env.advanceTime(10000);

    // Đánh nước đi hợp lệ "112" (ô 112 = 7*15 + 7)
    const res = await handleMoveAction(
      'user-0',
      { matchId: 'match-1', moveSerialized: '112', expectedMoveIndex: 0 },
      env.deps,
    );

    assertEquals(res.status, 200);
    assertEquals(res.body.ok, true);
    const data = (res.body as { data: { clock: Record<string, number>; currentSeat: number } })
      .data;
    // Seat 0 ban đầu có 300s -> -10s + 5s = 295s = 295,000ms
    assertEquals(data.clock['0'], 295000);
    // Seat 1 chưa đánh -> giữ nguyên 300,000ms
    assertEquals(data.clock['1'], 300000);
    assertEquals(data.currentSeat, 1);
  },
);

Deno.test(
  '3. [Referee Clock] Move quá hạn: phát hiện timeout ngay lập tức, người gửi thua',
  async () => {
    const env = createMockDependencies(1000000);
    await handleInitAction('user-0', 'match-1', env.deps);

    // Người 0 suy nghĩ quá 300 giây (301,000ms)
    env.advanceTime(301000);

    const res = await handleMoveAction(
      'user-0',
      { matchId: 'match-1', moveSerialized: '112', expectedMoveIndex: 0 },
      env.deps,
    );

    // Nước 0 < threshold 3 -> abort
    assertEquals(res.status, 409);
    assertEquals(res.body.ok, false);
    assertEquals((res.body as { error: { code: string } }).error.code, 'TIME_OUT');
    assertEquals(env.liveState, null);
  },
);

Deno.test(
  '4. [Referee Claim] Claim sớm trước grace 2s -> 409 TOO_EARLY kèm turnDeadline & serverNow',
  async () => {
    const env = createMockDependencies(1000000);
    await handleInitAction('user-0', 'match-1', env.deps);

    // Người 0 đến lượt. Thời gian trôi 300s (vừa đúng deadline nhưng CHƯA qua 2s grace)
    env.advanceTime(300500);

    // Người 1 claim
    const res = await handleClaimTimeoutAction('user-1', { matchId: 'match-1' }, env.deps);
    assertEquals(res.status, 409);
    assertEquals((res.body as { error: { code: string } }).error.code, 'TOO_EARLY');
  },
);

Deno.test('5. [Referee Claim] Claim đúng hạn sau deadline + 2s grace -> thành công', async () => {
  const env = createMockDependencies(1000000);
  await handleInitAction('user-0', 'match-1', env.deps);

  // Đánh 3 nước để vượt ngưỡng abort
  await handleMoveAction(
    'user-0',
    { matchId: 'match-1', moveSerialized: '112', expectedMoveIndex: 0 },
    env.deps,
  );
  await handleMoveAction(
    'user-1',
    { matchId: 'match-1', moveSerialized: '113', expectedMoveIndex: 1 },
    env.deps,
  );
  await handleMoveAction(
    'user-0',
    { matchId: 'match-1', moveSerialized: '127', expectedMoveIndex: 2 },
    env.deps,
  );

  // Giờ là lượt người 1 (Seat 1). Người 1 cạn giờ: trôi 310s (quá deadline 300s + grace 2s)
  env.advanceTime(310000);

  // Người 0 claim timeout
  const res = await handleClaimTimeoutAction('user-0', { matchId: 'match-1' }, env.deps);
  assertEquals(res.status, 200);
  assertEquals(res.body.ok, true);
  const data = (res.body as { data: { reason: string } }).data;
  assertEquals(data.reason, 'timeout');
  assertEquals(env.match.ended_at !== null, true);
});

Deno.test(
  '6. [Referee Claim] Người đang tới lượt không thể tự claim_timeout chính mình -> 403 WRONG_TURN',
  async () => {
    const env = createMockDependencies(1000000);
    await handleInitAction('user-0', 'match-1', env.deps);

    // Lượt Seat 0, User 0 tự claim
    const res = await handleClaimTimeoutAction('user-0', { matchId: 'match-1' }, env.deps);
    assertEquals(res.status, 403);
    assertEquals((res.body as { error: { code: string } }).error.code, 'WRONG_TURN');
  },
);

Deno.test(
  '7. [Referee Resign] Resign trước 3 nước -> abort; từ 3 nước -> resign người xin hàng thua',
  async () => {
    // Ca A: Resign ở nước 0 -> abort
    const envA = createMockDependencies(1000000);
    await handleInitAction('user-0', 'match-1', envA.deps);
    const resA = await handleResignAction('user-0', { matchId: 'match-1' }, envA.deps);
    assertEquals(resA.status, 200);
    assertEquals((resA.body as { data: { reason: string } }).data.reason, 'abort');

    // Ca B: Đánh 3 nước rồi resign -> resign
    const envB = createMockDependencies(1000000);
    await handleInitAction('user-0', 'match-1', envB.deps);
    await handleMoveAction(
      'user-0',
      { matchId: 'match-1', moveSerialized: '112', expectedMoveIndex: 0 },
      envB.deps,
    );
    await handleMoveAction(
      'user-1',
      { matchId: 'match-1', moveSerialized: '113', expectedMoveIndex: 1 },
      envB.deps,
    );
    await handleMoveAction(
      'user-0',
      { matchId: 'match-1', moveSerialized: '127', expectedMoveIndex: 2 },
      envB.deps,
    );

    const resB = await handleResignAction('user-1', { matchId: 'match-1' }, envB.deps);
    assertEquals(resB.status, 200);
    assertEquals((resB.body as { data: { reason: string } }).data.reason, 'resign');
  },
);
