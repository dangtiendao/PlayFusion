/**
 * ==============================================================================
 * UNIT TESTS CHO LOGIC TRỌNG TÀI CORE (SUPABASE/FUNCTIONS/TESTS/REFEREE-CORE.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM CHỨNG:
 * 1. Khởi tạo Action 'init' (ván mới & idempotent).
 * 2. Thẩm định Action 'move' hợp lệ và tăng move_index +1.
 * 3. Chuỗi từ chối nước đi: NOT_PARTICIPANT, MATCH_ENDED, Duplicate, STALE_CLIENT, WRONG_TURN, ILLEGAL_MOVE.
 * 4. Khóa lạc quan chống xung đột (Optimistic Lock Lost Race).
 * 5. Kết thúc ván cờ (Terminal Win State -> finalizeMatch + deleteLiveState).
 * 6. Structured Logging được kích hoạt chính xác cho mọi request.
 * ==============================================================================
 */

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      msg || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`,
    );
  }
}

function assertNotEquals<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new Error(msg || `Expected values to differ, but both were ${JSON.stringify(actual)}`);
  }
}

import {
  handleInitAction,
  handleMoveAction,
  type RefereeDependencies,
  type MatchRecord,
  type ParticipantRecord,
  type LiveStateRecord,
} from '../referee/core.ts';

function createMockEnvironment(overrides?: Partial<RefereeDependencies>) {
  let matchStore: MatchRecord | null = {
    id: 'm1',
    game_id: 'caro',
    mode: 'online_1v1',
    ended_at: null,
    started_at: new Date(Date.now() - 10000).toISOString(),
    options: { boardSize: 15, winLength: 5, blockedTwoEndsRule: false, allowOverline: true },
  };

  const participantsStore: ParticipantRecord[] = [
    { match_id: 'm1', user_id: 'user_a', seat_index: 0, is_winner: null },
    { match_id: 'm1', user_id: 'user_b', seat_index: 1, is_winner: null },
  ];

  let liveStateStore: LiveStateRecord | null = null;
  const broadcasts: { matchId: string; eventType: string; payload: unknown }[] = [];
  const logs: {
    fn: string;
    action: string;
    matchId: string;
    userId: string;
    moveIndex?: number;
    outcome: string;
    ms: number;
  }[] = [];
  let isFinalized = false;
  let isLiveStateDeleted = false;

  const defaultDeps: RefereeDependencies = {
    loadMatchAndParticipants: async (id: string) => {
      if (matchStore && matchStore.id === id) {
        return { match: matchStore, participants: participantsStore };
      }
      return { match: null, participants: [] };
    },

    loadLiveState: async (id: string) => {
      if (liveStateStore && liveStateStore.match_id === id) {
        return liveStateStore;
      }
      return null;
    },

    insertLiveState: async (record) => {
      liveStateStore = {
        match_id: record.match_id,
        state_serialized: record.state_serialized,
        move_index: record.move_index,
        current_seat: record.current_seat,
        moves_serialized: record.moves_serialized,
        turn_deadline: null,
        updated_at: new Date().toISOString(),
      };
    },

    updateLiveStateOptimistic: async (record) => {
      if (!liveStateStore || liveStateStore.match_id !== record.match_id) return false;
      if (liveStateStore.move_index !== record.expected_move_index) return false;

      liveStateStore = {
        match_id: record.match_id,
        state_serialized: record.state_serialized,
        move_index: record.next_move_index,
        current_seat: record.current_seat,
        moves_serialized: record.moves_serialized,
        turn_deadline: null,
        updated_at: new Date().toISOString(),
      };
      return true;
    },

    finalizeMatch: async (_id, finalData, participantsResult) => {
      isFinalized = true;
      if (matchStore) {
        matchStore = {
          ...matchStore,
          ended_at: finalData.ended_at,
        };
      }
      for (const p of participantsResult) {
        const found = participantsStore.find((x) => x.user_id === p.user_id);
        if (found) {
          (found as { is_winner: boolean | null }).is_winner = p.is_winner;
        }
      }
    },

    deleteLiveState: async (id: string) => {
      if (liveStateStore && liveStateStore.match_id === id) {
        liveStateStore = null;
        isLiveStateDeleted = true;
      }
    },

    broadcast: async (matchId, eventType, payload) => {
      broadcasts.push({ matchId, eventType, payload });
    },

    log: (entry) => {
      logs.push(entry);
    },
  };

  return {
    deps: { ...defaultDeps, ...overrides },
    getLiveState: () => liveStateStore,
    getBroadcasts: () => broadcasts,
    getLogs: () => logs,
    getMatch: () => matchStore,
    getParticipants: () => participantsStore,
    isFinalized: () => isFinalized,
    isLiveStateDeleted: () => isLiveStateDeleted,
  };
}

Deno.test('1. [Referee Core: init] Khởi tạo ván mới thành công', async () => {
  const env = createMockEnvironment();

  const res = await handleInitAction('user_a', 'm1', env.deps);
  assertEquals(res.status, 200);
  assertEquals(res.body.ok, true);

  const data = (
    res.body as {
      ok: true;
      data: { moveIndex: number; currentSeat: number; stateSerialized: string };
    }
  ).data;
  assertEquals(data.moveIndex, 0);
  assertEquals(data.currentSeat, 0);
  assertNotEquals(data.stateSerialized, '');

  const liveState = env.getLiveState();
  assertEquals(liveState?.move_index, 0);
  assertEquals(liveState?.current_seat, 0);

  // Broadcast match_ready
  const broadcasts = env.getBroadcasts();
  assertEquals(broadcasts.length, 1);
  assertEquals(broadcasts[0].eventType, 'match_ready');

  // Log
  const logs = env.getLogs();
  assertEquals(logs.length, 1);
  assertEquals(logs[0].outcome, 'created');
});

Deno.test(
  '2. [Referee Core: init] Idempotent: Người thứ 2 gọi lại init -> trả state hiện tại',
  async () => {
    const env = createMockEnvironment();
    await handleInitAction('user_a', 'm1', env.deps);

    const res2 = await handleInitAction('user_b', 'm1', env.deps);
    assertEquals(res2.status, 200);
    assertEquals(res2.body.ok, true);

    const logs = env.getLogs();
    assertEquals(logs[1].outcome, 'already_initialized');
  },
);

Deno.test('3. [Referee Core: init] Người ngoài phòng gọi init -> 403 NOT_PARTICIPANT', async () => {
  const env = createMockEnvironment();
  const res = await handleInitAction('user_intruder', 'm1', env.deps);

  assertEquals(res.status, 403);
  assertEquals(res.body.ok, false);
  assertEquals((res.body as { ok: false; error: { code: string } }).error.code, 'NOT_PARTICIPANT');
});

Deno.test(
  '4. [Referee Core: move] Đánh nước đi hợp lệ -> move_index +1, chuyển lượt và broadcast',
  async () => {
    const env = createMockEnvironment();
    await handleInitAction('user_a', 'm1', env.deps);

    const res = await handleMoveAction(
      'user_a',
      { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 0 },
      env.deps,
    );

    assertEquals(res.status, 200);
    assertEquals(res.body.ok, true);

    const data = (res.body as { ok: true; data: { moveIndex: number; currentSeat: number } }).data;
    assertEquals(data.moveIndex, 1);
    assertEquals(data.currentSeat, 1); // Chuyển sang seat 1

    const liveState = env.getLiveState();
    assertEquals(liveState?.move_index, 1);
    assertEquals(liveState?.current_seat, 1);
    assertEquals(liveState?.moves_serialized, '112');

    const broadcasts = env.getBroadcasts();
    const moveBroadcast = broadcasts.find((b) => b.eventType === 'move_accepted');
    assertNotEquals(moveBroadcast, undefined);

    const logs = env.getLogs();
    const moveLog = logs.find((l) => l.action === 'move');
    assertEquals(moveLog?.outcome, 'accepted');
    assertEquals(moveLog?.moveIndex, 1);
  },
);

Deno.test(
  '5. [Referee Core: move] Nước đi lặp (expectedMoveIndex < current) -> 200 duplicate: true (Không áp dụng lại)',
  async () => {
    const env = createMockEnvironment();
    await handleInitAction('user_a', 'm1', env.deps);
    await handleMoveAction(
      'user_a',
      { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 0 },
      env.deps,
    );

    // user_a gửi lại expectedMoveIndex = 0 do mạng retry
    const resDup = await handleMoveAction(
      'user_a',
      { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 0 },
      env.deps,
    );

    assertEquals(resDup.status, 200);
    assertEquals(resDup.body.ok, true);
    assertEquals(
      (resDup.body as { ok: true; data: { duplicate: boolean; moveIndex: number } }).data.duplicate,
      true,
    );
    assertEquals(
      (resDup.body as { ok: true; data: { duplicate: boolean; moveIndex: number } }).data.moveIndex,
      1,
    );

    // Không phát thêm broadcast
    const moveBroadcasts = env.getBroadcasts().filter((b) => b.eventType === 'move_accepted');
    assertEquals(moveBroadcasts.length, 1);
  },
);

Deno.test(
  '6. [Referee Core: move] Client lệch nhịp (expectedMoveIndex > current) -> 409 STALE_CLIENT',
  async () => {
    const env = createMockEnvironment();
    await handleInitAction('user_a', 'm1', env.deps);

    // Nhảy cóc lên expectedMoveIndex = 5 khi server đang ở 0
    const resStale = await handleMoveAction(
      'user_a',
      { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 5 },
      env.deps,
    );

    assertEquals(resStale.status, 409);
    assertEquals(resStale.body.ok, false);
    assertEquals(
      (resStale.body as { ok: false; error: { code: string } }).error.code,
      'STALE_CLIENT',
    );
  },
);

Deno.test('7. [Referee Core: move] Sai lượt đi (Cheap Turn Check) -> 403 WRONG_TURN', async () => {
  const env = createMockEnvironment();
  await handleInitAction('user_a', 'm1', env.deps);

  // user_b (seat 1) cố tình đánh khi đang là lượt của seat 0
  const resWrongTurn = await handleMoveAction(
    'user_b',
    { matchId: 'm1', moveSerialized: '113', expectedMoveIndex: 0 },
    env.deps,
  );

  assertEquals(resWrongTurn.status, 403);
  assertEquals(resWrongTurn.body.ok, false);
  assertEquals(
    (resWrongTurn.body as { ok: false; error: { code: string } }).error.code,
    'WRONG_TURN',
  );
});

Deno.test('8. [Referee Core: move] Đánh vào ô đã có quân -> 422 ILLEGAL_MOVE', async () => {
  const env = createMockEnvironment();
  await handleInitAction('user_a', 'm1', env.deps);

  // Nước 0: user_a đánh ô 112
  await handleMoveAction(
    'user_a',
    { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 0 },
    env.deps,
  );

  // Nước 1: user_b đánh đè vào ô 112
  const resIllegal = await handleMoveAction(
    'user_b',
    { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 1 },
    env.deps,
  );

  assertEquals(resIllegal.status, 422);
  assertEquals(resIllegal.body.ok, false);
  assertEquals(
    (resIllegal.body as { ok: false; error: { code: string } }).error.code,
    'ILLEGAL_MOVE',
  );
});

Deno.test(
  '9. [Referee Core: move] Thua đua Optimistic Lock (affectedRows = 0) -> 409 STALE_CLIENT & Không broadcast',
  async () => {
    // Giả lập updateLiveStateOptimistic trả về false (có request khác vừa update)
    const env = createMockEnvironment({
      updateLiveStateOptimistic: async () => false,
    });

    await handleInitAction('user_a', 'm1', env.deps);

    const resLockLost = await handleMoveAction(
      'user_a',
      { matchId: 'm1', moveSerialized: '112', expectedMoveIndex: 0 },
      env.deps,
    );

    assertEquals(resLockLost.status, 409);
    assertEquals(resLockLost.body.ok, false);
    assertEquals(
      (resLockLost.body as { ok: false; error: { code: string } }).error.code,
      'STALE_CLIENT',
    );

    // Không có broadcast move_accepted
    const moveBroadcasts = env.getBroadcasts().filter((b) => b.eventType === 'move_accepted');
    assertEquals(moveBroadcasts.length, 0);
  },
);

Deno.test(
  '10. [Referee Core: move] Nước đi chiến thắng (5 quân thẳng hàng) -> Finalize ván & Xóa live_state',
  async () => {
    const env = createMockEnvironment();
    await handleInitAction('user_a', 'm1', env.deps);

    // Đánh chuỗi 9 nước dẫn đến thắng của user_a (Seat 0)
    // X: 105, 106, 107, 108, 109
    // O: 120, 121, 122, 123
    const moves = [
      { user: 'user_a', cell: '105', idx: 0 },
      { user: 'user_b', cell: '120', idx: 1 },
      { user: 'user_a', cell: '106', idx: 2 },
      { user: 'user_b', cell: '121', idx: 3 },
      { user: 'user_a', cell: '107', idx: 4 },
      { user: 'user_b', cell: '122', idx: 5 },
      { user: 'user_a', cell: '108', idx: 6 },
      { user: 'user_b', cell: '123', idx: 7 },
    ];

    for (const m of moves) {
      const res = await handleMoveAction(
        m.user,
        { matchId: 'm1', moveSerialized: m.cell, expectedMoveIndex: m.idx },
        env.deps,
      );
      assertEquals(res.status, 200);
    }

    // Nước thứ 9: user_a đánh ô 109 -> Đạt 5 quân liên tiếp -> Thắng!
    const winRes = await handleMoveAction(
      'user_a',
      { matchId: 'm1', moveSerialized: '109', expectedMoveIndex: 8 },
      env.deps,
    );

    assertEquals(winRes.status, 200);
    const data = (
      winRes.body as {
        ok: true;
        data: { terminal: { over: boolean; outcomes: { playerIndex: number; outcome: string }[] } };
      }
    ).data;
    assertEquals(data.terminal.over, true);
    assertEquals(data.terminal.outcomes[0].outcome, 'win');
    assertEquals(data.terminal.outcomes[1].outcome, 'loss');

    // Xác nhận matches đã được finalize và live_state đã được xóa sạch
    assertEquals(env.isFinalized(), true);
    assertEquals(env.isLiveStateDeleted(), true);

    const participants = env.getParticipants();
    assertEquals(participants[0].is_winner, true);
    assertEquals(participants[1].is_winner, false);
  },
);
