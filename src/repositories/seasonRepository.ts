/**
 * ==============================================================================
 * SEASON REPOSITORY (SRC/REPOSITORIES/SEASONREPOSITORY.TS)
 * ==============================================================================
 *
 * TẦNG TRUY VẤN DỮ LIỆU MÙA GIẢI & HUY HIỆU (PHASE P4.6d)
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. CỔNG THOÁT HIỂM BACKEND (BACKEND ESCAPE HATCH):
 *    - Mọi truy vấn bảng `user_season_badges` và `rating_decay_log` phải đi qua repository này.
 * 2. KIỂU DỮ LIỆU DOMAIN SẠCH (CLEAN DOMAIN TYPES):
 *    - Toàn bộ kết quả trả về sử dụng domain types trong `types.ts` theo chuẩn camelCase.
 * 3. AN TOÀN OFFLINE & CHƯA ĐĂNG NHẬP:
 *    - Trả về mảng rỗng hoặc null một cách an toàn khi người dùng chưa đăng nhập hoặc lỗi mạng.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import type { SeasonBadge, RecentDecayLog } from './types';

interface DbSeasonBadgeRow {
  id: string;
  season_id: number;
  game_id: string;
  final_rating: number;
  final_tier: string;
  final_rank: number | null;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  seasons?: {
    name: string;
  } | null;
}

interface DbRatingDecayLogRow {
  points: number;
  week_key: string;
  rating_before: number;
  rating_after: number;
  created_at: string;
}

export const seasonRepository = {
  /**
   * Lấy danh sách toàn bộ huy hiệu mùa giải của người dùng hiện tại.
   *
   * @returns Danh sách SeasonBadge sắp xếp theo mùa mới nhất trước (seasonId DESC).
   */
  async getMySeasonBadges(): Promise<SeasonBadge[]> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        return [];
      }

      const { data, error } = await supabase
        .from('user_season_badges')
        .select(
          `
          id,
          season_id,
          game_id,
          final_rating,
          final_tier,
          final_rank,
          games_played,
          wins,
          losses,
          draws,
          created_at,
          seasons (
            name
          )
        `,
        )
        .eq('user_id', session.user.id)
        .order('season_id', { ascending: false })
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return (data as unknown as DbSeasonBadgeRow[]).map((row) => ({
        id: row.id,
        seasonId: row.season_id,
        seasonName: row.seasons?.name || `Mùa ${row.season_id}`,
        gameId: row.game_id,
        finalRating: Number(row.final_rating),
        finalTier: row.final_tier,
        finalRank: row.final_rank !== null ? Number(row.final_rank) : null,
        gamesPlayed: Number(row.games_played),
        wins: Number(row.wins),
        losses: Number(row.losses),
        draws: Number(row.draws),
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Lấy bản ghi trừ điểm bỏ đấu (Rating Decay) gần đây nhất của người dùng cho một trò chơi.
   *
   * @param gameId Mã game (tùy chọn)
   * @returns RecentDecayLog hoặc null nếu không có bản ghi nào.
   */
  async getMyRecentDecay(gameId?: string): Promise<RecentDecayLog | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        return null;
      }

      let query = supabase
        .from('rating_decay_log')
        .select('points, week_key, rating_before, rating_after, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (gameId) {
        query = query.eq('game_id', gameId);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        return null;
      }

      const row = data[0] as unknown as DbRatingDecayLogRow;
      return {
        points: Number(row.points),
        weekKey: row.week_key,
        ratingBefore: Number(row.rating_before),
        ratingAfter: Number(row.rating_after),
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  },
};
