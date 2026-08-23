import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  configRepository,
  invalidateConfigCache,
  DEFAULT_RECONNECT_WINDOW_SECONDS,
  CONFIG_CACHE_TTL_MS,
} from './configRepository';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Config Repository Unit Tests (configRepository.ts - P3.5a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateConfigCache();
  });

  it('1. Đọc thành công số giây reconnect_window từ DB', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { value: 90 },
          error: null,
        }),
      }),
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const seconds = await configRepository.getReconnectWindowSeconds();
    expect(seconds).toBe(90);
  });

  it('2. Đọc giá trị dạng object json { seconds: 120 }', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { value: { seconds: 120 } },
          error: null,
        }),
      }),
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const seconds = await configRepository.getReconnectWindowSeconds();
    expect(seconds).toBe(120);
  });

  it('3. Cache in-memory hoạt động trong thời gian TTL (5 phút)', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { value: 75 },
          error: null,
        }),
      }),
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const first = await configRepository.getReconnectWindowSeconds();
    const second = await configRepository.getReconnectWindowSeconds();

    expect(first).toBe(75);
    expect(second).toBe(75);
    expect(supabase.from).toHaveBeenCalledTimes(1); // Chỉ gọi 1 lần do cache
  });

  it('4. Hết hạn TTL cache -> truy vấn lại DB', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { value: 80 },
          error: null,
        }),
      }),
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1000000);

    await configRepository.getReconnectWindowSeconds();

    // Vượt quá TTL 5 phút
    nowSpy.mockReturnValue(1000000 + CONFIG_CACHE_TTL_MS + 1000);

    await configRepository.getReconnectWindowSeconds();

    expect(supabase.from).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('5. Lỗi DB hoặc không có data -> trả về giá trị fallback an toàn (60 giây)', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB connection error' },
        }),
      }),
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: mockSelect,
    } as unknown as ReturnType<typeof supabase.from>);

    const seconds = await configRepository.getReconnectWindowSeconds();
    expect(seconds).toBe(DEFAULT_RECONNECT_WINDOW_SECONDS);
  });
});
