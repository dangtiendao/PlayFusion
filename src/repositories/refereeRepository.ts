/**
 * ==============================================================================
 * REFEREE REPOSITORY (SRC/REPOSITORIES/REFEREEREPOSITORY.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. CỔNG THOÁT HIỂM GỌI TRỌNG TÀI SERVER-SIDE (P3.2 & P3.4):
 *    - Là nơi DUY NHẤT trong frontend được phép gọi Edge Function `referee`.
 *    - Màn hình trận đấu online kết hợp repository này với hook `useMatchChannel`
 *      để điều khiển ván đấu trực tuyến và đồng hồ.
 * 2. NGUYÊN TẮC PHÂN LOẠI LỖI (P2.5b & P3.4c):
 *    - `duplicate` (gửi lặp do mạng), `stale` (lệch nhịp), `too_early` (claim sớm),
 *      và `match_ended` (ván đã kết thúc): Trả về kết quả phân biệt có cấu trúc,
 *      KHÔNG throw lỗi vì đây là trạng thái vận hành bình thường của mạng di động.
 *    - Các lỗi nghiệp vụ khác (`ILLEGAL_MOVE`, `WRONG_TURN`, `NOT_PARTICIPANT`...)
 *      được bọc thành `RepoError` (FATAL / RETRYABLE).
 * ==============================================================================
 */

import type { TerminalResult } from '@engines/types';
import { supabase } from './supabaseClient';
import { RepoError } from './types';

export interface MatchLiveStateDto {
  readonly stateSerialized: string;
  readonly moveIndex: number;
  readonly currentSeat: number;
  readonly movesSerialized: string;
  readonly clock?: Record<string, number> | null;
  readonly turnDeadline?: string | null;
  readonly serverNow?: string | null;
}

export type SubmitMoveResult =
  | {
      readonly kind: 'accepted';
      readonly moveIndex: number;
      readonly currentSeat: number;
      readonly stateSerialized: string;
      readonly terminal?: TerminalResult | null;
      readonly clock?: Record<string, number> | null;
      readonly turnDeadline?: string | null;
      readonly serverNow?: string | null;
    }
  | {
      readonly kind: 'duplicate';
      readonly moveIndex: number;
      readonly currentSeat: number;
      readonly stateSerialized: string;
      readonly clock?: Record<string, number> | null;
      readonly turnDeadline?: string | null;
      readonly serverNow?: string | null;
    }
  | {
      readonly kind: 'stale';
      readonly message: string;
      readonly moveIndex?: number;
      readonly stateSerialized?: string;
    }
  | {
      readonly kind: 'timeout';
      readonly message: string;
    };

export interface ResignResult {
  readonly matchId: string;
  readonly reason: 'resign' | 'abort';
  readonly outcomes?: { playerIndex: number; outcome: 'win' | 'loss' | 'draw' }[] | null;
  readonly serverNow?: string;
}

export type ClaimTimeoutResult =
  | {
      readonly kind: 'accepted';
      readonly matchId: string;
      readonly reason: 'timeout' | 'abort';
      readonly outcomes?: { playerIndex: number; outcome: 'win' | 'loss' | 'draw' }[] | null;
      readonly serverNow?: string;
    }
  | {
      readonly kind: 'too_early';
      readonly turnDeadline?: string;
      readonly serverNow?: string;
    }
  | {
      readonly kind: 'match_ended';
    };

export interface RefereeRepository {
  /**
   * Khởi tạo thế cờ ban đầu và quỹ giờ cho ván đấu online qua Trọng tài Server.
   * @param matchId Mã định danh ván đấu (UUID)
   */
  initMatch(matchId: string): Promise<MatchLiveStateDto>;

  /**
   * Gửi nước đi lên Trọng tài Server để thẩm định, tính giờ và áp dụng vào DB.
   * @param matchId Mã ván đấu
   * @param moveSerialized Nước đi dạng chuỗi nén
   * @param expectedMoveIndex Khóa lạc quan & Idempotency
   */
  submitMove(
    matchId: string,
    moveSerialized: string,
    expectedMoveIndex: number,
  ): Promise<SubmitMoveResult>;

  /**
   * Đầu hàng / Xin thua ván đấu online (P3.4c).
   * @param matchId Mã định danh ván đấu
   */
  resign(matchId: string): Promise<ResignResult>;

  /**
   * Đòi xử thắng do đối thủ quá hạn thời gian nước đi (P3.4c).
   * @param matchId Mã định danh ván đấu
   */
  claimTimeout(matchId: string): Promise<ClaimTimeoutResult>;
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
        message: res.error.message || 'Không thể kết nối tới máy chủ Trọng tài.',
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'Phản hồi từ máy chủ không đúng định dạng chuẩn { ok, data/error }.',
    },
  };
}

/**
 * Ánh xạ mã lỗi Trọng tài sang RepoError tiếng Việt chuẩn hóa.
 */
function mapRefereeErrorToRepoError(
  err: { code: string; message: string; [key: string]: unknown },
  fallbackMessage: string,
): RepoError {
  const code = err.code || 'UNKNOWN_ERROR';
  let isFatal = false;
  let vietnameseMsg = err.message || fallbackMessage;

  switch (code) {
    case 'UNAUTHORIZED':
    case 'AUTH_REQUIRED':
      isFatal = true;
      vietnameseMsg = err.message || 'Bạn cần đăng nhập để thực hiện thao tác này.';
      break;

    case 'NOT_PARTICIPANT':
      isFatal = true;
      vietnameseMsg = err.message || 'Bạn không phải là đấu thủ trong ván đấu này.';
      break;

    case 'MATCH_NOT_FOUND':
    case 'ROOM_NOT_FOUND':
      isFatal = true;
      vietnameseMsg = err.message || 'Không tìm thấy ván đấu hoặc phòng đấu đã bị hủy.';
      break;

    case 'WRONG_TURN':
      isFatal = false;
      vietnameseMsg = err.message || 'Chưa đến lượt đi của bạn.';
      break;

    case 'ILLEGAL_MOVE':
      isFatal = false;
      vietnameseMsg = err.message || 'Nước đi không hợp lệ theo luật cờ.';
      break;

    case 'MATCH_ENDED':
      isFatal = true;
      vietnameseMsg = err.message || 'Ván đấu đã kết thúc.';
      break;

    case 'NETWORK_ERROR':
      isFatal = false;
      vietnameseMsg = err.message || 'Lỗi kết nối mạng khi liên lạc với Trọng tài.';
      break;

    default:
      isFatal = false;
      vietnameseMsg = err.message || fallbackMessage;
  }

  return new RepoError(vietnameseMsg, isFatal ? 'FATAL' : 'RETRYABLE', err);
}

export const refereeRepository: RefereeRepository = {
  async initMatch(matchId: string): Promise<MatchLiveStateDto> {
    if (!matchId) {
      throw new RepoError('Mã ván đấu không được để trống.', 'FATAL');
    }

    const rawRes = await supabase.functions.invoke('referee', {
      body: { action: 'init', matchId },
    });

    const parsed = await parseFunctionResponse<MatchLiveStateDto>(rawRes);

    if (!parsed.ok || !parsed.data) {
      throw mapRefereeErrorToRepoError(
        parsed.error || { code: 'INIT_FAILED', message: 'Khởi tạo trận đấu thất bại.' },
        'Không thể khởi tạo ván đấu.',
      );
    }

    return parsed.data;
  },

  async submitMove(
    matchId: string,
    moveSerialized: string,
    expectedMoveIndex: number,
  ): Promise<SubmitMoveResult> {
    const rawRes = await supabase.functions.invoke('referee', {
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
      terminal?: TerminalResult | null;
      duplicate?: boolean;
      clock?: Record<string, number> | null;
      turnDeadline?: string | null;
      serverNow?: string | null;
    }>(rawRes);

    if (!parsed.ok) {
      const err = parsed.error || { code: 'UNKNOWN_ERROR', message: 'Lỗi gửi nước đi.' };

      // 1. Phân loại STALE_CLIENT -> Trả về kết quả 'stale', không throw lỗi
      if (err.code === 'STALE_CLIENT') {
        return {
          kind: 'stale',
          message: err.message,
        };
      }

      // 2. Phân loại TIME_OUT -> Trả về kết quả 'timeout', không throw lỗi
      if (err.code === 'TIME_OUT') {
        return {
          kind: 'timeout',
          message: err.message || 'Đã hết thời gian dành cho nước đi của bạn.',
        };
      }

      // 3. Các lỗi nghiệp vụ khác -> Throw RepoError
      throw mapRefereeErrorToRepoError(err, 'Không thể gửi nước đi.');
    }

    const data = parsed.data;
    if (!data) {
      throw mapRefereeErrorToRepoError(
        { code: 'UNKNOWN_ERROR', message: 'Không nhận được dữ liệu nước đi từ máy chủ.' },
        'Không thể gửi nước đi.',
      );
    }

    // 4. Phân loại duplicate
    if (data.duplicate) {
      return {
        kind: 'duplicate',
        moveIndex: data.moveIndex,
        currentSeat: data.currentSeat,
        stateSerialized: data.stateSerialized,
        clock: data.clock,
        turnDeadline: data.turnDeadline,
        serverNow: data.serverNow,
      };
    }

    // 5. Nước đi hợp lệ accepted
    return {
      kind: 'accepted',
      moveIndex: data.moveIndex,
      currentSeat: data.currentSeat,
      stateSerialized: data.stateSerialized,
      terminal: data.terminal,
      clock: data.clock,
      turnDeadline: data.turnDeadline,
      serverNow: data.serverNow,
    };
  },

  async resign(matchId: string): Promise<ResignResult> {
    const rawRes = await supabase.functions.invoke('referee', {
      body: { action: 'resign', matchId },
    });

    const parsed = await parseFunctionResponse<ResignResult>(rawRes);

    if (!parsed.ok) {
      const err = parsed.error || { code: 'RESIGN_FAILED', message: 'Đầu hàng thất bại.' };
      if (err.code === 'MATCH_ENDED') {
        return {
          matchId,
          reason: 'resign',
          outcomes: null,
        };
      }
      throw mapRefereeErrorToRepoError(err, 'Không thể thực hiện đầu hàng.');
    }

    if (!parsed.data) {
      throw mapRefereeErrorToRepoError(
        { code: 'UNKNOWN_ERROR', message: 'Không nhận được phản hồi đầu hàng từ máy chủ.' },
        'Không thể thực hiện đầu hàng.',
      );
    }

    return parsed.data;
  },

  async claimTimeout(matchId: string): Promise<ClaimTimeoutResult> {
    const rawRes = await supabase.functions.invoke('referee', {
      body: { action: 'claim_timeout', matchId },
    });

    const parsed = await parseFunctionResponse<{
      matchId: string;
      reason: 'timeout' | 'abort';
      outcomes?: { playerIndex: number; outcome: 'win' | 'loss' | 'draw' }[] | null;
      serverNow?: string;
    }>(rawRes);

    if (!parsed.ok) {
      const err = parsed.error || { code: 'CLAIM_FAILED', message: 'Khiếu nại timeout thất bại.' };

      if (err.code === 'TOO_EARLY') {
        return {
          kind: 'too_early',
          turnDeadline: (err.turnDeadline as string) || undefined,
          serverNow: (err.serverNow as string) || undefined,
        };
      }

      if (err.code === 'MATCH_ENDED') {
        return {
          kind: 'match_ended',
        };
      }

      throw mapRefereeErrorToRepoError(err, 'Không thể khiếu nại timeout.');
    }

    const claimData = parsed.data;
    if (!claimData) {
      throw mapRefereeErrorToRepoError(
        { code: 'UNKNOWN_ERROR', message: 'Không nhận được kết quả khiếu nại timeout từ máy chủ.' },
        'Không thể khiếu nại timeout.',
      );
    }

    return {
      kind: 'accepted',
      matchId: claimData.matchId,
      reason: claimData.reason,
      outcomes: claimData.outcomes,
      serverNow: claimData.serverNow,
    };
  },
};
