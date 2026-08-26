// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabase } from './supabaseClient';
import {
  getLeaderboardPage,
  getMyRank,
  invalidateLeaderboardCache,
  LEADERBOARD_CACHE_TTL_MS,
  MIN_MATCHES_FOR_LEADERBOARD,
  RepoError,
} from './leaderboardRepository';

describe('Leaderboard Repository Unit Tests (leaderboardRepository.ts - P4.4a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateLeaderboardCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getLeaderboardPage', () => {
    it('1. Ánh xạ DbLeaderboardRow sang LeaderboardEntry chính xác (avatar null, rating, gamesPlayed, rank 1..n)', async () => {
      const mockRows = [
        {
          user_id: 'user-1-uuid',
          rating: 1500,
          games_played: 25,
          wins: 18,
          losses: 5,
          best_rating: 1520,
          profiles: {
            display_name: 'Đại Cao Thủ',
            avatar_url: 'https://example.com/avatar1.png',
          },
        },
        {
          user_id: 'user-2-uuid',
          rating: 1420,
          games_played: 12,
          wins: 8,
          losses: 4,
          best_rating: 1420,
          profiles: {
            display_name: 'Kỳ Vương',
            avatar_url: null,
          },
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        or: vi.fn().mockReturnThis(),
      };

      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const result = await getLeaderboardPage('caro', 1, null, 50, 1);

      expect(result.entries).toHaveLength(2);
      expect(result.nextCursor).toBeNull(); // < 50 items nên hết trang

      // Entry 1:
      expect(result.entries[0]).toEqual({
        rank: 1,
        userId: 'user-1-uuid',
        displayName: 'Đại Cao Thủ',
        avatarUrl: 'https://example.com/avatar1.png',
        rating: 1500,
        gamesPlayed: 25,
        wins: 18,
        losses: 5,
        bestRating: 1520,
      });

      // Entry 2 (avatar null):
      expect(result.entries[1]).toEqual({
        rank: 2,
        userId: 'user-2-uuid',
        displayName: 'Kỳ Vương',
        avatarUrl: null,
        rating: 1420,
        gamesPlayed: 12,
        wins: 8,
        losses: 4,
        bestRating: 1420,
      });

      // Khớp điều kiện query
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('game_id', 'caro');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('season_id', 1);
      expect(mockQueryBuilder.gte).toHaveBeenCalledWith(
        'games_played',
        MIN_MATCHES_FOR_LEADERBOARD,
      );
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('rating', { ascending: false });
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('user_id', { ascending: true });
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(51); // pageSize + 1
    });

    it('2. Keyset pagination & LIMIT+1: Có 51 rows -> Cắt còn 50 entries và trích xuất nextCursor từ entry thứ 50', async () => {
      // Giả lập trả về 51 rows cho pageSize = 50
      const mock51Rows = Array.from({ length: 51 }, (_, i) => ({
        user_id: `user-${i + 1}`,
        rating: 1500 - i * 5,
        games_played: 20,
        wins: 12,
        losses: 8,
        best_rating: 1500,
        profiles: {
          display_name: `Kỳ thủ ${i + 1}`,
          avatar_url: null,
        },
      }));

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mock51Rows, error: null }),
        or: vi.fn().mockReturnThis(),
      };

      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const result = await getLeaderboardPage('caro', 1, null, 50, 1);

      // Cắt bỏ row thứ 51 thừa
      expect(result.entries).toHaveLength(50);
      expect(result.entries[0]?.rank).toBe(1);
      expect(result.entries[49]?.rank).toBe(50);

      // nextCursor là entry thứ 50 (rating = 1500 - 49*5 = 1255, userId = 'user-50')
      expect(result.nextCursor).toEqual({
        rating: 1255,
        userId: 'user-50',
      });
    });

    it('3. Keyset đồng điểm (Tie-break): 3 người cùng 1200 điểm (user a < b < c) -> Phân trang chính xác không trùng không sót', async () => {
      // Kịch bản:
      // User a: rating 1200, user_id '0000-a'
      // User b: rating 1200, user_id '0000-b'
      // User c: rating 1200, user_id '0000-c'
      // Giả lập pageSize = 2:
      // Trang 1 trả về [a, b, c] (3 rows do limit = 3) -> entries = [a, b], nextCursor = { rating: 1200, userId: '0000-b' }

      const mockPage1Rows = [
        {
          user_id: '0000-a',
          rating: 1200,
          games_played: 15,
          wins: 10,
          losses: 5,
          best_rating: 1200,
          profiles: { display_name: 'Player A', avatar_url: null },
        },
        {
          user_id: '0000-b',
          rating: 1200,
          games_played: 15,
          wins: 10,
          losses: 5,
          best_rating: 1200,
          profiles: { display_name: 'Player B', avatar_url: null },
        },
        {
          user_id: '0000-c',
          rating: 1200,
          games_played: 15,
          wins: 10,
          losses: 5,
          best_rating: 1200,
          profiles: { display_name: 'Player C', avatar_url: null },
        },
      ];

      const mockQueryBuilderPage1 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockPage1Rows, error: null }),
        or: vi.fn().mockReturnThis(),
      };

      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilderPage1 as unknown as ReturnType<typeof supabase.from>,
      );

      // Tải trang 1 (pageSize = 2)
      const page1 = await getLeaderboardPage('caro', 1, null, 2, 1);
      expect(page1.entries).toHaveLength(2);
      expect(page1.entries[0]?.userId).toBe('0000-a');
      expect(page1.entries[1]?.userId).toBe('0000-b');
      expect(page1.nextCursor).toEqual({ rating: 1200, userId: '0000-b' });

      // Tải trang 2 với cursor của Player B
      const mockPage2Rows = [
        {
          user_id: '0000-c',
          rating: 1200,
          games_played: 15,
          wins: 10,
          losses: 5,
          best_rating: 1200,
          profiles: { display_name: 'Player C', avatar_url: null },
        },
      ];

      const mockQueryBuilderPage2 = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockPage2Rows, error: null }),
        or: vi.fn().mockReturnThis(),
      };

      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilderPage2 as unknown as ReturnType<typeof supabase.from>,
      );

      const page2 = await getLeaderboardPage('caro', 1, page1.nextCursor, 2, 3);

      // Kiểm tra điều kiện .or() được gọi chính xác theo quy tắc PostgREST
      expect(mockQueryBuilderPage2.or).toHaveBeenCalledWith(
        'rating.lt.1200,and(rating.eq.1200,user_id.gt.0000-b)',
      );

      expect(page2.entries).toHaveLength(1);
      expect(page2.entries[0]?.userId).toBe('0000-c');
      expect(page2.entries[0]?.rank).toBe(3);
      expect(page2.nextCursor).toBeNull();
    });

    it('4. Ném RepoError khi Supabase trả về lỗi', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failure' },
        }),
        or: vi.fn().mockReturnThis(),
      };

      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(getLeaderboardPage('caro', 1)).rejects.toThrow(RepoError);
    });
  });

  describe('getMyRank', () => {
    it('5. Trả về null khi người dùng chưa đăng nhập', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const result = await getMyRank('caro', 1);
      expect(result).toBeNull();
    });

    it('6. Trả về null khi người dùng chưa từng tham gia trận ranked nào (rating row = null)', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: {
          user: { id: 'user-unranked-uuid' } as unknown as import('@supabase/supabase-js').User,
        },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const result = await getMyRank('caro', 1);
      expect(result).toBeNull();
    });

    it('7. Người dùng mới đấu 5 trận (< 10 trận) -> eligible: false, rank: null (Không gọi COUNT)', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: {
          user: { id: 'user-novice-uuid' } as unknown as import('@supabase/supabase-js').User,
        },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { rating: 1240, games_played: 5 },
          error: null,
        }),
      };

      const fromSpy = vi
        .spyOn(supabase, 'from')
        .mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof supabase.from>);

      const result = await getMyRank('caro', 1);

      expect(result).toEqual({
        rank: null,
        rating: 1240,
        gamesPlayed: 5,
        eligible: false,
      });

      // Chỉ gọi 1 query đọc dòng cá nhân, tuyệt đối không gọi query count
      expect(fromSpy).toHaveBeenCalledTimes(1);
    });

    it('8. Người dùng đủ 15 trận (>= 10) -> Đếm số người xếp trên theo đúng tie-break, rank = count + 1', async () => {
      const myUserId = 'my-uuid-1234';
      const myRating = 1350;

      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: { id: myUserId } as unknown as import('@supabase/supabase-js').User },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      // Query 1: Đọc rating cá nhân
      const mockRatingBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { rating: myRating, games_played: 15 },
          error: null,
        }),
      };

      // Query 2: Đếm số người xếp TRÊN
      const mockCountBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ count: 4, data: null, error: null }),
      };

      let callCount = 0;
      vi.spyOn(supabase, 'from').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockRatingBuilder as unknown as ReturnType<typeof supabase.from>;
        }
        return mockCountBuilder as unknown as ReturnType<typeof supabase.from>;
      });

      const result = await getMyRank('caro', 1);

      expect(result).toEqual({
        rank: 5, // count (4) + 1
        rating: 1350,
        gamesPlayed: 15,
        eligible: true,
      });

      // Kiểm tra tham số query count
      expect(mockCountBuilder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(mockCountBuilder.eq).toHaveBeenCalledWith('game_id', 'caro');
      expect(mockCountBuilder.eq).toHaveBeenCalledWith('season_id', 1);
      expect(mockCountBuilder.gte).toHaveBeenCalledWith(
        'games_played',
        MIN_MATCHES_FOR_LEADERBOARD,
      );
      expect(mockCountBuilder.or).toHaveBeenCalledWith(
        `rating.gt.1350,and(rating.eq.1350,user_id.lt.${myUserId})`,
      );
    });
  });

  describe('In-Memory Cache (TTL 60 giây & Invalidation)', () => {
    it('9. getLeaderboardPage: Gọi 2 lần liên tiếp chỉ chạm DB 1 lần; sau 60s chạm lại DB', async () => {
      vi.useFakeTimers();

      const mockRows = [
        {
          user_id: 'user-1',
          rating: 1400,
          games_played: 20,
          wins: 15,
          losses: 5,
          best_rating: 1400,
          profiles: { display_name: 'Player 1', avatar_url: null },
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        or: vi.fn().mockReturnThis(),
      };

      const fromSpy = vi
        .spyOn(supabase, 'from')
        .mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof supabase.from>);

      // Lần 1: Gọi DB
      const res1 = await getLeaderboardPage('caro', 1);
      expect(res1.entries).toHaveLength(1);
      expect(fromSpy).toHaveBeenCalledTimes(1);

      // Lần 2: Lấy từ Cache
      const res2 = await getLeaderboardPage('caro', 1);
      expect(res2.entries).toHaveLength(1);
      expect(fromSpy).toHaveBeenCalledTimes(1);

      // Tua thời gian 60_001ms (hết TTL 60s)
      vi.advanceTimersByTime(LEADERBOARD_CACHE_TTL_MS + 1);

      // Lần 3: Gọi lại DB
      const res3 = await getLeaderboardPage('caro', 1);
      expect(res3.entries).toHaveLength(1);
      expect(fromSpy).toHaveBeenCalledTimes(2);
    });

    it('10. invalidateLeaderboardCache: Xóa đúng game và không làm ảnh hưởng game khác', async () => {
      const mockRows = [
        {
          user_id: 'user-1',
          rating: 1400,
          games_played: 20,
          wins: 15,
          losses: 5,
          best_rating: 1400,
          profiles: { display_name: 'Player 1', avatar_url: null },
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
        or: vi.fn().mockReturnThis(),
      };

      const fromSpy = vi
        .spyOn(supabase, 'from')
        .mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof supabase.from>);

      // Nạp cache cho caro và co_tuong
      await getLeaderboardPage('caro', 1);
      await getLeaderboardPage('co_tuong', 1);
      expect(fromSpy).toHaveBeenCalledTimes(2);

      // Xóa cache riêng game caro
      invalidateLeaderboardCache('caro');

      // Gọi lại co_tuong -> vẫn trúng cache (fromSpy không tăng)
      await getLeaderboardPage('co_tuong', 1);
      expect(fromSpy).toHaveBeenCalledTimes(2);

      // Gọi lại caro -> gọi lại DB (fromSpy tăng lên 3)
      await getLeaderboardPage('caro', 1);
      expect(fromSpy).toHaveBeenCalledTimes(3);

      // Xóa toàn bộ cache
      invalidateLeaderboardCache();
      await getLeaderboardPage('co_tuong', 1);
      expect(fromSpy).toHaveBeenCalledTimes(4);
    });

    it('11. getMyRank Cache: Gọi 2 lần chỉ chạm DB 1 lần', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: {
          user: { id: 'user-cached-uuid' } as unknown as import('@supabase/supabase-js').User,
        },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const mockRatingBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { rating: 1300, games_played: 12 },
          error: null,
        }),
      };

      const mockCountBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ count: 2, data: null, error: null }),
      };

      let callCount = 0;
      vi.spyOn(supabase, 'from').mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 1) {
          return mockRatingBuilder as unknown as ReturnType<typeof supabase.from>;
        }
        return mockCountBuilder as unknown as ReturnType<typeof supabase.from>;
      });

      // Lần 1: Gọi DB (2 query: rating + count)
      const res1 = await getMyRank('caro', 1);
      expect(res1?.rank).toBe(3);
      expect(callCount).toBe(2);

      // Lần 2: Lấy từ Cache (không gọi thêm query nào)
      const res2 = await getMyRank('caro', 1);
      expect(res2?.rank).toBe(3);
      expect(callCount).toBe(2);
    });
  });
});
