/**
 * ==============================================================================
 * REFEREE REPOSITORY (SRC/REPOSITORIES/REFEREEREPOSITORY.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. CỔNG THOÁT HIỂM GỌI TRỌNG TÀI SERVER-SIDE (P3.2):
 *    - Là nơi DUY NHẤT trong frontend được phép gọi Edge Function `referee`.
 *    - Màn hình trận đấu online (Phase P3.3) sẽ sử dụng repository này kết hợp với
 *      hook `useMatchChannel` để điều khiển ván đấu trực tuyến.
 * 2. NGUYÊN TẮC PHÂN LOẠI LỖI (P2.5b):
 *    - `duplicate` (gửi lặp do mạng) và `stale` (lệch nhịp): Trả về kết quả phân biệt,
 *      KHÔNG throw lỗi vì đây là trạng thái vận hành bình thường của mạng di động.
 *    - Các lỗi nghiệp vụ khác (`ILLEGAL_MOVE`, `WRONG_TURN`, `NOT_PARTICIPANT`...)
 *      được bọc thành `RepoError` (FATAL / RETRYABLE).
 * ==============================================================================
 */

import type { TerminalResult } from '@engines/types';
import { supabase } from './supabaseClient';
import { RepoError, type RepoErrorCode } from './types';

export interface MatchLiveStateDto {
  readonly stateSerialized: string;
  readonly moveIndex: number;
  readonly currentSeat: number;
  readonly movesSerialized: string;
}

export type SubmitMoveResult =
  | {
      readonly kind: 'accepted';
      readonly moveIndex: number;
      readonly currentSeat: number;
      readonly stateSerialized: string;
      readonly terminal?: TerminalResult | null;
    }
  | {
      readonly kind: 'duplicate';
      readonly moveIndex: number;
      readonly currentSeat: number;
      readonly stateSerialized: string;
    }
  | {
      readonly kind: 'stale';
      readonly message: string;
      readonly moveIndex?: number;
      readonly stateSerialized?: string;
    };

export interface RefereeRepository {
  /**
   * Khởi tạo thế cờ ban đầu cho ván đấu online qua Trọng tài Server.
   * @param matchId Mã định danh ván đấu (UUID)
   */
  initMatch(matchId: string): Promise<MatchLiveStateDto>;

  /**
   * Gửi nước đi lên Trọng tài Server để thẩm định và áp dụng vào DB.
   * @param matchId Mã ván đấu
   * @param moveSerialized Nước đi dạng chuỗi nén
   * @param expectedMoveIndex Khóa lạc quan & Idempotency
   */
  submitMove(
    matchId: string,
    moveSerialized: string,
    expectedMoveIndex: number,
  ): Promise<SubmitMoveResult>;
}

interface FunctionApiResponse<T = unknown> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly [key: string]: unknown;
  };
}

/**
 * Trích xuất an toàn JSON response từ Supabase Functions invoke (hỗ trợ cả mã 200 và 4xx/5xx).
 */
async function parseFunctionResponse<T>(res: {
  data: unknown;
  error: { message?: string; context?: { json?: () => Promise<unknown> } } | null;
}): Promise<FunctionApiResponse<T>> {
  if (res.data && typeof res.data === 'object' && 'ok' in res.data) {
    return res.data as FunctionApiResponse<T>;
  }

  if (res.error) {
    if (res.error.context && typeof res.error.context.json === 'function') {
      try {
        const body = await res.error.context.json();
        if (body && typeof body === 'object' && 'ok' in body) {
          return body as FunctionApiResponse<T>;
        }
      } catch {
        // Bỏ qua lỗi parse JSON nội bộ
      }
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: res.error.message || 'Lỗi kết nối tới Trọng tài Server.',
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'Phản hồi từ Trọng tài không đúng định dạng chuẩn.',
    },
  };
}

function classifyErrorCode(code: string): RepoErrorCode {
  switch (code) {
    case 'ILLEGAL_MOVE':
    case 'WRONG_TURN':
    case 'NOT_PARTICIPANT':
    case 'MATCH_NOT_FOUND':
    case 'MATCH_ENDED':
    case 'UNSUPPORTED_GAME':
    case 'BAD_REQUEST':
    case 'BAD_ACTION':
    case 'BAD_MOVE':
    case 'INVALID_STATE':
    case 'UNAUTHORIZED':
      return 'FATAL';
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
    case 'INTERNAL_ERROR':
    case 'ENGINE_ERROR':
    default:
      return 'RETRYABLE';
  }
}

export const refereeRepository: RefereeRepository = {
  async initMatch(matchId: string): Promise<MatchLiveStateDto> {
    if (!matchId) {
      throw new RepoError('matchId không được để trống.', 'FATAL');
    }

    try {
      const res = await supabase.functions.invoke('referee', {
        body: { action: 'init', matchId },
      });

      const parsed = await parseFunctionResponse<MatchLiveStateDto>(res);

      if (!parsed.ok || !parsed.data) {
        const errCode = parsed.error?.code || 'INIT_FAILED';
        const errMsg = parsed.error?.message || 'Khởi tạo trận đấu thất bại.';
        throw new RepoError(errMsg, classifyErrorCode(errCode), parsed.error);
      }

      return parsed.data;
    } catch (err) {
      if (err instanceof RepoError) throw err;
      throw new RepoError(
        err instanceof Error ? err.message : 'Lỗi không xác định khi gọi initMatch.',
        'RETRYABLE',
        err,
      );
    }
  },

  async submitMove(
    matchId: string,
    moveSerialized: string,
    expectedMoveIndex: number,
  ): Promise<SubmitMoveResult> {
    if (!matchId || typeof moveSerialized !== 'string' || typeof expectedMoveIndex !== 'number') {
      throw new RepoError('Tham số submitMove không hợp lệ.', 'FATAL');
    }

    try {
      const res = await supabase.functions.invoke('referee', {
        body: {
          action: 'move',
          matchId,
          moveSerialized,
          expectedMoveIndex,
        },
      });

      const parsed = await parseFunctionResponse<{
        moveIndex: number;
        currentSeat: number;
        stateSerialized: string;
        duplicate?: boolean;
        terminal?: TerminalResult | null;
      }>(res);

      if (parsed.ok && parsed.data) {
        if (parsed.data.duplicate) {
          return {
            kind: 'duplicate',
            moveIndex: parsed.data.moveIndex,
            currentSeat: parsed.data.currentSeat,
            stateSerialized: parsed.data.stateSerialized,
          };
        }

        return {
          kind: 'accepted',
          moveIndex: parsed.data.moveIndex,
          currentSeat: parsed.data.currentSeat,
          stateSerialized: parsed.data.stateSerialized,
          terminal: parsed.data.terminal,
        };
      }

      // Xử lý trường hợp STALE_CLIENT (không throw, trả về kind: 'stale' để UI tự đồng bộ)
      if (parsed.error?.code === 'STALE_CLIENT') {
        return {
          kind: 'stale',
          message: parsed.error.message,
          moveIndex:
            typeof parsed.error.moveIndex === 'number' ? parsed.error.moveIndex : undefined,
          stateSerialized:
            typeof parsed.error.stateSerialized === 'string'
              ? parsed.error.stateSerialized
              : undefined,
        };
      }

      // Các lỗi khác ném RepoError theo phân loại
      const errCode = parsed.error?.code || 'MOVE_FAILED';
      const errMsg = parsed.error?.message || 'Gửi nước đi thất bại.';
      throw new RepoError(errMsg, classifyErrorCode(errCode), parsed.error);
    } catch (err) {
      if (err instanceof RepoError) throw err;
      throw new RepoError(
        err instanceof Error ? err.message : 'Lỗi không xác định khi gọi submitMove.',
        'RETRYABLE',
        err,
      );
    }
  },
};
