// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import * as statsRepo from './statsRepository';
import { RepoError } from './types';

describe('Stats Repository Unit Tests (statsRepository.ts - P2.6a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMyGameStats', () => {
    it('1. Trả về mảng rỗng nếu người dùng chưa đăng nhập', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const stats = await statsRepo.getMyGameStats();
      expect(stats).toEqual([]);
    });

    it('2. Ném lỗi RepoError (RETRYABLE) khi gặp lỗi xác thực auth', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthError', message: 'Token expired', status: 401 },
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      await expect(statsRepo.getMyGameStats()).rejects.toThrowError(RepoError);
      await expect(statsRepo.getMyGameStats()).rejects.toMatchObject({
        code: 'RETRYABLE',
      });
    });

    it('3. Ném lỗi RepoError (RETRYABLE) khi query database bị lỗi', async () => {
      const mockUser = { id: 'user-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection timeout', code: '57P01' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(statsRepo.getMyGameStats()).rejects.toThrowError(RepoError);
    });

    it('4. Trả về mảng rỗng khi không có bản ghi trận đấu nào', async () => {
      const mockUser = { id: 'user-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const stats = await statsRepo.getMyGameStats();
      expect(stats).toEqual([]);
    });

    it('5. Gom nhóm chính xác nhiều game và map đúng modeKey theo bot_level', async () => {
      const mockUser = { id: 'user-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockRows = [
        // Caro vs AI Hard: 2 ván (1W, 1L)
        {
          result: 'win',
          bot_level: 'hard',
          match: { game_id: 'caro', mode: 'vs_ai' },
        },
        {
          result: 'loss',
          bot_level: 'hard',
          match: { game_id: 'caro', mode: 'vs_ai' },
        },
        // Caro vs AI Easy: 1 ván (1W)
        {
          result: 'win',
          bot_level: 'easy',
          match: { game_id: 'caro', mode: 'vs_ai' },
        },
        // Caro Online 1v1: 1 ván (1W)
        {
          result: 'win',
          bot_level: null,
          match: { game_id: 'caro', mode: 'online_1v1' },
        },
        // Game khác: Cờ Tướng (co_tuong) vs AI Medium: 1 ván (1D)
        {
          result: 'draw',
          bot_level: 'medium',
          match: { game_id: 'co_tuong', mode: 'vs_ai' },
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const stats = await statsRepo.getMyGameStats();

      expect(stats).toHaveLength(2);

      const caroStats = stats.find((s) => s.gameId === 'caro');
      expect(caroStats).toBeDefined();
      expect(caroStats?.totalMatches).toBe(4);
      expect(caroStats?.byModeKey['vs_ai:hard']).toEqual({
        matches: 2,
        wins: 1,
        losses: 1,
        draws: 0,
      });
      expect(caroStats?.byModeKey['vs_ai:easy']).toEqual({
        matches: 1,
        wins: 1,
        losses: 0,
        draws: 0,
      });
      expect(caroStats?.byModeKey['online_1v1']).toEqual({
        matches: 1,
        wins: 1,
        losses: 0,
        draws: 0,
      });

      const coTuongStats = stats.find((s) => s.gameId === 'co_tuong');
      expect(coTuongStats).toBeDefined();
      expect(coTuongStats?.totalMatches).toBe(1);
      expect(coTuongStats?.byModeKey['vs_ai:medium']).toEqual({
        matches: 1,
        wins: 0,
        losses: 0,
        draws: 1,
      });
    });

    it('6. Quy tắc local_pvp: Chỉ đếm số trận và hòa, KHÔNG tính thắng/thua vào thành tích cá nhân', async () => {
      const mockUser = { id: 'user-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockRows = [
        // 3 ván local_pvp (dù DB có result: win hay loss vẫn bị bỏ qua)
        {
          result: 'win',
          bot_level: null,
          match: { game_id: 'caro', mode: 'local_pvp' },
        },
        {
          result: 'loss',
          bot_level: null,
          match: { game_id: 'caro', mode: 'local_pvp' },
        },
        {
          result: 'draw',
          bot_level: null,
          match: { game_id: 'caro', mode: 'local_pvp' },
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const stats = await statsRepo.getMyGameStats();

      expect(stats).toHaveLength(1);
      const caroStats = stats[0];
      expect(caroStats).toBeDefined();
      if (!caroStats) return;

      expect(caroStats.gameId).toBe('caro');
      expect(caroStats.totalMatches).toBe(3);

      // Khẳng định: wins = 0, losses = 0, draws = 1, matches = 3
      expect(caroStats.byModeKey['local_pvp']).toEqual({
        matches: 3,
        wins: 0,
        losses: 0,
        draws: 1,
      });
    });
  });
});
