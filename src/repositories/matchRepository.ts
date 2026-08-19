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
import type { MatchSummary, MatchParticipantSummary } from './types';

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
