import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  globalLeaderboardRepository,
  invalidateGlobalLeaderboard,
} from './globalLeaderboardRepository';
import { supabase } from './supabaseClient';

describe('GlobalLeaderboardRepository Tests (P4.7b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateGlobalLeaderboard();
  });

  describe('1. getMasters()', () => {
    it('1.1 Map đúng dữ liệu từ mv_leaderboard_masters và đánh số rank 1..n', async () => {
      const mockRows = [
        {
          user_id: 'user-1',
          display_name: 'Cao Thủ 1',
          avatar_url: 'https://avatar.dev/1.png',
          weighted_rating: 1550,
          games_count: 2,
          total_games: 45,
          best_tier_rating: 1600,
        },
        {
          user_id: 'user-2',
          display_name: 'Cao Thủ 2',
          avatar_url: null,
          weighted_rating: 1400,
          games_count: 1,
          total_games: 20,
          best_tier_rating: 1400,
        },
      ];

      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: selectMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const result = await globalLeaderboardRepository.getMasters(100);

      expect(supabase.from).toHaveBeenCalledWith('mv_leaderboard_masters');
      expect(result).toHaveLength(2);
      const [first, second] = result;
      expect(first).toEqual({
        rank: 1,
        userId: 'user-1',
        displayName: 'Cao Thủ 1',
        avatarUrl: 'https://avatar.dev/1.png',
        weightedRating: 1550,
        gamesCount: 2,
        totalGames: 45,
        bestTierRating: 1600,
      });
      expect(second?.rank).toBe(2);
    });

    it('1.2 Cache In-Memory 60s: Gọi 2 lần chỉ fetch Supabase 1 lần', async () => {
      const mockRows = [
        {
          user_id: 'user-1',
          display_name: 'Cao Thủ 1',
          avatar_url: null,
          weighted_rating: 1500,
          games_count: 1,
          total_games: 10,
        },
      ];

      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      });

      const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        select: selectMock,
      } as unknown as ReturnType<typeof supabase.from>);

      // Lần gọi 1 -> fetch
      const res1 = await globalLeaderboardRepository.getMasters(100);
      expect(fromSpy).toHaveBeenCalledTimes(1);
      expect(res1).toHaveLength(1);

      // Lần gọi 2 -> lấy từ cache
      const res2 = await globalLeaderboardRepository.getMasters(100);
      expect(fromSpy).toHaveBeenCalledTimes(1);
      expect(res2).toEqual(res1);

      // Invalidate cache -> fetch lại lần 2
      invalidateGlobalLeaderboard('masters');
      await globalLeaderboardRepository.getMasters(100);
      expect(fromSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. getGrinders()', () => {
    it('2.1 Map đúng dữ liệu từ mv_leaderboard_grinders và đánh số rank 1..n', async () => {
      const mockRows = [
        {
          user_id: 'user-a',
          display_name: 'Chăm Chỉ A',
          avatar_url: 'https://avatar.dev/a.png',
          earned_coins: 500,
          match_rewards_count: 15,
        },
        {
          user_id: 'user-b',
          display_name: 'Chăm Chỉ B',
          avatar_url: null,
          earned_coins: 350,
          match_rewards_count: 8,
        },
      ];

      const selectMock = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          }),
        }),
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: selectMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const result = await globalLeaderboardRepository.getGrinders(100);

      expect(supabase.from).toHaveBeenCalledWith('mv_leaderboard_grinders');
      expect(result).toHaveLength(2);
      const [first, second] = result;
      expect(first).toEqual({
        rank: 1,
        userId: 'user-a',
        displayName: 'Chăm Chỉ A',
        avatarUrl: 'https://avatar.dev/a.png',
        earnedCoins: 500,
        totalMatches: 15,
      });
      expect(second?.rank).toBe(2);
    });
  });

  describe('3. getMyGlobalRank()', () => {
    it('3.1 Người dùng chưa đăng nhập -> trả về { rank: null, value: null }', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const rank = await globalLeaderboardRepository.getMyGlobalRank('masters');
      expect(rank).toEqual({ rank: null, value: null });
    });

    it('3.2 Người dùng chưa có mặt trong matview (chưa đủ điều kiện) -> trả về { rank: null, value: null }', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: {
          session: {
            user: { id: 'unranked-user-id' },
          } as unknown as import('@supabase/supabase-js').Session,
        },
        error: null,
      });

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: selectMock,
      } as unknown as ReturnType<typeof supabase.from>);

      const rank = await globalLeaderboardRepository.getMyGlobalRank('masters');
      expect(rank).toEqual({ rank: null, value: null });
    });

    it('3.3 Người dùng có dòng trong matview -> đếm count tie-break và trả về rank + value đúng', async () => {
      const myUserId = 'user-me-123';
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: {
          session: {
            user: { id: myUserId },
          } as unknown as import('@supabase/supabase-js').Session,
        },
        error: null,
      });

      // 1. Mock query dòng của mình (weighted_rating = 1450)
      // 2. Mock query count head (count = 4 người đứng trước)
      const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'mv_leaderboard_masters') {
          return {
            select: vi.fn().mockImplementation((_fields, options) => {
              if (options?.head === true) {
                return {
                  or: vi.fn().mockResolvedValue({ count: 4, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { weighted_rating: 1450 },
                    error: null,
                  }),
                }),
              };
            }),
          } as unknown as ReturnType<typeof supabase.from>;
        }
        return {} as unknown as ReturnType<typeof supabase.from>;
      });

      const myRank = await globalLeaderboardRepository.getMyGlobalRank('masters');

      expect(fromSpy).toHaveBeenCalledWith('mv_leaderboard_masters');
      expect(myRank).toEqual({
        rank: 5, // 4 người đứng trước + 1
        value: 1450,
      });
    });
  });
});
