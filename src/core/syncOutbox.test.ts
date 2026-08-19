// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueueOutboxItem,
  processSyncQueue,
  getOutboxItems,
  getPendingOutboxCount,
  clearAllOutboxItems,
  subscribeOutbox,
  MAX_OUTBOX_CAPACITY,
  MAX_RETRY_ATTEMPTS,
} from './syncOutbox';
import { storage } from './storage';
import { RepoError } from '../repositories/types';

describe('Sync Outbox Queue Unit Tests (syncOutbox.ts - P2.5c)', () => {
  beforeEach(() => {
    clearAllOutboxItems();
    vi.restoreAllMocks();
  });

  describe('enqueueOutboxItem', () => {
    it('1. Đưa một tác vụ mới vào hàng đợi và lưu trữ chính xác', () => {
      const item = enqueueOutboxItem({
        id: 'match-1',
        kind: 'offline_match',
        payload: { score: 100 },
      });

      expect(item.id).toBe('match-1');
      expect(item.kind).toBe('offline_match');
      expect(item.attempts).toBe(0);
      expect(item.createdAt).toBeDefined();

      const all = getOutboxItems();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe('match-1');
      expect(getPendingOutboxCount()).toBe(1);
    });

    it('2. Tính Idempotent phía client: Đưa cùng 1 ID nhiều lần không tạo bản ghi trùng lặp', () => {
      enqueueOutboxItem({ id: 'match-same', kind: 'offline_match', payload: { a: 1 } });
      enqueueOutboxItem({ id: 'match-same', kind: 'offline_match', payload: { a: 2 } });

      expect(getPendingOutboxCount()).toBe(1);
      expect(getOutboxItems()).toHaveLength(1);
    });

    it('3. Giới hạn trần 50 items (FIFO): Khi vượt quá 50, tự động cắt bỏ item cũ nhất', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      // Enqueue 55 items
      for (let i = 1; i <= 55; i++) {
        enqueueOutboxItem({
          id: `match-${i}`,
          kind: 'offline_match',
          payload: { index: i },
        });
      }

      const all = getOutboxItems();
      expect(all).toHaveLength(MAX_OUTBOX_CAPACITY);
      // Item 1..5 đã bị cắt bỏ, item đầu tiên hiện tại là match-6
      expect(all[0]?.id).toBe('match-6');
      expect(all[all.length - 1]?.id).toBe('match-55');
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('processSyncQueue', () => {
    it('4. Xử lý thành công: Gọi executor, gỡ item khỏi hàng đợi và trả về done count', async () => {
      enqueueOutboxItem({ id: 'match-ok-1', kind: 'offline_match', payload: { game: 'caro' } });
      enqueueOutboxItem({ id: 'match-ok-2', kind: 'offline_match', payload: { game: 'caro' } });

      const mockExecutor = vi.fn().mockResolvedValue(undefined);

      const result = await processSyncQueue({
        offline_match: mockExecutor,
      });

      expect(result).toEqual({ done: 2, failed: 0 });
      expect(mockExecutor).toHaveBeenCalledTimes(2);
      expect(getPendingOutboxCount()).toBe(0);
    });

    it('5. Lỗi FATAL (RepoError code=FATAL / isRetryable=false): Gỡ bỏ item và tiếp tục xử lý item kế tiếp', async () => {
      enqueueOutboxItem({ id: 'match-fatal', kind: 'offline_match', payload: { bad: true } });
      enqueueOutboxItem({ id: 'match-ok', kind: 'offline_match', payload: { ok: true } });

      const mockExecutor = vi
        .fn()
        .mockRejectedValueOnce(new RepoError('Invalid payload schema', 'FATAL'))
        .mockResolvedValueOnce(undefined);

      const result = await processSyncQueue({
        offline_match: mockExecutor,
      });

      expect(result).toEqual({ done: 1, failed: 1 });
      // Item fatal đã bị gỡ bỏ, item ok đã thành công -> Hàng đợi rỗng
      expect(getPendingOutboxCount()).toBe(0);
    });

    it('6. Lỗi RETRYABLE (Mất mạng / timeout): Giữ lại item trong queue, tăng attempts, và DỪNG lượt xử lý', async () => {
      enqueueOutboxItem({
        id: 'match-retryable',
        kind: 'offline_match',
        payload: { game: 'caro' },
      });
      enqueueOutboxItem({ id: 'match-next', kind: 'offline_match', payload: { game: 'caro' } });

      const mockExecutor = vi.fn().mockRejectedValue(new RepoError('Network timeout', 'RETRYABLE'));

      const result = await processSyncQueue({
        offline_match: mockExecutor,
      });

      expect(result).toEqual({ done: 0, failed: 1 });
      expect(mockExecutor).toHaveBeenCalledTimes(1); // Dừng ngay sau lỗi đầu tiên

      const remaining = getOutboxItems();
      expect(remaining).toHaveLength(2);
      expect(remaining[0]?.id).toBe('match-retryable');
      expect(remaining[0]?.attempts).toBe(1);
      expect(remaining[0]?.lastError).toBe('Network timeout');
    });

    it('7. Tự động gỡ bỏ tác vụ khi attempts >= MAX_RETRY_ATTEMPTS (10 lần)', async () => {
      enqueueOutboxItem({ id: 'match-exhausted', kind: 'offline_match', payload: {} });

      // Giả lập item đã thử 10 lần
      const items = getOutboxItems();
      if (items[0]) {
        items[0].attempts = MAX_RETRY_ATTEMPTS;
      }
      storage.setItem('sync:outbox', items);

      const mockExecutor = vi.fn();

      const result = await processSyncQueue({
        offline_match: mockExecutor,
      });

      expect(result).toEqual({ done: 0, failed: 1 });
      expect(mockExecutor).not.toHaveBeenCalled();
      expect(getPendingOutboxCount()).toBe(0);
    });

    it('8. Chống chạy chồng (Anti-concurrency): Lượt gọi song song thứ 2 bị bỏ qua an toàn', async () => {
      enqueueOutboxItem({ id: 'match-slow', kind: 'offline_match', payload: {} });

      const slowExecutor = vi
        .fn()
        .mockImplementation(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

      const p1 = processSyncQueue({ offline_match: slowExecutor });
      const p2 = processSyncQueue({ offline_match: slowExecutor });

      const [res1, res2] = await Promise.all([p1, p2]);

      expect(res1).toEqual({ done: 1, failed: 0 });
      expect(res2).toEqual({ done: 0, failed: 0 });
      expect(slowExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeOutbox', () => {
    it('9. Phát thông báo khi hàng đợi thêm hoặc xóa item', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeOutbox(listener);

      enqueueOutboxItem({ id: 'match-sub', kind: 'offline_match', payload: {} });
      expect(listener).toHaveBeenCalledTimes(1);

      clearAllOutboxItems();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      enqueueOutboxItem({ id: 'match-sub-2', kind: 'offline_match', payload: {} });
      expect(listener).toHaveBeenCalledTimes(2); // Không nhận thêm thông báo sau khi unsubscribe
    });
  });
});
