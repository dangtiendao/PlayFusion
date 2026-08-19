// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import * as ratingRepo from './ratingRepository';

describe('Rating Repository Unit Tests (ratingRepository.ts - P2.5a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMyRatings', () => {
    it('1. Trả về mảng rỗng nếu người dùng chưa đăng nhập', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const ratings = await ratingRepo.getMyRatings();
      expect(ratings).toEqual([]);
    });

    it('2. Lấy danh sách điểm xếp hạng của người dùng hiện tại và ánh xạ đúng Domain Type', async () => {
      const mockUser = { id: 'user-a-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockRatings = [
        {
          user_id: 'user-a-123',
          game_id: 'caro',
          season_id: 1,
          rating: 1350,
          games_played: 15,
          wins: 10,
          losses: 4,
          draws: 1,
          streak: 3,
          best_rating: 1380,
          placement_done: true,
          last_played_at: '2026-08-18T10:00:00Z',
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRatings, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const ratings = await ratingRepo.getMyRatings(1);
      expect(ratings).toHaveLength(1);
      expect(ratings[0]?.userId).toBe('user-a-123');
      expect(ratings[0]?.gameId).toBe('caro');
      expect(ratings[0]?.rating).toBe(1350);
      expect(ratings[0]?.gamesPlayed).toBe(15);
      expect(ratings[0]?.placementDone).toBe(true);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', 'user-a-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('season_id', 1);
    });

    it('3. Ném lỗi tiếng Việt khi database trả về lỗi', async () => {
      const mockUser = { id: 'user-a-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Failed to fetch ratings' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(ratingRepo.getMyRatings()).rejects.toThrowError(
        /Không thể tải điểm xếp hạng: Failed to fetch ratings/i,
      );
    });
  });

  describe('getRating', () => {
    it('4. Trả về thông tin rating của người chơi khi tìm thấy', async () => {
      const mockRating = {
        user_id: 'user-b-456',
        game_id: 'caro',
        season_id: 1,
        rating: 1500,
        games_played: 30,
        wins: 20,
        losses: 8,
        draws: 2,
        streak: 5,
        best_rating: 1520,
        placement_done: true,
        last_played_at: '2026-08-18T11:00:00Z',
      };

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRating, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const rating = await ratingRepo.getRating('user-b-456', 'caro', 1);
      expect(rating).not.toBeNull();
      expect(rating?.userId).toBe('user-b-456');
      expect(rating?.rating).toBe(1500);
      expect(rating?.wins).toBe(20);
    });

    it('5. Trả về null khi người chơi chưa có rating trong game/mùa giải này', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const rating = await ratingRepo.getRating('user-new', 'caro', 1);
      expect(rating).toBeNull();
    });

    it('6. Ném lỗi tiếng Việt khi tra cứu rating bị lỗi', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(ratingRepo.getRating('user-1', 'caro', 1)).rejects.toThrowError(
        /Không thể tra cứu điểm xếp hạng: Database connection failed/i,
      );
    });
  });
});
