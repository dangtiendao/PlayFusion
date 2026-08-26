/**
 * ==============================================================================
 * HOOK TỔNG HỢP TRẠNG THÁI RANK CHO TẤT CẢ GAME RANKED (USEMYRANKVIEWS.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. ĐỘC LẬP GENERIC:
 *    - Duyệt danh sách trò chơi từ Registry (`getAllGames()`).
 *    - Tự động lọc các game có `definition.ranked === true`.
 * 2. TỔNG HỢP TOÀN BỘ RANKVIEW:
 *    - Gọi `getMyRatings()` song song với `getMyLastRankedMatchDelta(gameId)` cho từng game.
 *    - Tiêm hằng số `PLACEMENT_GAMES_DEFAULT = 15` từ `@rating`.
 *    - Gọi hàm thuần `resolveRankView` để suy diễn trạng thái (bao gồm cả Khiên bảo vệ rớt hạng).
 * 3. REACTIVE VISIBILITY REFRESH:
 *    - Lắng nghe sự kiện `visibilitychange` (khi người dùng quay lại tab trình duyệt)
 *      để tự động làm mới số liệu mà không cần polling liên tục.
 * ==============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getAllGames } from '@/games/registry';
import { getMyRatings, getMyLastRankedMatchDelta } from '@/repositories/ratingRepository';
import {
  resolveRankView,
  PLACEMENT_GAMES_DEFAULT,
  type RankView,
  type RankViewInput,
} from '@rating';

export interface UseMyRankViewsResult {
  /**
   * Bản đồ ánh xạ từ `gameId` sang trạng thái `RankView` tương ứng (`null` nếu chưa đấu).
   */
  readonly rankViews: Record<string, RankView | null>;

  /**
   * Trạng thái đang tải dữ liệu từ Cloud.
   */
  readonly isLoading: boolean;

  /**
   * Thông báo lỗi nếu có sự cố mạng.
   */
  readonly error: string | null;

  /**
   * Hàm gọi làm mới dữ liệu thủ công.
   */
  readonly refresh: () => Promise<void>;
}

export function useMyRankViews(): UseMyRankViewsResult {
  const user = useAuthStore((state) => state.user);
  const [rankViews, setRankViews] = useState<Record<string, RankView | null>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRankViews = useCallback(async () => {
    if (!user) {
      setRankViews({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const allGames = getAllGames();
      const rankedGames = allGames.filter((g) => g.definition.ranked);

      if (rankedGames.length === 0) {
        setRankViews({});
        setIsLoading(false);
        return;
      }

      // 1. Tải danh sách điểm rating của user trên mọi game
      const ratings = await getMyRatings();
      const ratingMap = new Map(ratings.map((r) => [r.gameId, r]));

      // 2. Tải song song delta trận gần nhất cho các game ranked
      const results: Record<string, RankView | null> = {};

      await Promise.all(
        rankedGames.map(async (game) => {
          const gameId = game.definition.id;
          const playerRating = ratingMap.get(gameId);

          if (!playerRating) {
            results[gameId] = null;
            return;
          }

          // Lấy delta trận gần nhất để phục vụ suy diễn Khiên bảo vệ rớt hạng
          const lastMatch = await getMyLastRankedMatchDelta(gameId);

          const input: RankViewInput = {
            rating: playerRating.rating,
            gamesPlayed: playerRating.gamesPlayed,
            placementGames: PLACEMENT_GAMES_DEFAULT,
            lastMatch,
          };

          results[gameId] = resolveRankView(input);
        }),
      );

      setRankViews(results);
    } catch {
      setError('Không thể tải thông tin xếp hạng.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Tải dữ liệu khi component mount hoặc khi user thay đổi
  useEffect(() => {
    fetchRankViews();
  }, [fetchRankViews]);

  // Tự động làm mới khi tab trình duyệt trở lại hoạt động (App visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRankViews();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchRankViews]);

  return {
    rankViews,
    isLoading,
    error,
    refresh: fetchRankViews,
  };
}
