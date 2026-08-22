/**
 * ==============================================================================
 * LOGIC TRỌNG TÀI THUẦN TÚY (SUPABASE/FUNCTIONS/REFEREE/CORE.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & SECURITY:
 * 1. TÁCH BIỆT LOGIC (CORE PATTERN):
 *    - Toàn bộ logic thẩm định nước đi, kiểm tra quyền, khóa lạc quan và tính thắng thua
 *      được viết thuần túy (Pure Logic) nhận Dependencies Inject.
 *    - Cho phép kiểm thử 100% các nhánh logic trong Deno test mà không cần DB thật.
 * 2. CHUỖI VALIDATE CHUẨN HÓA (a -> f):
 *    - a. Tồn tại trận đấu & Người gọi là đấu thủ hợp lệ (404 / 403).
 *    - b. Trận đấu chưa kết thúc (409).
 *    - c. Khóa lũy công / Idempotency & Phát hiện lệch nhịp (200 duplicate / 409 stale).
 *    - d. Kiểm tra đúng lượt rẻ tiền từ DB trước khi gọi Engine (403).
 *    - e. Giải mã cú pháp nước đi và bàn cờ (400).
 *    - f. Thẩm định nước đi bằng Game Engine TS thuần túy (422 / 403 / 409 / 500).
 * 3. KHÓA LẠC QUAN (OPTIMISTIC LOCKING):
 *    - Cập nhật DB kèm điều kiện `move_index = expectedMoveIndex`.
 *    - Nếu `affectedRows === 0` (thua đua request song song): trả về 409 STALE_CLIENT
 *      và KHÔNG phát sóng broadcast.
 * ==============================================================================
 */

import { EngineError, type TerminalResult } from '../../../packages/engines/types/index.ts';
import type { ApiResponseError, ApiResponseSuccess } from '../_shared/response.ts';
import { getGameEngineModule } from './engines.ts';

export interface MatchRecord {
  readonly id: string;
  readonly game_id: string;
  readonly mode: string;
  readonly ended_at: string | null;
  readonly started_at: string;
  readonly options?: Record<string, unknown> | null;
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
  readonly turn_deadline: string | null;
  readonly updated_at: string;
}

export interface RefereeDependencies {
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
  }) => Promise<void>;
  readonly updateLiveStateOptimistic: (record: {
    match_id: string;
    state_serialized: string;
    next_move_index: number;
    current_seat: number;
    moves_serialized: string;
    expected_move_index: number;
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
    participantsResult: { user_id: string; is_winner: boolean }[],
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

/**
 * Xử lý Action 'init': Khởi tạo thế cờ ban đầu cho ván đấu online.
 */
export async function handleInitAction(
  userId: string,
  matchId: string,
  deps: RefereeDependencies,
): Promise<CoreResult<unknown>> {
  const startTime = Date.now();

  try {
    if (!matchId) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId: '',
        userId,
        outcome: 'MISSING_MATCH_ID',
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
      });
      return {
        status: 409,
        body: { ok: false, error: { code: 'MATCH_ENDED', message: 'Ván đấu đã kết thúc.' } },
      };
    }

    // 3. Kiểm tra live_state đã tồn tại chưa (Idempotent: người thứ 2 vào phòng gọi init trùng -> trả state cũ)
    const existingLiveState = await deps.loadLiveState(matchId);
    if (existingLiveState) {
      deps.log({
        fn: 'referee',
        action: 'init',
        matchId,
        userId,
        outcome: 'already_initialized',
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
      playerCount: 2,
      options,
    });

    const stateSerialized = engineModule.engine.serialize(initialState);
    const currentSeat = engineModule.engine.currentPlayer(initialState);

    // 6. Ghi bản ghi vào match_live_state
    await deps.insertLiveState({
      match_id: matchId,
      state_serialized: stateSerialized,
      move_index: 0,
      current_seat: currentSeat,
      moves_serialized: '',
    });

    // 7. Phát sóng thông điệp match_ready qua Realtime Broadcast
    await deps.broadcast(matchId, 'match_ready', {
      matchId,
      moveIndex: 0,
      currentSeat,
      stateSerialized,
    });

    deps.log({
      fn: 'referee',
      action: 'init',
      matchId,
      userId,
      outcome: 'created',
      ms: Date.now() - startTime,
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
      ms: Date.now() - startTime,
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
 * Xử lý Action 'move': Thẩm định và áp dụng nước đi trực tuyến.
 */
export async function handleMoveAction(
  userId: string,
  payload: { matchId: string; moveSerialized: string; expectedMoveIndex: number },
  deps: RefereeDependencies,
): Promise<CoreResult<unknown>> {
  const startTime = Date.now();
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
      });
      return {
        status: 409,
        body: { ok: false, error: { code: 'MATCH_ENDED', message: 'Ván đấu đã kết thúc.' } },
      };
    }

    // [c] Kiểm tra Idempotency và Lệch nhịp (expectedMoveIndex vs liveState.move_index)
    if (expectedMoveIndex < liveState.move_index) {
      // Client gửi lại nước cũ (mạng lag retry) -> Trả về 200 kèm state hiện tại, KHÔNG áp dụng lại
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'duplicate_accepted',
        ms: Date.now() - startTime,
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
          },
        },
      };
    }

    if (expectedMoveIndex > liveState.move_index) {
      // Client bị nhảy cóc / mất gói tin trước đó -> Trả 409 để client tự đồng bộ lại
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'STALE_CLIENT',
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
      });
      return {
        status: 403,
        body: { ok: false, error: { code: 'WRONG_TURN', message: 'Chưa đến lượt đi của bạn.' } },
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
            ms: Date.now() - startTime,
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
            ms: Date.now() - startTime,
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
            ms: Date.now() - startTime,
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
        ms: Date.now() - startTime,
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
    // GHI DATABASE VỚI KHÓA LẠC QUAN (OPTIMISTIC LOCKING)
    // ==============================================================================
    const nextStateSerialized = engineModule.engine.serialize(nextState);
    const nextMoveIndex = expectedMoveIndex + 1;
    const nextSeat = engineModule.engine.currentPlayer(nextState);
    const nextMovesSerialized = liveState.moves_serialized
      ? `${liveState.moves_serialized},${moveSerialized}`
      : moveSerialized;

    const isLockAcquired = await deps.updateLiveStateOptimistic({
      match_id: matchId,
      state_serialized: nextStateSerialized,
      next_move_index: nextMoveIndex,
      current_seat: nextSeat,
      moves_serialized: nextMovesSerialized,
      expected_move_index: expectedMoveIndex,
    });

    if (!isLockAcquired) {
      // Thua đua request song song -> Đọc lại state mới nhất và trả 409 STALE_CLIENT (KHÔNG broadcast)
      deps.log({
        fn: 'referee',
        action: 'move',
        matchId,
        userId,
        moveIndex: expectedMoveIndex,
        outcome: 'RACE_LOST_STALE_CLIENT',
        ms: Date.now() - startTime,
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
      // Ván đấu kết thúc -> Hoàn tất bảng matches, cập nhật kết quả và dọn dẹp live_state
      const startedAtMs = new Date(match.started_at).getTime();
      const durationMs = Math.max(0, Date.now() - startedAtMs);

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
          ended_at: new Date().toISOString(),
          duration_ms: durationMs,
          final_state: nextStateSerialized,
          moves: nextMovesSerialized,
          end_reason: 'normal',
        },
        participantsResult,
      );

      // Xóa match_live_state để giữ DB gọn gàng (kết quả đã lưu ở bảng matches)
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
      terminal: terminalResult.over ? terminalResult : null,
    });

    deps.log({
      fn: 'referee',
      action: 'move',
      matchId,
      userId,
      moveIndex: nextMoveIndex,
      outcome: 'accepted',
      ms: Date.now() - startTime,
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
      ms: Date.now() - startTime,
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
