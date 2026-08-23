/**
 * ==============================================================================
 * LOGIC TRỌNG TÀI THUẦN TÚY (SUPABASE/FUNCTIONS/REFEREE/CORE.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & SECURITY:
 * 1. TÁCH BIỆT LOGIC (CORE PATTERN):
 *    - Toàn bộ logic thẩm định nước đi, kiểm tra quyền, tính giờ server-side,
 *      khóa lạc quan và xử lý đầu hàng/quá giờ được viết thuần túy (Pure Logic).
 *    - Nhận Dependencies Inject (kể cả hàm `now()`), kiểm thử 100% không cần DB thật.
 * 2. CHUỖI VALIDATE CHUẨN HÓA CỦA ACTION 'move':
 *    - a. Tồn tại trận đấu & Người gọi là đấu thủ hợp lệ (404 / 403).
 *    - b. Trận đấu chưa kết thúc (409).
 *    - c. Khóa lũy công / Idempotency & Phát hiện lệch nhịp (200 duplicate / 409 stale).
 *    - d. Kiểm tra đúng lượt rẻ tiền từ DB trước khi gọi Engine (403).
 *    - [MỚI - P3.4b] TÍNH GIỜ SERVER-SIDE:
 *      + Phép tính rẻ tiền (now - turn_started_at) thực hiện ngay sau [d] và trước [e].
 *      + Nếu hết giờ (remaining <= 0): Phát phán quyết TIMEOUT/ABORT, không tốn CPU chạy Engine.
 *    - e. Giải mã cú pháp nước đi và bàn cờ (400).
 *    - f. Thẩm định nước đi bằng Game Engine TS thuần túy (422 / 403 / 409 / 500).
 * 3. QUY TẮC BẤT BIẾN ĐỒNG HỒ & BỎ TRẬN:
 *    - GRACE PERIOD (2 Giây): Khi `claim_timeout`, server chỉ chấp nhận khi now > deadline + 2000ms.
 *    - INCREMENT: `incrementSeconds` CHỈ được cộng vào quỹ giờ khi nước đi hợp lệ.
 *    - LUẬT NGƯỠNG ABORT (Mặc định 3 nước):
 *      + `move_index < threshold`: Kết thúc với `end_reason = 'abort'` (kết quả hủy/hòa).
 *      + `move_index >= threshold`: Kết thúc với `end_reason = 'resign'` hoặc `'timeout'`.
 * ==============================================================================
 */

import { EngineError, type TerminalResult } from '../../../packages/engines/types/index.ts';
import type { ApiResponseError, ApiResponseSuccess } from '../_shared/response.ts';
import { getGameEngineModule } from './engines.ts';

/**
 * Cấu hình kiểm soát thời gian thi đấu:
 * - 'realtime': Quỹ giờ dồn ban đầu + increment sau mỗi nước hợp lệ (P3.4).
 *   (Bản ghi cũ thiếu kind -> mặc định hiểu là 'realtime').
 * - 'correspondence': Đấu theo lượt kiểu thư tín, mỗi nước có thời hạn tươi riêng tính bằng giây (P3.6b).
 */
export type MatchTimeControl =
  | {
      readonly kind?: 'realtime';
      readonly baseSeconds: number;
      readonly incrementSeconds?: number;
    }
  | {
      readonly kind: 'correspondence';
      readonly perMoveSeconds: number;
    };

export interface MatchRecord {
  readonly id: string;
  readonly game_id: string;
  readonly mode: string;
  readonly ended_at: string | null;
  readonly started_at: string;
  readonly options?: Record<string, unknown> | null;
  readonly time_control?: MatchTimeControl | null;
}

/**
 * Hàm thuần tính toán đồng hồ và thời hạn nước đi kế tiếp sau khi áp dụng nước đi thành công.
 * - Realtime: Trừ thời gian đã trôi qua, cộng increment cho người vừa đi, tính deadline người kế theo clock của họ.
 * - Correspondence: Mỗi lượt cấp thời hạn tươi mới (perMoveSeconds), KHÔNG cộng dồn phần dư, clock giữ null.
 */
export function computeDeadlineAfterMove(
  timeControl: MatchTimeControl | null | undefined,
  currentClock: Record<string, number> | null | undefined,
  currentSeat: number,
  nextSeat: number,
  remainingSeatClockMs: number,
  nowMs: number,
): { nextClock: Record<string, number> | null; nextTurnDeadline: string } {
  const isCorrespondence = timeControl?.kind === 'correspondence';

  if (isCorrespondence) {
    const perMoveSeconds = timeControl.perMoveSeconds ?? 86400;
    const nextTurnDeadline = new Date(nowMs + perMoveSeconds * 1000).toISOString();
    return {
      nextClock: null,
      nextTurnDeadline,
    };
  }

  // Realtime
  const incrementSeconds =
    (timeControl && 'incrementSeconds' in timeControl ? timeControl.incrementSeconds : 5) ?? 5;
  const newSeatClockMs = remainingSeatClockMs + incrementSeconds * 1000;
  const nextClock: Record<string, number> = {
    ...(currentClock || {}),
    [String(currentSeat)]: newSeatClockMs,
  };
  const nextSeatRemainingMs = nextClock[String(nextSeat)] ?? 300000;
  const nextTurnDeadline = new Date(nowMs + nextSeatRemainingMs).toISOString();

  return {
    nextClock,
    nextTurnDeadline,
  };
}

export interface ParticipantRecord {
  readonly match_id: string;
  readonly user_id: string;
  readonly seat_index: number;
  readonly is_winner: boolean | null;
}

export interface LiveStateRecord {
  readonly match_id: string;
  readonly state_serialized: string;
  readonly move_index: number;
  readonly current_seat: number;
  readonly moves_serialized: string;
  readonly clock?: Record<string, number> | null;
  readonly turn_started_at?: string | null;
  readonly turn_deadline: string | null;
  readonly updated_at?: string;
}

export interface RefereeDependencies {
  readonly now?: () => number;
  readonly loadSystemConfig?: (key: string) => Promise<Record<string, unknown> | null>;
  readonly loadMatchAndParticipants: (
    matchId: string,
  ) => Promise<{ match: MatchRecord | null; participants: ParticipantRecord[] }>;
  readonly loadLiveState: (matchId: string) => Promise<LiveStateRecord | null>;
  readonly insertLiveState: (record: {
    match_id: string;
    state_serialized: string;
    move_index: number;
    current_seat: number;
    moves_serialized: string;
    clock?: Record<string, number> | null;
    turn_started_at?: string | null;
    turn_deadline?: string | null;
  }) => Promise<void>;
  readonly updateLiveStateOptimistic: (record: {
    match_id: string;
    state_serialized: string;
    next_move_index: number;
    current_seat: number;
    moves_serialized: string;
    expected_move_index: number;
    clock?: Record<string, number> | null;
    turn_started_at?: string | null;
    turn_deadline?: string | null;
  }) => Promise<boolean>;
  readonly finalizeMatch: (
    matchId: string,
    finalData: {
      ended_at: string;
      duration_ms: number;
      final_state: string;
      moves: string;
      end_reason: string;
    },
    participantsResult: { user_id: string; is_winner: boolean | null }[],
  ) => Promise<void>;
  readonly deleteLiveState: (matchId: string) => Promise<void>;
  readonly broadcast: (matchId: string, eventType: string, payload: unknown) => Promise<void>;
  readonly log: (entry: {
    fn: string;
    action: string;
    matchId: string;
    userId: string;
    moveIndex?: number;
    outcome: string;
    ms: number;
  }) => void;
}

export interface CoreResult<T> {
  readonly status: number;
  readonly body: ApiResponseSuccess<T> | ApiResponseError;
}

/** Hằng số Grace Period (ms) cho claim_timeout để bù trừ độ trễ mạng */
export const CLAIM_TIMEOUT_GRACE_MS = 2000;

/**
 * Xử lý Action 'init': Khởi tạo thế cờ ban đầu và quỹ giờ cho ván đấu online.
 */
export async function handleInitAction(
  userId: string,
  matchId: string,
  deps: RefereeDependencies,
): Promise<CoreResult<unknown>> {
  const getNow = deps.now || Date.now;
  const startTime = getNow();

  try {
    if (!matchId) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId: '',
        userId,
        outcome: 'MISSING_MATCH_ID',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: { ok: false, error: { code: 'BAD_REQUEST', message: 'Thiếu matchId.' } },
      };
    }

    // 1. Tải thông tin trận đấu và danh sách đấu thủ
    const { match, participants } = await deps.loadMatchAndParticipants(matchId);
    if (!match) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId,
        userId,
        outcome: 'MATCH_NOT_FOUND',
        ms: getNow() - startTime,
      });
      return {
        status: 404,
        body: { ok: false, error: { code: 'MATCH_NOT_FOUND', message: 'Không tìm thấy ván đấu.' } },
      };
    }

    // 2. Kiểm tra caller có phải là đấu thủ trong trận
    const isParticipant = participants.some((p) => p.user_id === userId);
    if (!isParticipant) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId,
        userId,
        outcome: 'NOT_PARTICIPANT',
        ms: getNow() - startTime,
      });
      return {
        status: 403,
        body: {
          ok: false,
          error: { code: 'NOT_PARTICIPANT', message: 'Bạn không phải đấu thủ của ván đấu này.' },
        },
      };
    }

    if (match.ended_at !== null) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId,
        userId,
        outcome: 'MATCH_ENDED',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: { ok: false, error: { code: 'MATCH_ENDED', message: 'Ván đấu đã kết thúc.' } },
      };
    }

    const nowIso = new Date(getNow()).toISOString();

    // 3. Kiểm tra live_state đã tồn tại chưa (Idempotent: người thứ 2 vào phòng gọi init trùng -> trả state cũ)
    const existingLiveState = await deps.loadLiveState(matchId);
    if (existingLiveState) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId,
        userId,
        outcome: 'already_initialized',
        ms: getNow() - startTime,
      });
      return {
        status: 200,
        body: {
          ok: true,
          data: {
            stateSerialized: existingLiveState.state_serialized,
            moveIndex: existingLiveState.move_index,
            currentSeat: existingLiveState.current_seat,
            movesSerialized: existingLiveState.moves_serialized,
            clock: existingLiveState.clock || null,
            turnDeadline: existingLiveState.turn_deadline || null,
            serverNow: nowIso,
            timeControl: match.time_control || null,
          },
        },
      };
    }

    // 4. Nạp Game Engine tương ứng từ Registry
    const engineModule = getGameEngineModule(match.game_id);
    if (!engineModule) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId,
        userId,
        outcome: 'UNSUPPORTED_GAME',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: 'UNSUPPORTED_GAME',
            message: `Trò chơi "${match.game_id}" chưa được hỗ trợ.`,
          },
        },
      };
    }

    // 5. Khởi tạo trạng thái bàn cờ ban đầu qua TS Game Engine thuần
    const options = match.options || engineModule.defaultOptions || {};
    const initialState = engineModule.engine.init({
      playerCount: participants.length || 2,
      options,
    });

    const stateSerialized = engineModule.engine.serialize(initialState);
    const currentSeat = engineModule.engine.currentPlayer(initialState);

    // 6. Đọc cấu hình Time Control từ system_config hoặc default theo mode
    const isCorrespondence = match.mode === 'online_correspondence';
    let timeControl: MatchTimeControl = match.time_control || (null as unknown as MatchTimeControl);

    let initialClock: Record<string, number> | null = null;
    let turnDeadlineIso: string;

    if (isCorrespondence) {
      // Đọc cấu hình giờ cho chế độ chơi theo lượt (Correspondence)
      if (!timeControl && deps.loadSystemConfig) {
        const configVal = await deps.loadSystemConfig('match.correspondence_per_move_hours');
        if (configVal && typeof configVal.hours === 'number') {
          timeControl = {
            kind: 'correspondence',
            perMoveSeconds: Number(configVal.hours) * 3600,
          };
        }
      }
      const perMoveSeconds =
        (timeControl && 'perMoveSeconds' in timeControl ? timeControl.perMoveSeconds : null) ??
        86400; // Mặc định 24h = 86,400s
      timeControl = { kind: 'correspondence', perMoveSeconds };

      // CORRESPONDENCE KHÔNG CÓ QUỸ GIỜ DỒN: clock = NULL
      initialClock = null;
      turnDeadlineIso = new Date(getNow() + perMoveSeconds * 1000).toISOString();
    } else {
      // Chế độ Realtime (P3.4): Đọc cấu hình time_control dồn
      if (!timeControl && deps.loadSystemConfig) {
        const configVal = await deps.loadSystemConfig('match.default_time_control');
        if (configVal && typeof configVal.baseSeconds === 'number') {
          timeControl = {
            kind: 'realtime',
            baseSeconds: Number(configVal.baseSeconds),
            incrementSeconds: Number(configVal.incrementSeconds || 0),
          };
        }
      }
      const baseSeconds =
        (timeControl && 'baseSeconds' in timeControl ? timeControl.baseSeconds : null) ?? 300;
      const incrementSeconds =
        (timeControl && 'incrementSeconds' in timeControl ? timeControl.incrementSeconds : 0) ?? 5;
      timeControl = { kind: 'realtime', baseSeconds, incrementSeconds };
      const baseMs = baseSeconds * 1000;

      // Khởi tạo quỹ giờ theo seat_index
      initialClock = {};
      for (const p of participants) {
        initialClock[String(p.seat_index)] = baseMs;
      }
      // Nếu chưa có participants, mặc định 2 seat
      if (participants.length === 0) {
        initialClock['0'] = baseMs;
        initialClock['1'] = baseMs;
      }

      const currentSeatBaseMs = initialClock[String(currentSeat)] ?? baseMs;
      turnDeadlineIso = new Date(getNow() + currentSeatBaseMs).toISOString();
    }

    const turnStartedAtIso = nowIso;

    // 7. Ghi bản ghi vào match_live_state (Kèm cơ chế chống đua Concurrent Race Condition)
    try {
      await deps.insertLiveState({
        match_id: matchId,
        state_serialized: stateSerialized,
        move_index: 0,
        current_seat: currentSeat,
        moves_serialized: '',
        clock: initialClock,
        turn_started_at: turnStartedAtIso,
        turn_deadline: turnDeadlineIso,
      });
    } catch (insertErr) {
      // Nếu có người chơi khác vừa insert thành công ở cùng mili-giây -> Tải lại state và trả về 200 an toàn
      const reloadedState = await deps.loadLiveState(matchId);
      if (reloadedState) {
        deps.log({
          fn: 'referee',
          action: 'init',
          matchId,
          userId,
          outcome: 'already_initialized_race',
          ms: getNow() - startTime,
        });
        return {
          status: 200,
          body: {
            ok: true,
            data: {
              stateSerialized: reloadedState.state_serialized,
              moveIndex: reloadedState.move_index,
              currentSeat: reloadedState.current_seat,
              movesSerialized: reloadedState.moves_serialized,
              clock: reloadedState.clock || null,
              turnDeadline: reloadedState.turn_deadline || null,
              serverNow: nowIso,
              timeControl: match.time_control || null,
            },
          },
        };
      }
      throw insertErr;
    }

    // 8. Phát sóng thông điệp match_ready qua Realtime Broadcast
    await deps.broadcast(matchId, 'match_ready', {
      matchId,
      moveIndex: 0,
      currentSeat,
      stateSerialized,
      clock: initialClock,
      turnDeadline: turnDeadlineIso,
      serverNow: nowIso,
      timeControl,
    });

    deps.log({
      fn: 'referee',
      action: 'init',
      matchId,
      userId,
      outcome: 'created',
      ms: getNow() - startTime,
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          stateSerialized,
          moveIndex: 0,
          currentSeat,
          movesSerialized: '',
          clock: initialClock,
          turnDeadline: turnDeadlineIso,
          serverNow: nowIso,
          timeControl,
        },
      },
    };
  } catch (err) {
    deps.log({
      fn: 'referee',
      action: 'init',
      matchId,
      userId,
      outcome: 'INTERNAL_ERROR',
      ms: getNow() - startTime,
    });
    return {
      status: 500,
      body: {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      },
    };
  }
}

/**
 * Xử lý Action 'move': Thẩm định, tính giờ và áp dụng nước đi trực tuyến.
 */
export async function handleMoveAction(
  userId: string,
  payload: { matchId: string; moveSerialized: string; expectedMoveIndex: number },
  deps: RefereeDependencies,
): Promise<CoreResult<unknown>> {
  const getNow = deps.now || Date.now;
  const startTime = getNow();
  const { matchId, moveSerialized, expectedMoveIndex } = payload;

  try {
    // 0. Validate payload đầu vào cơ bản
    if (!matchId || typeof moveSerialized !== 'string' || typeof expectedMoveIndex !== 'number') {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId: matchId || '',
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'BAD_REQUEST',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: 'BAD_REQUEST',
            message:
              'Payload nước đi không hợp lệ (yêu cầu matchId, moveSerialized, expectedMoveIndex).',
          },
        },
      };
    }

    // ==============================================================================
    // CHUỖI THẨM ĐỊNH NƯỚC ĐI (VALIDATION CHAIN a -> f)
    // ==============================================================================

    // [a] Kiểm tra sự tồn tại của trận đấu và live_state
    const { match, participants } = await deps.loadMatchAndParticipants(matchId);
    const liveState = await deps.loadLiveState(matchId);

    if (!match || !liveState) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'MATCH_NOT_FOUND',
        ms: getNow() - startTime,
      });
      return {
        status: 404,
        body: {
          ok: false,
          error: {
            code: 'MATCH_NOT_FOUND',
            message: 'Không tìm thấy ván đấu hoặc ván đấu chưa được khởi tạo.',
          },
        },
      };
    }

    // [a.2] Kiểm tra người gọi có phải là đấu thủ trong trận
    const callerParticipant = participants.find((p) => p.user_id === userId);
    if (!callerParticipant) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'NOT_PARTICIPANT',
        ms: getNow() - startTime,
      });
      return {
        status: 403,
        body: {
          ok: false,
          error: { code: 'NOT_PARTICIPANT', message: 'Bạn không phải đấu thủ của ván đấu này.' },
        },
      };
    }

    // [b] Kiểm tra trạng thái trận đấu chưa kết thúc
    if (match.ended_at !== null) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'MATCH_ENDED',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: { ok: false, error: { code: 'MATCH_ENDED', message: 'Ván đấu đã kết thúc.' } },
      };
    }

    const nowMs = getNow();
    const nowIso = new Date(nowMs).toISOString();

    // [c] Kiểm tra Idempotency và Lệch nhịp (expectedMoveIndex vs liveState.move_index)
    if (expectedMoveIndex < liveState.move_index) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'duplicate_accepted',
        ms: getNow() - startTime,
      });
      return {
        status: 200,
        body: {
          ok: true,
          data: {
            duplicate: true,
            stateSerialized: liveState.state_serialized,
            moveIndex: liveState.move_index,
            currentSeat: liveState.current_seat,
            clock: liveState.clock || null,
            turnDeadline: liveState.turn_deadline || null,
            serverNow: nowIso,
          },
        },
      };
    }

    if (expectedMoveIndex > liveState.move_index) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'STALE_CLIENT',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: {
          ok: false,
          error: {
            code: 'STALE_CLIENT',
            message: `Trạng thái client lệch nhịp (server: ${liveState.move_index}, client: ${expectedMoveIndex}). Vui lòng đồng bộ lại thế cờ.`,
          },
        },
      };
    }

    // [d] Kiểm tra đúng lượt rẻ tiền (Cheap Turn Check) từ DB trước khi gọi Engine
    if (callerParticipant.seat_index !== liveState.current_seat) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'WRONG_TURN',
        ms: getNow() - startTime,
      });
      return {
        status: 403,
        body: { ok: false, error: { code: 'WRONG_TURN', message: 'Chưa đến lượt đi của bạn.' } },
      };
    }

    // ==============================================================================
    // [BƯỚC MỚI: TÍNH GIỜ SERVER-SIDE]
    // ==============================================================================
    const isCorrespondence =
      match.mode === 'online_correspondence' || match.time_control?.kind === 'correspondence';
    let isTimedOut = false;
    let remainingMs = 0;

    if (isCorrespondence) {
      // Chế độ chơi theo lượt (Correspondence): So sánh trực tiếp mốc turn_deadline tươi
      const deadlineMs = liveState.turn_deadline
        ? new Date(liveState.turn_deadline).getTime()
        : nowMs;
      if (nowMs > deadlineMs) {
        isTimedOut = true;
      }
    } else {
      // Chế độ Realtime (P3.4): Tính elapsed trừ vào quỹ giờ tích lũy
      const seatKey = String(callerParticipant.seat_index);
      const turnStartedMs = liveState.turn_started_at
        ? new Date(liveState.turn_started_at).getTime()
        : nowMs;
      const elapsedMs = Math.max(0, nowMs - turnStartedMs);
      const currentSeatClockMs = liveState.clock?.[seatKey] ?? 300000;
      remainingMs = currentSeatClockMs - elapsedMs;

      if (remainingMs <= 0) {
        isTimedOut = true;
      }
    }

    if (isTimedOut) {
      // NGƯỜI GỬI ĐÃ HẾT GIỜ KHI CỐ GỬI NƯỚC ĐI MUỘN
      let threshold = 3;
      if (deps.loadSystemConfig) {
        const thresholdCfg = await deps.loadSystemConfig('match.abort_move_threshold');
        if (thresholdCfg && typeof thresholdCfg.moves === 'number') {
          threshold = Number(thresholdCfg.moves);
        }
      }

      const startedAtMs = new Date(match.started_at).getTime();
      const durationMs = Math.max(0, nowMs - startedAtMs);
      const isAbort = liveState.move_index < threshold;
      const endReason = isAbort ? 'abort' : 'timeout';

      const participantsResult = participants.map((p) => ({
        user_id: p.user_id,
        is_winner: isAbort ? null : p.seat_index !== callerParticipant.seat_index,
      }));

      await deps.finalizeMatch(
        matchId,
        {
          ended_at: nowIso,
          duration_ms: durationMs,
          final_state: liveState.state_serialized,
          moves: liveState.moves_serialized,
          end_reason: endReason,
        },
        participantsResult,
      );

      await deps.deleteLiveState(matchId);

      const outcomes = isAbort
        ? null
        : participants.map((p) => ({
            playerIndex: p.seat_index,
            outcome: (p.seat_index === callerParticipant.seat_index ? 'loss' : 'win') as
              | 'win'
              | 'loss',
          }));

      await deps.broadcast(matchId, 'match_ended', {
        matchId,
        reason: endReason,
        outcomes,
        serverNow: nowIso,
      });

      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'TIME_OUT',
        ms: getNow() - startTime,
      });

      return {
        status: 409,
        body: {
          ok: false,
          error: {
            code: 'TIME_OUT',
            message: 'Thời gian dành cho nước đi của bạn đã kết thúc.',
          },
        },
      };
    }

    // [e] Nạp Engine & Deserialize State + Move
    const engineModule = getGameEngineModule(match.game_id);
    if (!engineModule) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'UNSUPPORTED_GAME',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: 'UNSUPPORTED_GAME',
            message: `Trò chơi "${match.game_id}" chưa được hỗ trợ.`,
          },
        },
      };
    }

    let currentState: unknown;
    try {
      currentState = engineModule.engine.deserialize(liveState.state_serialized);
    } catch {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'INVALID_STATE',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Không thể giải mã trạng thái bàn cờ hiện tại.',
          },
        },
      };
    }

    let parsedMove: unknown;
    try {
      parsedMove = engineModule.parseMove(moveSerialized);
    } catch {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'BAD_MOVE',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: 'BAD_MOVE',
            message: `Định dạng nước đi không hợp lệ: "${moveSerialized}".`,
          },
        },
      };
    }

    // [f] Thẩm định tính hợp lệ của nước đi qua Game Engine TS thuần túy
    let nextState: unknown;
    try {
      nextState = engineModule.engine.applyMove(
        currentState,
        parsedMove,
        callerParticipant.seat_index,
      );
    } catch (engineErr) {
      if (engineErr instanceof EngineError) {
        if (engineErr.code === 'ILLEGAL_MOVE') {
          deps.log({
            fn: 'referee',
            action: 'move',
            matchId,
            userId,
            moveIndex: expectedMoveIndex,
            outcome: 'ILLEGAL_MOVE',
            ms: getNow() - startTime,
          });
          return {
            status: 422,
            body: { ok: false, error: { code: 'ILLEGAL_MOVE', message: engineErr.message } },
          };
        }
        if (engineErr.code === 'WRONG_TURN') {
          deps.log({
            fn: 'referee',
            action: 'move',
            matchId,
            userId,
            moveIndex: expectedMoveIndex,
            outcome: 'WRONG_TURN',
            ms: getNow() - startTime,
          });
          return {
            status: 403,
            body: { ok: false, error: { code: 'WRONG_TURN', message: engineErr.message } },
          };
        }
        if (engineErr.code === 'GAME_OVER') {
          deps.log({
            fn: 'referee',
            action: 'move',
            matchId,
            userId,
            moveIndex: expectedMoveIndex,
            outcome: 'MATCH_ENDED',
            ms: getNow() - startTime,
          });
          return {
            status: 409,
            body: { ok: false, error: { code: 'MATCH_ENDED', message: engineErr.message } },
          };
        }
      }

      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'ENGINE_ERROR',
        ms: getNow() - startTime,
      });
      return {
        status: 500,
        body: {
          ok: false,
          error: {
            code: 'ENGINE_ERROR',
            message: engineErr instanceof Error ? engineErr.message : String(engineErr),
          },
        },
      };
    }

    // ==============================================================================
    // TÍNH ĐỒNG HỒ & THỜI HẠN NƯỚC ĐI MỚI (QUA HÀM THUẦN computeDeadlineAfterMove)
    // ==============================================================================
    const nextStateSerialized = engineModule.engine.serialize(nextState);
    const nextMoveIndex = expectedMoveIndex + 1;
    const nextSeat = engineModule.engine.currentPlayer(nextState);
    const nextMovesSerialized = liveState.moves_serialized
      ? `${liveState.moves_serialized},${moveSerialized}`
      : moveSerialized;

    const nextTurnStartedAt = nowIso;
    const { nextClock, nextTurnDeadline } = computeDeadlineAfterMove(
      match.time_control,
      liveState.clock,
      callerParticipant.seat_index,
      nextSeat,
      remainingMs,
      nowMs,
    );

    // ==============================================================================
    // GHI DATABASE VỚI KHÓA LẠC QUAN (OPTIMISTIC LOCKING)
    // ==============================================================================
    const isLockAcquired = await deps.updateLiveStateOptimistic({
      match_id: matchId,
      state_serialized: nextStateSerialized,
      next_move_index: nextMoveIndex,
      current_seat: nextSeat,
      moves_serialized: nextMovesSerialized,
      expected_move_index: expectedMoveIndex,
      clock: nextClock,
      turn_started_at: nextTurnStartedAt,
      turn_deadline: nextTurnDeadline,
    });

    if (!isLockAcquired) {
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'RACE_LOST_STALE_CLIENT',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: {
          ok: false,
          error: {
            code: 'STALE_CLIENT',
            message: 'Nước đi bị xung đột với một yêu cầu song song khác. Vui lòng thử lại.',
          },
        },
      };
    }

    // ==============================================================================
    // KIỂM TRA TRẠNG THÁI KẾT THÚC VÁN ĐẤU (TERMINAL CHECK)
    // ==============================================================================
    const terminalResult: TerminalResult = engineModule.engine.isTerminal(nextState);

    if (terminalResult.over) {
      const startedAtMs = new Date(match.started_at).getTime();
      const durationMs = Math.max(0, nowMs - startedAtMs);

      const participantsResult = participants.map((p) => {
        const playerOutcome = terminalResult.outcomes?.find((o) => o.playerIndex === p.seat_index);
        return {
          user_id: p.user_id,
          is_winner: playerOutcome ? playerOutcome.outcome === 'win' : false,
        };
      });

      await deps.finalizeMatch(
        matchId,
        {
          ended_at: nowIso,
          duration_ms: durationMs,
          final_state: nextStateSerialized,
          moves: nextMovesSerialized,
          end_reason: 'normal',
        },
        participantsResult,
      );

      await deps.deleteLiveState(matchId);
    }

    // ==============================================================================
    // PHÁT SÓNG BROADCAST QUA REALTIME TRANSPORT
    // ==============================================================================
    await deps.broadcast(matchId, 'move_accepted', {
      matchId,
      moveIndex: nextMoveIndex,
      moveSerialized,
      currentSeat: nextSeat,
      stateSerialized: nextStateSerialized,
      terminal: terminalResult.over ? terminalResult : null,
      clock: nextClock,
      turnDeadline: nextTurnDeadline,
      serverNow: nowIso,
    });

    deps.log({
      fn: 'referee',
      action: 'move',
      matchId,
      userId,
      moveIndex: nextMoveIndex,
      outcome: 'accepted',
      ms: getNow() - startTime,
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          moveIndex: nextMoveIndex,
          moveSerialized,
          currentSeat: nextSeat,
          stateSerialized: nextStateSerialized,
          terminal: terminalResult.over ? terminalResult : null,
          clock: nextClock,
          turnDeadline: nextTurnDeadline,
          serverNow: nowIso,
        },
      },
    };
  } catch (err) {
    deps.log({
      fn: 'referee',
      action: 'move',
      matchId,
      userId,
      moveIndex: expectedMoveIndex,
      outcome: 'INTERNAL_ERROR',
      ms: getNow() - startTime,
    });
    return {
      status: 500,
      body: {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      },
    };
  }
}

/**
 * Xử lý Action 'resign': Đầu hàng / Xin thua ván đấu online.
 */
export async function handleResignAction(
  userId: string,
  payload: { matchId: string },
  deps: RefereeDependencies,
): Promise<CoreResult<unknown>> {
  const getNow = deps.now || Date.now;
  const startTime = getNow();
  const { matchId } = payload;

  try {
    if (!matchId) {
      deps.log({
        fn: 'referee',
        action: 'resign',
        matchId: '',
        userId,
        outcome: 'BAD_REQUEST',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: { ok: false, error: { code: 'BAD_REQUEST', message: 'Thiếu matchId.' } },
      };
    }

    const { match, participants } = await deps.loadMatchAndParticipants(matchId);
    const liveState = await deps.loadLiveState(matchId);

    if (!match) {
      deps.log({
        fn: 'referee',
        action: 'resign',
        matchId,
        userId,
        outcome: 'MATCH_NOT_FOUND',
        ms: getNow() - startTime,
      });
      return {
        status: 404,
        body: { ok: false, error: { code: 'MATCH_NOT_FOUND', message: 'Không tìm thấy ván đấu.' } },
      };
    }

    const callerParticipant = participants.find((p) => p.user_id === userId);
    if (!callerParticipant) {
      deps.log({
        fn: 'referee',
        action: 'resign',
        matchId,
        userId,
        outcome: 'NOT_PARTICIPANT',
        ms: getNow() - startTime,
      });
      return {
        status: 403,
        body: {
          ok: false,
          error: { code: 'NOT_PARTICIPANT', message: 'Bạn không phải đấu thủ của ván đấu này.' },
        },
      };
    }

    if (match.ended_at !== null || !liveState) {
      // Ván đấu đã kết thúc trước đó -> Idempotent an toàn
      deps.log({
        fn: 'referee',
        action: 'resign',
        matchId,
        userId,
        outcome: 'MATCH_ENDED',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: { ok: false, error: { code: 'MATCH_ENDED', message: 'Ván đấu đã kết thúc.' } },
      };
    }

    const nowMs = getNow();
    const nowIso = new Date(nowMs).toISOString();

    // Đọc ngưỡng abort
    let threshold = 3;
    if (deps.loadSystemConfig) {
      const thresholdCfg = await deps.loadSystemConfig('match.abort_move_threshold');
      if (thresholdCfg && typeof thresholdCfg.moves === 'number') {
        threshold = Number(thresholdCfg.moves);
      }
    }

    const isAbort = liveState.move_index < threshold;
    const endReason = isAbort ? 'abort' : 'resign';
    const startedAtMs = new Date(match.started_at).getTime();
    const durationMs = Math.max(0, nowMs - startedAtMs);

    const participantsResult = participants.map((p) => ({
      user_id: p.user_id,
      is_winner: isAbort ? null : p.seat_index !== callerParticipant.seat_index,
    }));

    await deps.finalizeMatch(
      matchId,
      {
        ended_at: nowIso,
        duration_ms: durationMs,
        final_state: liveState.state_serialized,
        moves: liveState.moves_serialized,
        end_reason: endReason,
      },
      participantsResult,
    );

    await deps.deleteLiveState(matchId);

    const outcomes = isAbort
      ? null
      : participants.map((p) => ({
          playerIndex: p.seat_index,
          outcome: (p.seat_index === callerParticipant.seat_index ? 'loss' : 'win') as
            | 'win'
            | 'loss',
        }));

    await deps.broadcast(matchId, 'match_ended', {
      matchId,
      reason: endReason,
      outcomes,
      serverNow: nowIso,
    });

    deps.log({
      fn: 'referee',
      action: 'resign',
      matchId,
      userId,
      outcome: 'accepted',
      ms: getNow() - startTime,
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          matchId,
          reason: endReason,
          outcomes,
          serverNow: nowIso,
        },
      },
    };
  } catch (err) {
    deps.log({
      fn: 'referee',
      action: 'resign',
      matchId,
      userId,
      outcome: 'INTERNAL_ERROR',
      ms: getNow() - startTime,
    });
    return {
      status: 500,
      body: {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      },
    };
  }
}

/**
 * Xử lý Action 'claim_timeout': Đòi xử thắng khi đối thủ quá hạn nước đi.
 */
export async function handleClaimTimeoutAction(
  userId: string,
  payload: { matchId: string },
  deps: RefereeDependencies,
): Promise<CoreResult<unknown>> {
  const getNow = deps.now || Date.now;
  const startTime = getNow();
  const { matchId } = payload;

  try {
    if (!matchId) {
      deps.log({
        fn: 'referee',
        action: 'claim_timeout',
        matchId: '',
        userId,
        outcome: 'BAD_REQUEST',
        ms: getNow() - startTime,
      });
      return {
        status: 400,
        body: { ok: false, error: { code: 'BAD_REQUEST', message: 'Thiếu matchId.' } },
      };
    }

    const { match, participants } = await deps.loadMatchAndParticipants(matchId);
    const liveState = await deps.loadLiveState(matchId);

    if (!match) {
      deps.log({
        fn: 'referee',
        action: 'claim_timeout',
        matchId,
        userId,
        outcome: 'MATCH_NOT_FOUND',
        ms: getNow() - startTime,
      });
      return {
        status: 404,
        body: { ok: false, error: { code: 'MATCH_NOT_FOUND', message: 'Không tìm thấy ván đấu.' } },
      };
    }

    const callerParticipant = participants.find((p) => p.user_id === userId);
    if (!callerParticipant) {
      deps.log({
        fn: 'referee',
        action: 'claim_timeout',
        matchId,
        userId,
        outcome: 'NOT_PARTICIPANT',
        ms: getNow() - startTime,
      });
      return {
        status: 403,
        body: {
          ok: false,
          error: { code: 'NOT_PARTICIPANT', message: 'Bạn không phải đấu thủ của ván đấu này.' },
        },
      };
    }

    if (match.ended_at !== null || !liveState) {
      deps.log({
        fn: 'referee',
        action: 'claim_timeout',
        matchId,
        userId,
        outcome: 'MATCH_ENDED',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: { ok: false, error: { code: 'MATCH_ENDED', message: 'Ván đấu đã kết thúc.' } },
      };
    }

    // CHỈ NGƯỜI ĐANG CHỜ MỚI ĐƯỢC CLAIM TIMEOUT ĐỐI THỦ
    if (callerParticipant.seat_index === liveState.current_seat) {
      deps.log({
        fn: 'referee',
        action: 'claim_timeout',
        matchId,
        userId,
        outcome: 'WRONG_TURN',
        ms: getNow() - startTime,
      });
      return {
        status: 403,
        body: {
          ok: false,
          error: {
            code: 'WRONG_TURN',
            message: 'Đang là lượt đi của bạn, không thể tự khiếu nại timeout của chính mình.',
          },
        },
      };
    }

    const nowMs = getNow();
    const nowIso = new Date(nowMs).toISOString();
    const deadlineMs = liveState.turn_deadline
      ? new Date(liveState.turn_deadline).getTime()
      : nowMs;

    // KIỂM TRA ĐỒNG HỒ SERVER KÈM GRACE PERIOD 2S
    if (nowMs <= deadlineMs + CLAIM_TIMEOUT_GRACE_MS) {
      deps.log({
        fn: 'referee',
        action: 'claim_timeout',
        matchId,
        userId,
        outcome: 'TOO_EARLY',
        ms: getNow() - startTime,
      });
      return {
        status: 409,
        body: {
          ok: false,
          error: {
            code: 'TOO_EARLY',
            message: 'Chưa đủ thời gian quá hạn (bao gồm 2 giây bù trễ mạng).',
          },
          data: {
            turnDeadline: liveState.turn_deadline,
            serverNow: nowIso,
          },
        } as unknown as ApiResponseError,
      };
    }

    // Đọc ngưỡng abort
    let threshold = 3;
    if (deps.loadSystemConfig) {
      const thresholdCfg = await deps.loadSystemConfig('match.abort_move_threshold');
      if (thresholdCfg && typeof thresholdCfg.moves === 'number') {
        threshold = Number(thresholdCfg.moves);
      }
    }

    const isAbort = liveState.move_index < threshold;
    const endReason = isAbort ? 'abort' : 'timeout';
    const startedAtMs = new Date(match.started_at).getTime();
    const durationMs = Math.max(0, nowMs - startedAtMs);

    const timedOutSeat = liveState.current_seat;
    const participantsResult = participants.map((p) => ({
      user_id: p.user_id,
      is_winner: isAbort ? null : p.seat_index !== timedOutSeat,
    }));

    await deps.finalizeMatch(
      matchId,
      {
        ended_at: nowIso,
        duration_ms: durationMs,
        final_state: liveState.state_serialized,
        moves: liveState.moves_serialized,
        end_reason: endReason,
      },
      participantsResult,
    );

    await deps.deleteLiveState(matchId);

    const outcomes = isAbort
      ? null
      : participants.map((p) => ({
          playerIndex: p.seat_index,
          outcome: (p.seat_index === timedOutSeat ? 'loss' : 'win') as 'win' | 'loss',
        }));

    await deps.broadcast(matchId, 'match_ended', {
      matchId,
      reason: endReason,
      outcomes,
      serverNow: nowIso,
    });

    deps.log({
      fn: 'referee',
      action: 'claim_timeout',
      matchId,
      userId,
      outcome: 'accepted',
      ms: getNow() - startTime,
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          matchId,
          reason: endReason,
          outcomes,
          serverNow: nowIso,
        },
      },
    };
  } catch (err) {
    deps.log({
      fn: 'referee',
      action: 'claim_timeout',
      matchId,
      userId,
      outcome: 'INTERNAL_ERROR',
      ms: getNow() - startTime,
    });
    return {
      status: 500,
      body: {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      },
    };
  }
}
