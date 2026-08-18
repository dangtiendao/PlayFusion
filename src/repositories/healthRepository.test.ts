import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkConnection, extractProjectRef } from './healthRepository';

describe('Health Repository Unit Tests (healthRepository.ts - P2.1a)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('extractProjectRef', () => {
    it('1. Trích xuất đúng mã projectRef từ URL Supabase tiêu chuẩn', () => {
      const url = 'https://abcdefghijklmnopqrst.supabase.co';
      expect(extractProjectRef(url)).toBe('abcdefghijklmnopqrst');
    });

    it('2. Trích xuất hostname nếu là domain tùy chỉnh', () => {
      const url = 'https://api.mycustomgamehub.com';
      expect(extractProjectRef(url)).toBe('api.mycustomgamehub.com');
    });

    it('3. Trả về unknown-project nếu URL hỏng', () => {
      expect(extractProjectRef('not-a-valid-url')).toBe('unknown-project');
    });
  });

  describe('checkConnection', () => {
    it('4. Trả về ok: true và latencyMs khi server Supabase phản hồi HTTP 200', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ version: 'v2.112.3', name: 'GoTrue' }),
      } as unknown as Response);

      const result = await checkConnection(3000);

      expect(result.ok).toBe(true);
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.projectRef).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('5. Trả về ok: false khi server Supabase phản hồi HTTP mã lỗi (ví dụ 503 Paused)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as unknown as Response);

      const result = await checkConnection(3000);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('HTTP 503: Service Unavailable');
    });

    it('6. Trả về ok: false khi gặp lỗi mạng (Network Error / Fetch Failed)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      const result = await checkConnection(3000);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Failed to fetch');
    });

    it('7. Trả về ok: false với thông báo quá thời gian khi request bị timeout/abort', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await checkConnection(1000);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Quá thời gian chờ phản hồi');
    });
  });
});
