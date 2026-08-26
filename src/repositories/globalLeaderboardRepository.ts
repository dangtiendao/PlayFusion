/**
 * ==============================================================================
 * GLOBAL LEADERBOARD REPOSITORY (SRC/REPOSITORIES/GLOBALLEADERBOARDREPOSITORY.TS)
 * ==============================================================================
 *
 * TẦNG TRUY VẤN BẢNG XẾP HẠNG TỔNG HỢP TOÀN HỆ THỐNG (PHASE P4.7b)
 *
 * GHI CHÚ KIẾN TRÚC & HIỆU NĂNG:
 * 1. ĐỘ TRỄ DỮ LIỆU MATERIALIZED VIEW:
 *    - Dữ liệu trong 2 Materialized Views (`mv_leaderboard_masters` & `mv_leaderboard_grinders`)
 *      được làm mới định kỳ mỗi 10 phút qua pg_cron.
 *    - Dữ liệu hiển thị có độ trễ tối đa ~10 phút so với thời gian thực (hiển thị thông tin cho người dùng ở P4.7c).
 * 2. ĐƠN GIẢN CÓ CHỦ ĐÍCH (TOP 100 KHÔNG PHÂN TRANG KEYSET):
 *    - Khác với bảng xếp hạng từng game (keyset pagination phân trang sâu), bảng tổng hợp toàn hệ
 *      chốt cố định TOP 100 người dẫn đầu.
 *    - Dữ liệu đã được tiền xử lý và xếp thứ tự sẵn trong Matview $\rightarrow$ Truy vấn cực nhanh.
 * 3. BỘ ĐỆM IN-MEMORY CACHE 60s:
 *    - Lưu kết quả 60 giây để tránh gửi request dư thừa lên Supabase Free Tier khi người dùng chuyển đổi tab.
 * 4. TIE-BREAK NHẤT QUÁN TOÀN HỆ (P4.4):
 *    - Masters: `weighted_rating DESC, user_id ASC`
 *    - Grinders: `earned_coins DESC, user_id ASC`
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import type { MasterEntry, GrinderEntry, MyGlobalRank } from './types';

export const GLOBAL_LEADERBOARD_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const mastersCache = new Map<string, CacheEntry<MasterEntry[]>>();
const grindersCache = new Map<string, CacheEntry<GrinderEntry[]>>();
const myGlobalRankCache = new Map<string, CacheEntry<MyGlobalRank>>();

interface DbMasterRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  weighted_rating: number;
  games_count: number;
  total_games: number;
  best_tier_rating?: number;
}

interface DbGrinderRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  earned_coins: number;
  match_rewards_count: number;
}

/**
 * Xóa bộ đệm in-memory của Bảng Xếp Hạng Toàn Hệ Thống.
 * Thường được gọi sau khi kết toán trận đấu (`match_settled`) để người dùng xem số liệu mới nhất.
 *
 * @param board Chỉ xóa 'masters', 'grinders' hoặc toàn bộ nếu không truyền tham số.
 */
export function invalidateGlobalLeaderboard(board?: 'masters' | 'grinders'): void {
  if (!board) {
    mastersCache.clear();
    grindersCache.clear();
    myGlobalRankCache.clear();
    return;
  }

  if (board === 'masters') {
    mastersCache.clear();
    for (const key of myGlobalRankCache.keys()) {
      if (key.startsWith('masters:')) {
        myGlobalRankCache.delete(key);
      }
    }
  } else if (board === 'grinders') {
    grindersCache.clear();
    for (const key of myGlobalRankCache.keys()) {
      if (key.startsWith('grinders:')) {
        myGlobalRankCache.delete(key);
      }
    }
  }
}

export const globalLeaderboardRepository = {
  /**
   * Lấy danh sách Top Cao Thủ Toàn Hệ Thống (Điểm Elo trung bình có trọng số).
   *
   * @param limit Số lượng bản ghi tối đa (mặc định: 100).
   * @returns Danh sách MasterEntry đã được đánh số thứ tự rank (1..n).
   */
  async getMasters(limit = 100): Promise<MasterEntry[]> {
    const cacheKey = `masters:${limit}`;
    const now = Date.now();
    const cached = mastersCache.get(cacheKey);

    if (cached && now - cached.cachedAt < GLOBAL_LEADERBOARD_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const { data, error } = await supabase
        .from('mv_leaderboard_masters')
        .select(
          'user_id, display_name, avatar_url, weighted_rating, games_count, total_games, best_tier_rating',
        )
        .order('weighted_rating', { ascending: false })
        .order('user_id', { ascending: true })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      const entries: MasterEntry[] = (data as unknown as DbMasterRow[]).map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        displayName: row.display_name || 'Kỳ thủ ẩn danh',
        avatarUrl: row.avatar_url,
        weightedRating: Number(row.weighted_rating),
        gamesCount: Number(row.games_count),
        totalGames: Number(row.total_games),
        bestTierRating:
          row.best_tier_rating !== undefined ? Number(row.best_tier_rating) : undefined,
      }));

      mastersCache.set(cacheKey, { data: entries, cachedAt: now });
      return entries;
    } catch {
      return [];
    }
  },

  /**
   * Lấy danh sách Top Chăm Chỉ Toàn Hệ Thống (Tổng xu kiếm được từ thi đấu trong mùa).
   *
   * @param limit Số lượng bản ghi tối đa (mặc định: 100).
   * @returns Danh sách GrinderEntry đã được đánh số thứ tự rank (1..n).
   */
  async getGrinders(limit = 100): Promise<GrinderEntry[]> {
    const cacheKey = `grinders:${limit}`;
    const now = Date.now();
    const cached = grindersCache.get(cacheKey);

    if (cached && now - cached.cachedAt < GLOBAL_LEADERBOARD_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const { data, error } = await supabase
        .from('mv_leaderboard_grinders')
        .select('user_id, display_name, avatar_url, earned_coins, match_rewards_count')
        .order('earned_coins', { ascending: false })
        .order('user_id', { ascending: true })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      const entries: GrinderEntry[] = (data as unknown as DbGrinderRow[]).map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        displayName: row.display_name || 'Người chơi ẩn danh',
        avatarUrl: row.avatar_url,
        earnedCoins: Number(row.earned_coins),
        totalMatches: Number(row.match_rewards_count),
      }));

      grindersCache.set(cacheKey, { data: entries, cachedAt: now });
      return entries;
    } catch {
      return [];
    }
  },

  /**
   * Lấy thứ hạng cá nhân chính xác của người dùng hiện tại trên Bảng Xếp Hạng Toàn Hệ Thống.
   *
   * @param board 'masters' hoặc 'grinders'
   * @returns MyGlobalRank { rank, value } hoặc { rank: null, value: null } nếu chưa đủ điều kiện lên bảng.
   */
  async getMyGlobalRank(board: 'masters' | 'grinders'): Promise<MyGlobalRank> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        return { rank: null, value: null };
      }

      const userId = session.user.id;
      const cacheKey = `${board}:${userId}`;
      const now = Date.now();
      const cached = myGlobalRankCache.get(cacheKey);

      if (cached && now - cached.cachedAt < GLOBAL_LEADERBOARD_CACHE_TTL_MS) {
        return cached.data;
      }

      if (board === 'masters') {
        // 1. Đọc dòng của chính người dùng
        const { data: myRow, error: rowError } = await supabase
          .from('mv_leaderboard_masters')
          .select('weighted_rating')
          .eq('user_id', userId)
          .maybeSingle();

        if (rowError || !myRow) {
          const result: MyGlobalRank = { rank: null, value: null };
          myGlobalRankCache.set(cacheKey, { data: result, cachedAt: now });
          return result;
        }

        const myRating = Number(myRow.weighted_rating);

        // 2. Đếm số người đứng trước theo chuẩn Tie-Break P4.4 (Score > MyScore HOẶC Score = MyScore AND user_id < MyUserId)
        const { count, error: countError } = await supabase
          .from('mv_leaderboard_masters')
          .select('*', { count: 'exact', head: true })
          .or(
            `weighted_rating.gt.${myRating},and(weighted_rating.eq.${myRating},user_id.lt.${userId})`,
          );

        if (countError || count === null) {
          const result: MyGlobalRank = { rank: null, value: myRating };
          return result;
        }

        const result: MyGlobalRank = {
          rank: count + 1,
          value: myRating,
        };

        myGlobalRankCache.set(cacheKey, { data: result, cachedAt: now });
        return result;
      } else {
        // 1. Đọc dòng của chính người dùng trên Bảng Chăm Chỉ
        const { data: myRow, error: rowError } = await supabase
          .from('mv_leaderboard_grinders')
          .select('earned_coins')
          .eq('user_id', userId)
          .maybeSingle();

        if (rowError || !myRow) {
          const result: MyGlobalRank = { rank: null, value: null };
          myGlobalRankCache.set(cacheKey, { data: result, cachedAt: now });
          return result;
        }

        const myCoins = Number(myRow.earned_coins);

        // 2. Đếm số người đứng trước theo chuẩn Tie-Break P4.4 (Coins > MyCoins HOẶC Coins = MyCoins AND user_id < MyUserId)
        const { count, error: countError } = await supabase
          .from('mv_leaderboard_grinders')
          .select('*', { count: 'exact', head: true })
          .or(`earned_coins.gt.${myCoins},and(earned_coins.eq.${myCoins},user_id.lt.${userId})`);

        if (countError || count === null) {
          const result: MyGlobalRank = { rank: null, value: myCoins };
          return result;
        }

        const result: MyGlobalRank = {
          rank: count + 1,
          value: myCoins,
        };

        myGlobalRankCache.set(cacheKey, { data: result, cachedAt: now });
        return result;
      }
    } catch {
      return { rank: null, value: null };
    }
  },
};
