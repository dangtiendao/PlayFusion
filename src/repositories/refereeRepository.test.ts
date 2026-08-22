/**
 * ==============================================================================
 * UNIT TESTS CHO REFEREE REPOSITORY (SRC/REPOSITORIES/REFEREEREPOSITORY.TEST.TS)
 * ==============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refereeRepository } from './refereeRepository';
import { supabase } from './supabaseClient';
import { RepoError } from './types';

vi.mock('./supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Referee Repository Unit Tests (refereeRepository.ts - P3.2d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initMatch', () => {
    it('1. Khởi tạo thành công -> trả về dữ liệu MatchLiveStateDto', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            stateSerialized: 'v1:15:5:0:1:0:0:-1:225.',
            moveIndex: 0,
            currentSeat: 0,
            movesSerialized: '',
          },
        },
        error: null,
      });

      const res = await refereeRepository.initMatch('m-123');

      expect(supabase.functions.invoke).toHaveBeenCalledWith('referee', {
        body: { action: 'init', matchId: 'm-123' },
      });
      expect(res.moveIndex).toBe(0);
      expect(res.currentSeat).toBe(0);
      expect(res.stateSerialized).toBe('v1:15:5:0:1:0:0:-1:225.');
    });

    it('2. matchId rỗng -> ném lỗi RepoError FATAL', async () => {
      await expect(refereeRepository.initMatch('')).rejects.toThrowError(RepoError);
      try {
        await refereeRepository.initMatch('');
      } catch (err) {
        expect((err as RepoError).code).toBe('FATAL');
      }
    });

    it('3. Lỗi NOT_PARTICIPANT từ server -> ném RepoError FATAL', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'NOT_PARTICIPANT',
            message: 'Bạn không phải đấu thủ của ván đấu này.',
          },
        },
        error: null,
      });

      await expect(refereeRepository.initMatch('m-123')).rejects.toThrowError(
        'Bạn không phải đấu thủ của ván đấu này.',
      );
    });

    it('4. Lỗi mạng (FunctionsHttpError) -> ném RepoError RETRYABLE', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: { message: 'Network request failed' } as unknown as null,
      });

      await expect(refereeRepository.initMatch('m-123')).rejects.toThrowError(RepoError);
      try {
        await refereeRepository.initMatch('m-123');
      } catch (err) {
        expect((err as RepoError).code).toBe('RETRYABLE');
      }
    });
  });

  describe('submitMove', () => {
    it('5. Nước đi hợp lệ -> trả về kind: "accepted"', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            moveIndex: 1,
            currentSeat: 1,
            stateSerialized: 'v1:15:5:0:1:1:1:112:...',
            terminal: null,
          },
        },
        error: null,
      });

      const res = await refereeRepository.submitMove('m-123', '112', 0);

      expect(res.kind).toBe('accepted');
      if (res.kind === 'accepted') {
        expect(res.moveIndex).toBe(1);
        expect(res.currentSeat).toBe(1);
        expect(res.terminal).toBeNull();
      }
    });

    it('6. Nước đi trùng lặp (duplicate) -> trả về kind: "duplicate" (KHÔNG throw)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            duplicate: true,
            moveIndex: 1,
            currentSeat: 1,
            stateSerialized: 'v1:...',
          },
        },
        error: null,
      });

      const res = await refereeRepository.submitMove('m-123', '112', 0);

      expect(res.kind).toBe('duplicate');
      if (res.kind === 'duplicate') {
        expect(res.moveIndex).toBe(1);
        expect(res.currentSeat).toBe(1);
      }
    });

    it('7. Client lệch nhịp (STALE_CLIENT) -> trả về kind: "stale" (KHÔNG throw)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'STALE_CLIENT',
            message: 'Trạng thái client lệch nhịp.',
            moveIndex: 3,
            stateSerialized: 'v1:...',
          },
        },
        error: null,
      });

      const res = await refereeRepository.submitMove('m-123', '112', 0);

      expect(res.kind).toBe('stale');
      if (res.kind === 'stale') {
        expect(res.message).toBe('Trạng thái client lệch nhịp.');
        expect(res.moveIndex).toBe(3);
      }
    });

    it('8. Nước đi sai luật (ILLEGAL_MOVE) -> ném RepoError FATAL', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'ILLEGAL_MOVE',
            message: 'Ô cờ đã có quân.',
          },
        },
        error: null,
      });

      await expect(refereeRepository.submitMove('m-123', '112', 0)).rejects.toThrowError(
        'Ô cờ đã có quân.',
      );
    });

    it('9. Sai lượt (WRONG_TURN) -> ném RepoError FATAL', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'WRONG_TURN',
            message: 'Chưa đến lượt đi của bạn.',
          },
        },
        error: null,
      });

      await expect(refereeRepository.submitMove('m-123', '112', 0)).rejects.toThrowError(
        'Chưa đến lượt đi của bạn.',
      );
    });
  });
});
