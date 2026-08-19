// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import * as matchRepo from './matchRepository';

describe('Match Repository Unit Tests (matchRepository.ts - P2.5a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMyRecentMatches', () => {
    it('1. Trả về mảng rỗng nếu người dùng chưa đăng nhập', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const matches = await matchRepo.getMyRecentMatches('caro');
      expect(matches).toEqual([]);
    });

    it('2. Truy vấn đúng danh sách trận gần đây kèm ánh xạ đối thủ và tên hiển thị', async () => {
      const mockUser = { id: 'user-a-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockData = [
        {
          match_id: 'match-1',
          created_at: '2026-08-18T10:00:00Z',
          match: {
            id: 'match-1',
            game_id: 'caro',
            game_mode: 'online_1v1',
            is_ranked: true,
            status: 'completed',
            started_at: '2026-08-18T10:00:00Z',
            ended_at: '2026-08-18T10:05:00Z',
            duration_ms: 300000,
            end_reason: 'five_in_a_row',
            all_participants: [
              {
                seat_index: 0,
                user_id: 'user-a-123',
                is_bot: false,
                bot_level: null,
                outcome: 'win' as const,
                placement: 1,
                score: null,
                rating_delta: 15,
                profile: { display_name: 'Player A' },
              },
              {
                seat_index: 1,
                user_id: 'user-b-456',
                is_bot: false,
                bot_level: null,
                outcome: 'loss' as const,
                placement: 2,
                score: null,
                rating_delta: -15,
                profile: { display_name: 'Player B' },
              },
            ],
          },
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const matches = await matchRepo.getMyRecentMatches('caro', 10);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.id).toBe('match-1');
      expect(matches[0]?.gameId).toBe('caro');
      expect(matches[0]?.isRanked).toBe(true);
      expect(matches[0]?.participants).toHaveLength(2);
      expect(matches[0]?.participants[0]?.displayName).toBe('Player A');
      expect(matches[0]?.participants[0]?.result).toBe('win');
      expect(matches[0]?.participants[1]?.displayName).toBe('Player B');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', 'user-a-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('match.game_id', 'caro');
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('3. Ném lỗi tiếng Việt khi database trả về lỗi truy vấn lịch sử đấu', async () => {
      const mockUser = { id: 'user-a-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error reading matches' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(matchRepo.getMyRecentMatches()).rejects.toThrowError(
        /Không thể tải lịch sử đấu: Database error reading matches/i,
      );
    });
  });

  describe('getMatchById', () => {
    it('4. Trả về thông tin chi tiết ván đấu khi tìm thấy theo ID', async () => {
      const mockMatch = {
        id: 'match-xyz',
        game_id: 'caro',
        game_mode: 'vs_ai',
        is_ranked: false,
        status: 'completed',
        started_at: '2026-08-18T12:00:00Z',
        ended_at: '2026-08-18T12:03:00Z',
        duration_ms: 180000,
        end_reason: 'resigned',
        participants: [
          {
            seat_index: 0,
            user_id: 'user-1',
            is_bot: false,
            bot_level: null,
            outcome: 'win' as const,
            placement: 1,
            score: 100,
            rating_delta: null,
            profile: { display_name: 'Player One' },
          },
        ],
      };

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockMatch, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const match = await matchRepo.getMatchById('match-xyz');
      expect(match).not.toBeNull();
      expect(match?.id).toBe('match-xyz');
      expect(match?.mode).toBe('vs_ai');
      expect(match?.participants[0]?.score).toBe(100);
    });

    it('5. Trả về null nếu không tìm thấy ván đấu theo ID', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const match = await matchRepo.getMatchById('non-existent');
      expect(match).toBeNull();
    });

    it('6. Ném lỗi tiếng Việt khi truy vấn chi tiết ván đấu bị lỗi', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection reset' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(matchRepo.getMatchById('match-123')).rejects.toThrowError(
        /Không thể tải chi tiết ván đấu: Connection reset/i,
      );
    });
  });
});
