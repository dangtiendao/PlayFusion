// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabaseClient';
import * as catalogRepo from './catalogRepository';

describe('Catalog Repository Unit Tests (catalogRepository.ts - P2.5a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    catalogRepo.invalidateCatalogCache();
  });

  describe('getGames', () => {
    it('1. Trả về danh sách trò chơi đã kích hoạt và ánh xạ đúng cấu trúc Domain', async () => {
      const mockGames = [
        {
          id: 'caro',
          name: 'Cờ Caro',
          category: 'board',
          ranked: true,
          rating_system: 'elo',
          scoring: 'win_loss',
          min_players: 2,
          max_players: 2,
          is_enabled: true,
          ranked_enabled: true,
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockGames, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const games = await catalogRepo.getGames();
      expect(games).toHaveLength(1);
      expect(games[0]?.id).toBe('caro');
      expect(games[0]?.name).toBe('Cờ Caro');
      expect(games[0]?.ratingSystem).toBe('elo');
      expect(games[0]?.rankedEnabled).toBe(true);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('is_enabled', true);
    });

    it('2. Cache In-Memory: Không gọi lại Database nếu trong thời hạn TTL 5 phút', async () => {
      const mockGames = [
        {
          id: 'caro',
          name: 'Cờ Caro',
          category: 'board',
          ranked: true,
          rating_system: 'elo',
          scoring: 'win_loss',
          min_players: 2,
          max_players: 2,
          is_enabled: true,
          ranked_enabled: true,
        },
      ];

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockGames, error: null }),
      };
      const fromSpy = vi
        .spyOn(supabase, 'from')
        .mockReturnValue(mockQueryBuilder as unknown as ReturnType<typeof supabase.from>);

      // Lần 1: Gọi DB
      const games1 = await catalogRepo.getGames();
      expect(games1).toHaveLength(1);
      expect(fromSpy).toHaveBeenCalledTimes(1);

      // Lần 2: Lấy từ Cache, không gọi thêm DB
      const games2 = await catalogRepo.getGames();
      expect(games2).toHaveLength(1);
      expect(fromSpy).toHaveBeenCalledTimes(1);

      // Xóa cache và gọi lại: Phải gọi lại DB
      catalogRepo.invalidateCatalogCache();
      const games3 = await catalogRepo.getGames();
      expect(games3).toHaveLength(1);
      expect(fromSpy).toHaveBeenCalledTimes(2);
    });

    it('3. Ném lỗi tiếng Việt rõ ràng khi truy vấn bảng games thất bại', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Network connection timeout' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(catalogRepo.getGames()).rejects.toThrowError(
        /Không thể tải danh mục trò chơi: Network connection timeout/i,
      );
    });
  });

  describe('getActiveSeason', () => {
    it('4. Trả về thông tin mùa giải đang mở và ánh xạ đúng cấu trúc Domain', async () => {
      const mockSeason = {
        id: 1,
        name: 'Mùa 1 - Khởi Nguyên',
        start_at: '2026-08-18T00:00:00.000Z',
        end_at: null,
        is_active: true,
      };

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockSeason, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const season = await catalogRepo.getActiveSeason();
      expect(season).not.toBeNull();
      expect(season?.id).toBe(1);
      expect(season?.name).toBe('Mùa 1 - Khởi Nguyên');
      expect(season?.startedAt).toBe('2026-08-18T00:00:00.000Z');
      expect(season?.isActive).toBe(true);
    });

    it('5. Trả về null khi không có mùa giải nào đang hoạt động', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const season = await catalogRepo.getActiveSeason();
      expect(season).toBeNull();
    });

    it('6. Ném lỗi tiếng Việt khi truy vấn mùa giải thất bại', async () => {
      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(catalogRepo.getActiveSeason()).rejects.toThrowError(
        /Không thể tải thông tin mùa giải: Database error/i,
      );
    });
  });
});
