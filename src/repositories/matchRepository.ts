/**
 * ==============================================================================
 * MATCH REPOSITORY (TẦNG TRUY VẤN LỊCH SỬ & CHI TIẾT TRẬN ĐẤU)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. PHẠM VI PHASE P2.5a (CHỈ ĐỌC - READ ONLY):
 *    - Repository này hiện tại CHỈ cung cấp các hàm ĐỌC (Lịch sử trận đấu cá nhân,
 *      chi tiết ván đấu).
 *    - Toàn bộ cơ chế GHI kết quả trận đấu (RPC / Edge Function bảo mật) sẽ được
 *      triển khai tại Phase P2.5b.
 * 2. TỐI ƯU HÓA TRUY VẤN (INDEX & NESTED POSTGREST SELECT):
 *    - Hàm `getMyRecentMatches` tận dụng Index kết hợp `(user_id, match_id)` trên
 *      bảng `match_participants` để lọc ván đấu của người dùng hiện tại, đồng thời
 *      dùng cú pháp Nested Select của PostgREST để lấy trọn vẹn thông tin đối thủ
 *      và tên hiển thị (từ bảng `profiles`) chỉ trong 1 round-trip mạng duy nhất.
 * 3. CHUẨN BỊ CHO REPLAY (PHASE P8.1):
 *    - `getMatchById` đọc tóm tắt ván đấu. Cột `moves` và `final_state` sẽ được mở rộng
 *      phục vụ Replay Engine ở Phase P8.1.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import {
  type MatchSummary,
  type MatchParticipantSummary,
  type RecordOfflineMatchParams,
  RepoError,
} from './types';

export { RepoError };

interface DbParticipantWithProfileRow {
  seat_index: number;
  user_id: string | null;
  is_bot: boolean;
  bot_level: string | null;
  outcome: 'win' | 'loss' | 'draw' | null;
  placement: number | null;
  score: number | null;
  rating_delta: number | null;
  profile?: {
    display_name: string;
  } | null;
}

interface DbMatchRow {
  id: string;
  game_id: string;
  game_mode: string;
  is_ranked: boolean;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  end_reason: string | null;
  participants?: DbParticipantWithProfileRow[];
  all_participants?: DbParticipantWithProfileRow[];
}

interface DbParticipantJoinRow {
  match_id: string;
  created_at: string;
  match: DbMatchRow | null;
}

/**
 * Ánh xạ đối tượng đấu thủ DB sang `MatchParticipantSummary`.
 */
function mapParticipant(p: DbParticipantWithProfileRow): MatchParticipantSummary {
  return {
    seatIndex: p.seat_index,
    userId: p.user_id,
    isBot: p.is_bot,
    botLevel: p.bot_level,
    result: p.outcome,
    placement: p.placement,
    score: p.score,
    ratingDelta: p.rating_delta,
    displayName: p.profile?.display_name,
  };
}

/**
 * Ánh xạ bản ghi DB bảng `matches` sang kiểu Domain `MatchSummary`.
 */
function mapDbRowToMatchSummary(row: DbMatchRow): MatchSummary {
  const rawParticipants = row.participants || row.all_participants || [];
  const sortedParticipants = [...rawParticipants].sort((a, b) => a.seat_index - b.seat_index);

  return {
    id: row.id,
    gameId: row.game_id,
    mode: row.game_mode,
    isRanked: row.is_ranked,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    endReason: row.end_reason,
    participants: sortedParticipants.map(mapParticipant),
  };
}

/**
 * Lấy danh sách các ván đấu gần đây của người dùng hiện tại.
 *
 * @param gameId Mã trò chơi cần lọc (tùy chọn, ví dụ: 'caro').
 * @param limit Số lượng ván đấu tối đa cần lấy (mặc định: 20).
 * @returns Mảng danh sách các ván đấu gần nhất sắp xếp theo thời gian mới nhất trước.
 */
export async function getMyRecentMatches(gameId?: string, limit = 20): Promise<MatchSummary[]> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return [];
    }

    let query = supabase
      .from('match_participants')
      .select(
        `
        match_id,
        created_at,
        match:matches!inner (
          id,
          game_id,
          game_mode,
          is_ranked,
          status,
          started_at,
          ended_at,
          duration_ms,
          end_reason,
          all_participants:match_participants (
            seat_index,
            user_id,
            is_bot,
            bot_level,
            outcome,
            placement,
            score,
            rating_delta,
            profile:profiles (
              display_name
            )
          )
        )
      `,
      )
      .eq('user_id', user.id);

    if (gameId) {
      query = query.eq('match.game_id', gameId);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

    if (error) {
      throw new Error(`Không thể tải lịch sử đấu: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    const rows = data as unknown as DbParticipantJoinRow[];
    const summaries: MatchSummary[] = [];

    for (const item of rows) {
      if (item.match) {
        summaries.push(mapDbRowToMatchSummary(item.match));
      }
    }

    return summaries;
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi truy vấn lịch sử ván đấu.');
  }
}

/**
 * Lấy thông tin chi tiết một ván đấu theo ID.
 *
 * @param id Định danh duy nhất (UUID) của ván đấu.
 * @returns Thông tin tóm tắt ván đấu hoặc `null` nếu không tìm thấy.
 */
export async function getMatchById(id: string): Promise<MatchSummary | null> {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select(
        `
        id,
        game_id,
        game_mode,
        is_ranked,
        status,
        started_at,
        ended_at,
        duration_ms,
        end_reason,
        participants:match_participants (
          seat_index,
          user_id,
          is_bot,
          bot_level,
          outcome,
          placement,
          score,
          rating_delta,
          profile:profiles (
            display_name
          )
        )
      `,
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Không thể tải chi tiết ván đấu: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapDbRowToMatchSummary(data as unknown as DbMatchRow);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi truy vấn chi tiết ván đấu.');
  }
}

/**
 * Ghi nhận kết quả một ván đấu offline lên cơ sở dữ liệu qua RPC `record_offline_match`.
 *
 * GHI CHÚ BẢO MẬT & IDEMPOTENCY:
 * 1. Client sinh `matchId` (UUID) ngay khi ván đấu bắt đầu. Khi ván kết thúc, gọi hàm này để lưu trữ.
 * 2. Hàm có tính Idempotent: Nếu gọi lại nhiều lần với cùng `matchId` (ví dụ do Outbox retry),
 *    DB sẽ trả về ID mà không tạo bản ghi trùng lặp.
 * 3. Phân loại lỗi:
 *    - Lỗi nghiệp vụ / validate từ DB (mã 22023, 42501, v.v.) -> ném `RepoError('FATAL')` (không retry).
 *    - Lỗi mạng / timeout / mất kết nối -> ném `RepoError('RETRYABLE')` (sẽ được Outbox P2.5c retry).
 *
 * @param params Tham số ván đấu offline cần ghi nhận.
 * @returns ID của ván đấu đã được ghi nhận thành công.
 */
export async function recordOfflineMatch(params: RecordOfflineMatchParams): Promise<string> {
  const startedAtIso =
    params.startedAt instanceof Date
      ? params.startedAt.toISOString()
      : new Date(params.startedAt).toISOString();

  const payload = {
    match_id: params.matchId,
    game_id: params.gameId,
    mode: params.mode,
    started_at: startedAtIso,
    duration_ms: Math.max(1, Math.round(params.durationMs)),
    end_reason: params.endReason ?? null,
    engine_options: params.engineOptions ?? null,
    final_state: params.finalState ?? null,
    moves: params.moves ?? null,
    participants: params.participants.map((p) => ({
      seat_index: p.seatIndex,
      is_bot: p.isBot,
      bot_level: p.botLevel ?? null,
      result: p.result ?? null,
      placement: p.placement ?? null,
      score: p.score ?? null,
    })),
  };

  try {
    const { data, error } = await supabase.rpc('record_offline_match', { p_match: payload });

    if (error) {
      const msg = error.message.toLowerCase();
      const code = (error as { code?: string }).code;

      // Lỗi validate hoặc phân quyền từ PostgreSQL / PostgREST -> FATAL
      if (
        code === '22023' ||
        code === '42501' ||
        code === 'P0001' ||
        msg.includes('validation error') ||
        msg.includes('unauthorized') ||
        msg.includes('check constraint') ||
        msg.includes('invalid')
      ) {
        throw new RepoError(`Lỗi xác thực dữ liệu trận đấu: ${error.message}`, 'FATAL', error);
      }

      // Các lỗi khác (network, timeout, 5xx...) -> RETRYABLE
      throw new RepoError(`Lỗi kết nối khi lưu ván đấu: ${error.message}`, 'RETRYABLE', error);
    }

    if (!data) {
      throw new RepoError('Máy chủ không phản hồi mã trận đấu sau khi lưu.', 'RETRYABLE');
    }

    return data as string;
  } catch (err: unknown) {
    if (err instanceof RepoError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Lỗi không xác định khi lưu ván đấu.';
    throw new RepoError(`Lỗi mạng khi gửi kết quả ván đấu: ${message}`, 'RETRYABLE', err);
  }
}

/**
 * Trạng thái bàn cờ trực tiếp của ván đấu online từ bảng `match_live_state` (P3.3c).
 */
export interface MatchLiveStateSummary {
  readonly stateSerialized: string;
  readonly moveIndex: number;
  readonly currentSeat: number;
  readonly movesSerialized: string;
}

/**
 * Đọc trạng thái ván đấu online thời gian thực từ bảng `public.match_live_state` (P3.3c).
 *
 * GHI CHÚ BẢO MẬT:
 * - Policy RLS "Participants can read their match live state" (P3.2b) chỉ cho phép
 *   người chơi tham gia trong bảng match_participants đọc live state của ván đấu đó.
 *
 * @param matchId Định danh ván đấu (UUID).
 * @returns Trạng thái bàn cờ hiện tại hoặc `null` nếu ván đã kết thúc hoặc không tìm thấy.
 */
export async function getLiveState(matchId: string): Promise<MatchLiveStateSummary | null> {
  try {
    const { data, error } = await supabase
      .from('match_live_state')
      .select('state_serialized, move_index, current_seat, moves_serialized')
      .eq('match_id', matchId)
      .maybeSingle();

    if (error) {
      throw new RepoError(
        `Không thể nạp trạng thái trực tiếp của ván đấu: ${error.message}`,
        'FATAL',
        error,
      );
    }

    if (!data) return null;

    return {
      stateSerialized: data.state_serialized,
      moveIndex: data.move_index,
      currentSeat: data.current_seat,
      movesSerialized: data.moves_serialized,
    };
  } catch (err: unknown) {
    if (err instanceof RepoError) throw err;
    const message = err instanceof Error ? err.message : 'Lỗi kết nối';
    throw new RepoError(`Lỗi khi nạp trạng thái trực tiếp: ${message}`, 'RETRYABLE', err);
  }
}

export const matchRepository = {
  getMyRecentMatches,
  getMatchById,
  recordOfflineMatch,
  getLiveState,
};
