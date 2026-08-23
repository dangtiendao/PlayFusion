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

describe('Referee Repository Unit Tests (refereeRepository.ts - P3.2d & P3.4c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initMatch', () => {
    it('1. Khởi tạo thành công -> trả về dữ liệu MatchLiveStateDto kèm clock và turnDeadline', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            stateSerialized: 'v1:15:5:0:1:0:0:-1:225.',
            moveIndex: 0,
            currentSeat: 0,
            movesSerialized: '',
            clock: { '0': 300000, '1': 300000 },
            turnDeadline: '2026-08-23T00:20:00.000Z',
            serverNow: '2026-08-23T00:15:00.000Z',
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
      expect(res.clock).toEqual({ '0': 300000, '1': 300000 });
      expect(res.turnDeadline).toBe('2026-08-23T00:20:00.000Z');
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

      try {
        await refereeRepository.initMatch('m-123');
        expect.fail('Hàm initMatch phải ném lỗi khi gặp sự cố mạng');
      } catch (err) {
        expect(err).toBeInstanceOf(RepoError);
        expect((err as RepoError).code).toBe('RETRYABLE');
      }
    });
  });

  describe('submitMove', () => {
    it('5. Nước đi hợp lệ -> trả về kind: "accepted" kèm clock & turnDeadline', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            moveIndex: 1,
            currentSeat: 1,
            stateSerialized: 'v1:15:5:0:1:1:1:112:...',
            terminal: null,
            clock: { '0': 295000, '1': 300000 },
            turnDeadline: '2026-08-23T00:20:00.000Z',
          },
        },
        error: null,
      });

      const res = await refereeRepository.submitMove('m-123', '112', 0);

      expect(res.kind).toBe('accepted');
      if (res.kind === 'accepted') {
        expect(res.moveIndex).toBe(1);
        expect(res.currentSeat).toBe(1);
        expect(res.clock).toEqual({ '0': 295000, '1': 300000 });
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
      }
    });

    it('8. Hết giờ (TIME_OUT) -> trả về kind: "timeout" (KHÔNG throw)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'TIME_OUT',
            message: 'Đã hết thời gian dành cho nước đi của bạn.',
          },
        },
        error: null,
      });

      const res = await refereeRepository.submitMove('m-123', '112', 0);

      expect(res.kind).toBe('timeout');
    });
  });

  describe('resign', () => {
    it('9. Đầu hàng thành công -> trả về kết quả ResignResult', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            matchId: 'm-123',
            reason: 'resign',
            outcomes: [
              { playerIndex: 0, outcome: 'loss' },
              { playerIndex: 1, outcome: 'win' },
            ],
          },
        },
        error: null,
      });

      const res = await refereeRepository.resign('m-123');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('referee', {
        body: { action: 'resign', matchId: 'm-123' },
      });
      expect(res.reason).toBe('resign');
      expect(res.outcomes).toHaveLength(2);
    });

    it('10. Ván đã kết thúc MATCH_ENDED khi resign -> không throw, trả về an toàn', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'MATCH_ENDED',
            message: 'Ván đấu đã kết thúc.',
          },
        },
        error: null,
      });

      const res = await refereeRepository.resign('m-123');
      expect(res.reason).toBe('resign');
    });
  });

  describe('claimTimeout', () => {
    it('11. Claim thành công khi đối thủ quá hạn -> trả về kind: "accepted"', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: true,
          data: {
            matchId: 'm-123',
            reason: 'timeout',
            outcomes: [
              { playerIndex: 0, outcome: 'win' },
              { playerIndex: 1, outcome: 'loss' },
            ],
          },
        },
        error: null,
      });

      const res = await refereeRepository.claimTimeout('m-123');
      expect(supabase.functions.invoke).toHaveBeenCalledWith('referee', {
        body: { action: 'claim_timeout', matchId: 'm-123' },
      });
      expect(res.kind).toBe('accepted');
    });

    it('12. Claim sớm (TOO_EARLY) -> trả về kind: "too_early" kèm serverNow (KHÔNG throw)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'TOO_EARLY',
            message: 'Chưa đủ thời gian quá hạn.',
            serverNow: '2026-08-23T00:15:00.000Z',
            turnDeadline: '2026-08-23T00:16:00.000Z',
          },
        },
        error: null,
      });

      const res = await refereeRepository.claimTimeout('m-123');
      expect(res.kind).toBe('too_early');
      if (res.kind === 'too_early') {
        expect(res.serverNow).toBe('2026-08-23T00:15:00.000Z');
      }
    });

    it('13. Trận đã kết thúc MATCH_ENDED khi claim -> trả về kind: "match_ended" (KHÔNG throw)', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          ok: false,
          error: {
            code: 'MATCH_ENDED',
            message: 'Ván đấu đã kết thúc.',
          },
        },
        error: null,
      });

      const res = await refereeRepository.claimTimeout('m-123');
      expect(res.kind).toBe('match_ended');
    });
  });
});
