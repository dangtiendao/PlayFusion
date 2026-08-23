/**
 * ==============================================================================
 * UNIT TESTS: ROOM REPOSITORY (SRC/REPOSITORIES/ROOMREPOSITORY.TEST.TS)
 * ==============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roomRepository } from './roomRepository';
import { supabase } from './supabaseClient';

// Mock Supabase client
vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    channel: vi.fn().mockReturnValue({
      subscribe: vi.fn().mockResolvedValue({}),
      send: vi.fn().mockResolvedValue({}),
    }),
    removeChannel: vi.fn().mockResolvedValue({}),
  },
}));

describe('RoomRepository Unit Tests (P3.3b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRoom', () => {
    it('1. Tạo phòng thành công -> trả về code và expiresAt (mặc định online_1v1)', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [{ code: 'ABC234', expires_at: '2026-08-22T23:30:00Z' }],
        error: null,
      });

      const result = await roomRepository.createRoom('caro');

      expect(supabase.rpc).toHaveBeenCalledWith('create_room', {
        p_game_id: 'caro',
        p_mode: 'online_1v1',
      });
      expect(result.code).toBe('ABC234');
      expect(result.expiresAt).toBe('2026-08-22T23:30:00Z');
    });

    it('1b. Tạo phòng mode online_correspondence thành công', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [{ code: 'XYZ789', expires_at: '2026-08-22T23:30:00Z' }],
        error: null,
      });

      const result = await roomRepository.createRoom('caro', 'online_correspondence');

      expect(supabase.rpc).toHaveBeenCalledWith('create_room', {
        p_game_id: 'caro',
        p_mode: 'online_correspondence',
      });
      expect(result.code).toBe('XYZ789');
    });

    it('2. Game bị khóa -> ném RepoError với message phù hợp', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'Trò chơi không tồn tại hoặc đang bị tạm khóa', code: 'P0002' },
      });

      await expect(roomRepository.createRoom('disabled_game')).rejects.toMatchObject({
        code: 'FATAL',
        message: expect.stringContaining('Trò chơi không tồn tại'),
      });
    });
  });

  describe('joinRoom', () => {
    it('3. Vào phòng thành công -> trả về matchId, mySeat, gameId, mode', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [
          {
            match_id: '123e4567-e89b-12d3-a456-426614174000',
            my_seat: 1,
            game_id: 'caro',
            mode: 'online_correspondence',
          },
        ],
        error: null,
      });

      const result = await roomRepository.joinRoom('abc234');

      expect(supabase.rpc).toHaveBeenCalledWith('join_room', { p_code: 'ABC234' });
      expect(result.matchId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.mySeat).toBe(1);
      expect(result.gameId).toBe('caro');
      expect(result.mode).toBe('online_correspondence');
    });

    it('4. Phòng đã có người vào trước (ROOM_TAKEN) -> ném RepoError FATAL', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'ROOM_TAKEN', code: 'P0008' },
      });

      await expect(roomRepository.joinRoom('ABC234')).rejects.toMatchObject({
        code: 'FATAL',
        message: expect.stringContaining('người khác tham gia trước'),
      });
    });

    it('5. Phòng hết hạn (ROOM_EXPIRED) -> ném RepoError FATAL', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'ROOM_EXPIRED', code: 'P0006' },
      });

      await expect(roomRepository.joinRoom('ABC234')).rejects.toMatchObject({
        code: 'FATAL',
        message: expect.stringContaining('đã hết hạn'),
      });
    });

    it('6. Host tự join phòng mình -> ném RepoError FATAL', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'CANNOT_JOIN_OWN_ROOM', code: 'P0005' },
      });

      await expect(roomRepository.joinRoom('ABC234')).rejects.toMatchObject({
        code: 'FATAL',
        message: expect.stringContaining('chính mình tạo'),
      });
    });
  });

  describe('cancelRoom', () => {
    it('7. Hủy phòng thành công -> trả về true', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: true,
        error: null,
      });

      const result = await roomRepository.cancelRoom('ABC234');
      expect(supabase.rpc).toHaveBeenCalledWith('cancel_room', { p_code: 'ABC234' });
      expect(result).toBe(true);
    });

    it('8. Hủy phòng của người khác -> ném RepoError CANNOT_CANCEL_ROOM', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: null,
        error: { message: 'CANNOT_CANCEL_ROOM', code: 'P0009' },
      });

      await expect(roomRepository.cancelRoom('ABC234')).rejects.toMatchObject({
        code: 'FATAL',
        message: expect.stringContaining('Không thể hủy phòng'),
      });
    });
  });

  describe('getRoomStatus', () => {
    it('9. Tra cứu trạng thái phòng -> trả về status và matchId', async () => {
      (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        data: [{ status: 'matched', match_id: 'm123', game_id: 'caro', my_seat: 0 }],
        error: null,
      });

      const result = await roomRepository.getRoomStatus('ABC234');
      expect(result.status).toBe('matched');
      expect(result.matchId).toBe('m123');
      expect(result.mySeat).toBe(0);
    });
  });

  describe('getRoomInfo', () => {
    it('10. Đọc metadata phòng cho deep link preview', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              code: 'ABC234',
              host_id: 'u1',
              game_id: 'caro',
              status: 'waiting',
              expires_at: '2026-08-22T23:30:00Z',
            },
            error: null,
          }),
        }),
      });

      (supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        select: mockSelect,
      });

      const info = await roomRepository.getRoomInfo('abc234');
      expect(info).toEqual({
        code: 'ABC234',
        hostId: 'u1',
        gameId: 'caro',
        status: 'waiting',
        expiresAt: '2026-08-22T23:30:00Z',
      });
    });
  });

  describe('notifyRoomMatched', () => {
    it('11. Gửi broadcast room_matched qua Supabase channel', async () => {
      await roomRepository.notifyRoomMatched('ABC234', 'match-123', 0);

      expect(supabase.channel).toHaveBeenCalledWith('match:ABC234');
      expect(supabase.removeChannel).toHaveBeenCalled();
    });
  });
});
