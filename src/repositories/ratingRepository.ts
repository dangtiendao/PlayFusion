/**
 * ==============================================================================
 * RATING REPOSITORY (TẦNG TRUY VẤN ĐIỂM XẾP HẠNG & THÀNH TÍCH NGƯỜI CHƠI)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. PHẠM VI PHASE P2.5a (CHỈ ĐỌC - READ ONLY):
 *    - Repository này chỉ phụ trách ĐỌC dữ liệu điểm Elo/Glicko và thống kê của kỳ thủ.
 *    - Toàn bộ cơ chế GHI/CẬP NHẬT điểm rating bị cấm từ client và chỉ được thực hiện
 *      bởi Server Edge Function / RPC bảo mật ở Phase P4.2.
 * 2. CỔNG THOÁT HIỂM BACKEND:
 *    - Mọi truy vấn bảng `player_ratings` phải đi qua repository này.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import type { PlayerRating } from './types';

interface DbPlayerRatingRow {
  user_id: string;
  game_id: string;
  season_id: number;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  best_rating: number;
  placement_done: boolean;
  last_played_at: string | null;
}

/**
 * Ánh xạ bản ghi DB bảng `player_ratings` sang kiểu Domain `PlayerRating`.
 */
function mapDbRowToPlayerRating(row: DbPlayerRatingRow): PlayerRating {
  return {
    userId: row.user_id,
    gameId: row.game_id,
    seasonId: row.season_id,
    rating: row.rating,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    streak: row.streak,
    bestRating: row.best_rating,
    placementDone: row.placement_done,
    lastPlayedAt: row.last_played_at,
  };
}

/**
 * Lấy danh sách toàn bộ hồ sơ điểm xếp hạng của người dùng hiện tại qua các game.
 *
 * @param seasonId ID mùa giải cần lọc (tùy chọn).
 * @returns Mảng danh sách rating sắp xếp theo điểm Elo giảm dần.
 */
export async function getMyRatings(seasonId?: number): Promise<PlayerRating[]> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return [];
    }

    let query = supabase
      .from('player_ratings')
      .select(
        'user_id, game_id, season_id, rating, games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at',
      )
      .eq('user_id', user.id);

    if (seasonId !== undefined) {
      query = query.eq('season_id', seasonId);
    }

    const { data, error } = await query.order('rating', { ascending: false });

    if (error) {
      throw new Error(`Không thể tải điểm xếp hạng: ${error.message}`);
    }

    if (!data) {
      return [];
    }

    return (data as DbPlayerRatingRow[]).map(mapDbRowToPlayerRating);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi truy vấn điểm xếp hạng.');
  }
}

/**
 * Lấy thông tin điểm xếp hạng cụ thể của một kỳ thủ trong một trò chơi và mùa giải.
 *
 * @param userId ID người dùng cần tra cứu.
 * @param gameId Mã trò chơi (ví dụ: 'caro').
 * @param seasonId ID mùa giải.
 * @returns Hồ sơ `PlayerRating` hoặc `null` nếu chưa thi đấu ván nào.
 */
export async function getRating(
  userId: string,
  gameId: string,
  seasonId: number,
): Promise<PlayerRating | null> {
  try {
    const { data, error } = await supabase
      .from('player_ratings')
      .select(
        'user_id, game_id, season_id, rating, games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at',
      )
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .eq('season_id', seasonId)
      .maybeSingle();

    if (error) {
      throw new Error(`Không thể tra cứu điểm xếp hạng: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapDbRowToPlayerRating(data as DbPlayerRatingRow);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi tra cứu điểm xếp hạng.');
  }
}
