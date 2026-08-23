/**
 * ==============================================================================
 * DENO UNIT TESTS: REFEREE CORRESPONDENCE MODE & TIME CONTROL (P3.6b)
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

function createMockCorrespondenceDeps(initialTime = 1000000) {
  let currentTime = initialTime;
  let liveState: LiveStateRecord | null = null;
  let match: MatchRecord = {
    id: 'match-corr-1',
    game_id: 'caro',
    mode: 'online_correspondence',
    ended_at: null,
    started_at: new Date(initialTime).toISOString(),
    options: { boardSize: 15, winLength: 5, blockedTwoEndsRule: false, allowOverline: true },
    time_control: { kind: 'correspondence', perMoveSeconds: 86400 },
  };

  const participants: ParticipantRecord[] = [
    { match_id: 'match-corr-1', user_id: 'user-0', seat_index: 0, is_winner: null },
    { match_id: 'match-corr-1', user_id: 'user-1', seat_index: 1, is_winner: null },
  ];

  const broadcasts: { eventType: string; payload: unknown }[] = [];
  const logs: unknown[] = [];
  let finalizedData: unknown = null;

  const deps: RefereeDependencies = {
    now: () => currentTime,
    loadSystemConfig: async (key: string) => {
      if (key === 'match.correspondence_per_move_hours') return { hours: 24 };
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
    setTime: (ms: number) => {
      currentTime = ms;
    },
  };
}

Deno.test(
  '1. [Referee Correspondence] Init: clock là NULL, deadline = now + 24h, timeControl có kind correspondence',
  async () => {
    const mock = createMockCorrespondenceDeps(1000000);
    const result = await handleInitAction('user-0', 'match-corr-1', mock.deps);

    assertEquals(result.status, 200);
    assertEquals(result.body.ok, true);

    const data = (
      result.body as {
        data: {
          clock: unknown;
          turnDeadline: string;
          timeControl: { kind: string; perMoveSeconds: number };
        };
      }
    ).data;
    assertEquals(data.clock, null); // KHÔNG CÓ QUỸ GIỜ DỒN
    assertEquals(data.timeControl.kind, 'correspondence');
    assertEquals(data.timeControl.perMoveSeconds, 86400);

    const expectedDeadline = new Date(1000000 + 86400 * 1000).toISOString();
    assertEquals(data.turnDeadline, expectedDeadline);
    assertEquals(mock.liveState?.clock, null);
    assertEquals(mock.liveState?.turn_deadline, expectedDeadline);
  },
);

Deno.test(
  '2. [Referee Correspondence] Move hợp lệ: clock giữ NULL, deadline được RESET tươi 24h cho người kế',
  async () => {
    const mock = createMockCorrespondenceDeps(1000000);
    await handleInitAction('user-0', 'match-corr-1', mock.deps);

    // Người 0 suy nghĩ trong 5 giờ (18,000,000 ms) rồi mới đánh nước (7, 7) = 112
    mock.advanceTime(5 * 3600 * 1000); // +5 giờ

    const moveRes = await handleMoveAction(
      'user-0',
      { matchId: 'match-corr-1', moveSerialized: '112', expectedMoveIndex: 0 },
      mock.deps,
    );

    assertEquals(moveRes.status, 200);
    assertEquals(moveRes.body.ok, true);

    const moveData = (
      moveRes.body as {
        data: { clock: unknown; currentSeat: number; turnDeadline: string };
      }
    ).data;
    assertEquals(moveData.clock, null); // Vẫn giữ null
    assertEquals(moveData.currentSeat, 1); // Chuyển lượt sang Seat 1

    // Deadline của Seat 1 là THỜI HẠN TƯƠI: now hiện tại + 24h (không bị trừ 5h của Seat 0)
    const currentNowMs = 1000000 + 5 * 3600 * 1000;
    const expectedSeat1Deadline = new Date(currentNowMs + 86400 * 1000).toISOString();
    assertEquals(moveData.turnDeadline, expectedSeat1Deadline);
    assertEquals(mock.liveState?.turn_deadline, expectedSeat1Deadline);
  },
);

Deno.test(
  '3. [Referee Correspondence] Move quá hạn (> 24h): Báo 409 TIME_OUT và xử thua / abort',
  async () => {
    const mock = createMockCorrespondenceDeps(1000000);
    await handleInitAction('user-0', 'match-corr-1', mock.deps);

    // Người 0 để trôi qua 25 giờ (90,000,000 ms > 86,400,000 ms) rồi mới gửi nước đi
    mock.advanceTime(25 * 3600 * 1000);

    const moveRes = await handleMoveAction(
      'user-0',
      { matchId: 'match-corr-1', moveSerialized: '112', expectedMoveIndex: 0 },
      mock.deps,
    );

    assertEquals(moveRes.status, 409);
    assertEquals(moveRes.body.ok, false);
    assertEquals((moveRes.body as { error: { code: string } }).error.code, 'TIME_OUT');

    // Vì move_index = 0 (< threshold 3) -> end_reason là 'abort'
    assertEquals(mock.liveState, null); // Live state bị xóa
    assertNotEquals(mock.finalizedData, null);
    const finalized = mock.finalizedData as {
      finalData: { end_reason: string };
    };
    assertEquals(finalized.finalData.end_reason, 'abort');
  },
);

Deno.test(
  '4. [Referee Correspondence] Claim timeout: Claim sớm trước 24h + 2s grace -> 409 TOO_EARLY',
  async () => {
    const mock = createMockCorrespondenceDeps(1000000);
    await handleInitAction('user-0', 'match-corr-1', mock.deps);

    // Đang là lượt của Seat 0. Seat 1 claim lúc 23 giờ (chưa hết 24h)
    mock.advanceTime(23 * 3600 * 1000);

    const claimRes = await handleClaimTimeoutAction(
      'user-1',
      { matchId: 'match-corr-1' },
      mock.deps,
    );
    assertEquals(claimRes.status, 409);
    assertEquals((claimRes.body as { error: { code: string } }).error.code, 'TOO_EARLY');

    // Ngay tại mốc 24h + 1s (chưa đủ 2s grace) -> vẫn TOO_EARLY
    mock.setTime(1000000 + 86400 * 1000 + 1000);
    const claimResGrace = await handleClaimTimeoutAction(
      'user-1',
      { matchId: 'match-corr-1' },
      mock.deps,
    );
    assertEquals(claimResGrace.status, 409);
    assertEquals((claimResGrace.body as { error: { code: string } }).error.code, 'TOO_EARLY');
  },
);

Deno.test(
  '5. [Referee Correspondence] Claim timeout: Claim đúng hạn sau 24h + 2s grace -> 200 Thành công, đối thủ thắng',
  async () => {
    const mock = createMockCorrespondenceDeps(1000000);
    await handleInitAction('user-0', 'match-corr-1', mock.deps);

    // Đánh 3 nước hợp lệ để vượt ngưỡng abort (move_index = 3)
    // Nước 0 (Seat 0): (7,7) = 112
    await handleMoveAction(
      'user-0',
      { matchId: 'match-corr-1', moveSerialized: '112', expectedMoveIndex: 0 },
      mock.deps,
    );
    // Nước 1 (Seat 1): (7,8) = 113
    await handleMoveAction(
      'user-1',
      { matchId: 'match-corr-1', moveSerialized: '113', expectedMoveIndex: 1 },
      mock.deps,
    );
    // Nước 2 (Seat 0): (6,7) = 97
    await handleMoveAction(
      'user-0',
      { matchId: 'match-corr-1', moveSerialized: '97', expectedMoveIndex: 2 },
      mock.deps,
    );

    assertEquals(mock.liveState?.move_index, 3);
    assertEquals(mock.liveState?.current_seat, 1);

    // Đến lượt Seat 1. Seat 1 không đi trong 24h + 3s grace
    const turn3StartedMs = new Date(mock.liveState?.turn_started_at || '').getTime();
    mock.setTime(turn3StartedMs + 86400 * 1000 + 3000); // Quá hạn 24h + 3s

    // Seat 0 claim timeout Seat 1
    const claimRes = await handleClaimTimeoutAction(
      'user-0',
      { matchId: 'match-corr-1' },
      mock.deps,
    );
    assertEquals(claimRes.status, 200);
    assertEquals(claimRes.body.ok, true);

    const claimData = (
      claimRes.body as {
        data: { reason: string; outcomes: { playerIndex: number; outcome: string }[] };
      }
    ).data;
    assertEquals(claimData.reason, 'timeout');
    assertEquals(claimData.outcomes[0].outcome, 'win'); // Seat 0 thắng
    assertEquals(claimData.outcomes[1].outcome, 'loss'); // Seat 1 thua vì hết giờ
  },
);

Deno.test(
  '6. [Referee Correspondence] Resign: Đúng luật ngưỡng abort (<3 nước) và resign (>=3 nước)',
  async () => {
    // Trường hợp 1: Resign ở nước 0 -> abort
    const mock1 = createMockCorrespondenceDeps(1000000);
    await handleInitAction('user-0', 'match-corr-1', mock1.deps);

    const resignRes1 = await handleResignAction('user-0', { matchId: 'match-corr-1' }, mock1.deps);
    assertEquals(resignRes1.status, 200);
    assertEquals((resignRes1.body as { data: { reason: string } }).data.reason, 'abort');

    // Trường hợp 2: Resign ở nước 3 -> resign (xử thua)
    const mock2 = createMockCorrespondenceDeps(1000000);
    await handleInitAction('user-0', 'match-corr-1', mock2.deps);
    await handleMoveAction(
      'user-0',
      { matchId: 'match-corr-1', moveSerialized: '112', expectedMoveIndex: 0 },
      mock2.deps,
    );
    await handleMoveAction(
      'user-1',
      { matchId: 'match-corr-1', moveSerialized: '113', expectedMoveIndex: 1 },
      mock2.deps,
    );
    await handleMoveAction(
      'user-0',
      { matchId: 'match-corr-1', moveSerialized: '97', expectedMoveIndex: 2 },
      mock2.deps,
    );

    const resignRes2 = await handleResignAction('user-1', { matchId: 'match-corr-1' }, mock2.deps);
    assertEquals(resignRes2.status, 200);
    assertEquals((resignRes2.body as { data: { reason: string } }).data.reason, 'resign');
  },
);
