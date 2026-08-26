/**
 * ==============================================================================
 * LEADERBOARD REPOSITORY (TẦNG TRUY VẤN BẢNG XẾP HẠNG & HẠNG CÁ NHÂN)
 * ==============================================================================
 *
 * QUY TẮC TIE-BREAK CHỐT CỨNG (HIẾN PHÁP THỨ TỰ BẢNG XẾP HẠNG):
 * - Thứ tự sắp xếp tuyệt đối: `ORDER BY rating DESC, user_id ASC`
 * - LÝ DO CHỌN user_id LÀM TIE-BREAK:
 *   1. `user_id` (UUID) là định danh bất biến (immutable) và duy nhất (unique 100%).
 *   2. TUYỆT ĐỐI KHÔNG dùng `games_played` hay `best_rating` làm tie-break:
 *      Vì các trường này thay đổi liên tục theo thời gian khi người chơi đánh ván mới,
 *      dẫn đến việc làm trôi con trỏ (cursor drift) và khiến phân trang keyset bị nhảy cóc hoặc trùng lặp.
 *   3. Tính xác định tuyệt đối (Deterministic): Hai người chơi mở bảng xếp hạng tại cùng
 *      một thời điểm luôn nhìn thấy cùng một thứ tự bảng xếp hạng.
 *
 * TỐI ƯU HÓA FREE TIER & HIỆU NĂNG:
 * 1. PHÂN TRANG KEYSET (KEYSET PAGINATION):
 *    - Không dùng OFFSET để tránh quét toàn bộ B-Tree khi tải các trang sâu.
 *    - Sử dụng con trỏ kép `LeaderboardCursor` gồm `{ rating, userId }`.
 * 2. KHỚP PARTIAL INDEX P2.2c:
 *    - Mọi query đều lọc `games_played >= 10` để kích hoạt partial index `idx_player_ratings_top_leaderboard`.
 * 3. BỘ ĐỆM IN-MEMORY CACHE 60s:
 *    - Giảm thiểu tối đa lượt truy vấn DB từ client, người dùng không phân biệt được độ trễ 1 phút.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import {
  type LeaderboardCursor,
  type LeaderboardEntry,
  type LeaderboardPage,
  type MyLeaderboardRank,
  RepoError,
} from './types';

export { RepoError };

interface DbLeaderboardRow {
  user_id: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  best_rating: number;
  profiles:
    | {
        display_name: string;
        avatar_url: string | null;
      }
    | {
        display_name: string;
        avatar_url: string | null;
      }[]
    | null;
}

/**
 * Số trận tối thiểu cần hoàn thành để xuất hiện trên bảng xếp hạng (Đồng bộ với MIN_MATCHES_FOR_WINRATE P2.6a).
 * Khớp hoàn hảo với Partial Index `idx_player_ratings_top_leaderboard` (Phase P2.2c).
 */
export const MIN_MATCHES_FOR_LEADERBOARD = 10;

/**
 * Thời gian tồn tại của Cache In-Memory cho bảng xếp hạng (60 giây).
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Quyết định đã chốt: Người dùng không phân biệt được độ trễ 1 phút của bảng xếp hạng.
 * - Giúp tiết kiệm tối đa hạn mức request trên Supabase Free Tier khi nhiều người cùng mở bảng xếp hạng.
 */
export const LEADERBOARD_CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const pageCache = new Map<string, CacheEntry<LeaderboardPage>>();
const myRankCache = new Map<string, CacheEntry<MyLeaderboardRank | null>>();

/**
 * Xóa bộ đệm In-Memory của bảng xếp hạng.
 *
 * @param gameId Mã game cần xóa cache (tùy chọn). Nếu không truyền, xóa sạch toàn bộ cache.
 */
export function invalidateLeaderboardCache(gameId?: string): void {
  if (gameId) {
    for (const key of pageCache.keys()) {
      if (key.startsWith(`page:${gameId}:`)) {
        pageCache.delete(key);
      }
    }
    for (const key of myRankCache.keys()) {
      if (key.includes(`:${gameId}:`)) {
        myRankCache.delete(key);
      }
    }
  } else {
    pageCache.clear();
    myRankCache.clear();
  }
}

/**
 * Lấy một trang danh sách bảng xếp hạng theo trò chơi và mùa giải.
 *
 * @param gameId Mã định danh trò chơi (ví dụ: 'caro').
 * @param seasonId ID mùa giải thi đấu.
 * @param cursor Con trỏ kép của trang trước (tùy chọn). Nếu null/undefined, tải trang đầu tiên.
 * @param pageSize Số lượng bản ghi trên một trang (mặc định 50).
 * @param startRank Thứ hạng bắt đầu đánh số cho trang này (mặc định 1).
 * @returns LeaderboardPage chứa danh sách entries và nextCursor.
 */
export async function getLeaderboardPage(
  gameId: string,
  seasonId: number,
  cursor?: LeaderboardCursor | null,
  pageSize = 50,
  startRank = 1,
): Promise<LeaderboardPage> {
  const cursorKey = cursor ? `${cursor.rating}_${cursor.userId}` : 'first';
  const cacheKey = `page:${gameId}:${seasonId}:${cursorKey}:${pageSize}:${startRank}`;

  const now = Date.now();
  const cached = pageCache.get(cacheKey);
  if (cached && now - cached.cachedAt < LEADERBOARD_CACHE_TTL_MS) {
    return cached.data;
  }

  let query = supabase
    .from('player_ratings')
    .select(
      `
      user_id,
      rating,
      games_played,
      wins,
      losses,
      best_rating,
      profiles (
        display_name,
        avatar_url
      )
    `,
    )
    .eq('game_id', gameId)
    .eq('season_id', seasonId)
    .gte('games_played', MIN_MATCHES_FOR_LEADERBOARD);

  if (cursor) {
    // PostgREST Keyset condition: (rating < cursor.rating) OR (rating = cursor.rating AND user_id > cursor.userId)
    query = query.or(
      `rating.lt.${cursor.rating},and(rating.eq.${cursor.rating},user_id.gt.${cursor.userId})`,
    );
  }

  const { data, error } = await query
    .order('rating', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(pageSize + 1);
  if (error) {
    throw new RepoError(
      `Không thể tải bảng xếp hạng game "${gameId}": ${error.message}`,
      'FATAL',
      error,
    );
  }

  const rows = (data || []) as unknown as DbLeaderboardRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

  const entries: LeaderboardEntry[] = pageRows.map((row, index) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      rank: startRank + index,
      userId: row.user_id,
      displayName: profile?.display_name || 'Kỳ thủ ẩn danh',
      avatarUrl: profile?.avatar_url || null,
      rating: Number(row.rating),
      gamesPlayed: Number(row.games_played),
      wins: Number(row.wins),
      losses: Number(row.losses),
      bestRating: Number(row.best_rating),
    };
  });

  let nextCursor: LeaderboardCursor | null = null;
  if (hasMore && pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1];
    if (lastRow) {
      nextCursor = {
        rating: Number(lastRow.rating),
        userId: lastRow.user_id,
      };
    }
  }

  const result: LeaderboardPage = {
    entries,
    nextCursor,
  };

  pageCache.set(cacheKey, { data: result, cachedAt: now });
  return result;
}

/**
 * Lấy thứ hạng cá nhân của người dùng hiện tại trong một game và mùa giải cụ thể.
 *
 * @param gameId Mã định danh trò chơi (ví dụ: 'caro').
 * @param seasonId ID mùa giải thi đấu.
 * @returns MyLeaderboardRank hoặc null nếu người dùng chưa đăng nhập hoặc chưa từng chơi game này.
 */
export async function getMyRank(
  gameId: string,
  seasonId: number,
): Promise<MyLeaderboardRank | null> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) {
    return null;
  }

  const cacheKey = `myRank:${userId}:${gameId}:${seasonId}`;
  const now = Date.now();
  const cached = myRankCache.get(cacheKey);
  if (cached && now - cached.cachedAt < LEADERBOARD_CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Đọc dòng rating cá nhân
  const { data: myRatingRow, error: myRatingError } = await supabase
    .from('player_ratings')
    .select('rating, games_played')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('season_id', seasonId)
    .maybeSingle();

  if (myRatingError) {
    throw new RepoError(
      `Không thể đọc điểm xếp hạng cá nhân: ${myRatingError.message}`,
      'FATAL',
      myRatingError,
    );
  }

  if (!myRatingRow) {
    // Chưa từng tham gia trận ranked nào trong game/mùa này
    return null;
  }

  const gamesPlayed = Number(myRatingRow.games_played);
  const rating = Number(myRatingRow.rating);

  // 2. Kiểm tra điều kiện lên bảng xếp hạng
  if (gamesPlayed < MIN_MATCHES_FOR_LEADERBOARD) {
    const result: MyLeaderboardRank = {
      rank: null,
      rating,
      gamesPlayed,
      eligible: false,
    };
    myRankCache.set(cacheKey, { data: result, cachedAt: now });
    return result;
  }

  // 3. Đủ điều kiện -> Đếm số lượng người xếp TRÊN mình theo đúng quy tắc tie-break
  // Điều kiện xếp trên: rating > myRating HOẶC (rating = myRating AND user_id < myUserId)
  const { count, error: countError } = await supabase
    .from('player_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('season_id', seasonId)
    .gte('games_played', MIN_MATCHES_FOR_LEADERBOARD)
    .or(`rating.gt.${rating},and(rating.eq.${rating},user_id.lt.${userId})`);

  if (countError) {
    throw new RepoError(
      `Không thể tính thứ hạng cá nhân: ${countError.message}`,
      'FATAL',
      countError,
    );
  }

  const rank = (count ?? 0) + 1;
  const result: MyLeaderboardRank = {
    rank,
    rating,
    gamesPlayed,
    eligible: true,
  };

  myRankCache.set(cacheKey, { data: result, cachedAt: now });
  return result;
}
