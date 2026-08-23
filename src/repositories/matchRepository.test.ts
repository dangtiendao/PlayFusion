// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import * as matchRepo from './matchRepository';
import { RepoError } from './types';

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

  describe('recordOfflineMatch', () => {
    const validParams = {
      matchId: '11111111-2222-3333-4444-555555555555',
      gameId: 'caro',
      mode: 'vs_ai' as const,
      startedAt: new Date('2026-08-18T10:00:00Z'),
      durationMs: 120000,
      endReason: 'checkmate',
      engineOptions: '{"boardSize":15}',
      finalState: '{"winner":0}',
      moves: '112,97,113',
      participants: [
        { seatIndex: 0, isBot: false, botLevel: null, result: 'win' as const },
        { seatIndex: 1, isBot: true, botLevel: 'medium' as const, result: 'loss' as const },
      ],
    };

    it('7. Gọi RPC thành công và trả về match_id hợp lệ', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: '11111111-2222-3333-4444-555555555555',
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      const result = await matchRepo.recordOfflineMatch(validParams);
      expect(result).toBe('11111111-2222-3333-4444-555555555555');
      expect(supabase.rpc).toHaveBeenCalledWith('record_offline_match', {
        p_match: expect.objectContaining({
          match_id: '11111111-2222-3333-4444-555555555555',
          game_id: 'caro',
          mode: 'vs_ai',
        }),
      });
    });

    it('8. Ném lỗi RepoError(FATAL, isRetryable=false) khi cơ sở dữ liệu báo lỗi Validation', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: {
          message: 'Validation Error: Chế độ chơi "online_1v1" không hợp lệ cho trận đấu offline.',
          code: '22023',
        },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      await expect(matchRepo.recordOfflineMatch(validParams)).rejects.toSatisfy((err: unknown) => {
        const isRepoError = err instanceof RepoError;
        const isFatal = (err as RepoError).code === 'FATAL';
        const notRetryable = !(err as RepoError).isRetryable;
        return isRepoError && isFatal && notRetryable;
      });
    });

    it('9. Ném lỗi RepoError(RETRYABLE, isRetryable=true) khi gặp sự cố mạng hoặc 500', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: {
          message: 'Failed to fetch (Network disconnected)',
          code: 'FETCH_ERROR',
        },
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);

      await expect(matchRepo.recordOfflineMatch(validParams)).rejects.toSatisfy((err: unknown) => {
        const isRepoError = err instanceof RepoError;
        const isRetryable = (err as RepoError).code === 'RETRYABLE';
        return isRepoError && isRetryable;
      });
    });
  });

  describe('getLiveState', () => {
    it('10. Đọc thành công live state từ bảng match_live_state', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              state_serialized: 'state_123',
              move_index: 5,
              current_seat: 1,
              moves_serialized: '0,1,2,3,4',
            },
            error: null,
          }),
        }),
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: mockSelect,
      } as unknown as ReturnType<typeof supabase.from>);

      const result = await matchRepo.getLiveState('match-123');
      expect(result).toEqual({
        stateSerialized: 'state_123',
        moveIndex: 5,
        currentSeat: 1,
        movesSerialized: '0,1,2,3,4',
        clock: null,
        turnStartedAt: null,
        turnDeadline: null,
      });
    });

    it('11. Trả về null khi không tìm thấy live state (đã kết thúc)', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: mockSelect,
      } as unknown as ReturnType<typeof supabase.from>);

      const result = await matchRepo.getLiveState('match-ended');
      expect(result).toBeNull();
    });
  });

  describe('getMyActiveMatch (P3.5b)', () => {
    it('12. Tìm thấy ván đấu đang diễn ra của người dùng', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: { id: 'usr-123' } as unknown as import('@supabase/supabase-js').User },
        error: null,
      });

      const mockLimit = vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            match_id: 'match-live-uuid',
            matches: {
              id: 'match-live-uuid',
              game_id: 'caro',
              ended_at: null,
              mode: 'online_1v1',
            },
          },
          error: null,
        }),
      });

      const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEqMode = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIsEndedAt = vi.fn().mockReturnValue({ eq: mockEqMode });
      const mockEqUserId = vi.fn().mockReturnValue({ is: mockIsEndedAt });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqUserId });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: mockSelect,
      } as unknown as ReturnType<typeof supabase.from>);

      const activeMatch = await matchRepo.getMyActiveMatch();
      expect(activeMatch).toEqual({
        matchId: 'match-live-uuid',
        gameId: 'caro',
      });
    });

    it('13. Trả về null khi không có ván đấu nào đang sống hoặc chưa đăng nhập', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null as unknown as import('@supabase/supabase-js').User },
        error: null,
      });

      const activeMatch = await matchRepo.getMyActiveMatch();
      expect(activeMatch).toBeNull();
    });
  });
});
