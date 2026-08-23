/**
 * ==============================================================================
 * CONFIG REPOSITORY (TẦNG TRUY VẤN CẤU HÌNH HỆ THỐNG SYSTEM_CONFIG)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. CỔNG THOÁT HIỂM BACKEND:
 *    Mọi truy vấn bảng `system_config` phía client phải đi qua repository này.
 * 2. TỐI ƯU HÓA FREE TIER & IN-MEMORY CACHING:
 *    Các cấu hình vận hành (như reconnect_window_seconds, default_time_control)
 *    là dữ liệu tĩnh, hiếm khi thay đổi.
 *    Repository duy trì bộ đệm In-memory với TTL 5 phút để tiết kiệm request tới DB.
 * 3. FALLBACK AN TOÀN:
 *    Nếu truy vấn mạng lỗi hoặc không tìm thấy key, repository trả về giá trị
 *    mặc định an toàn thay vì ném lỗi làm crash ứng dụng.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';

/** Cấu hình TTL cho Cache In-Memory (5 phút) */
export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

/** Giá trị cửa sổ reconnect mặc định khi gặp sự cố mạng (60 giây) */
export const DEFAULT_RECONNECT_WINDOW_SECONDS = 60;

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

let cachedReconnectWindow: CacheEntry<number> | null = null;

/**
 * Xóa sạch toàn bộ Cache In-Memory của cấu hình hệ thống (phục vụ kiểm thử).
 */
export function invalidateConfigCache(): void {
  cachedReconnectWindow = null;
}

export interface ConfigRepository {
  /**
   * Lấy cấu hình thời lượng cửa sổ cho phép kết nối lại ván đấu (giây).
   * Đọc từ key `match.reconnect_window_seconds` trong bảng `system_config`.
   */
  getReconnectWindowSeconds(): Promise<number>;
}

export const configRepository: ConfigRepository = {
  async getReconnectWindowSeconds(): Promise<number> {
    const now = Date.now();
    if (cachedReconnectWindow && now - cachedReconnectWindow.cachedAt < CONFIG_CACHE_TTL_MS) {
      return cachedReconnectWindow.data;
    }

    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'match.reconnect_window_seconds')
        .maybeSingle();

      if (error || !data || data.value === null || data.value === undefined) {
        return DEFAULT_RECONNECT_WINDOW_SECONDS;
      }

      const rawVal = data.value;
      let seconds = DEFAULT_RECONNECT_WINDOW_SECONDS;

      if (typeof rawVal === 'number') {
        seconds = rawVal;
      } else if (typeof rawVal === 'string') {
        const parsed = parseInt(rawVal, 10);
        if (!isNaN(parsed) && parsed > 0) {
          seconds = parsed;
        }
      } else if (typeof rawVal === 'object' && rawVal !== null && 'seconds' in rawVal) {
        const parsed = Number((rawVal as { seconds: unknown }).seconds);
        if (!isNaN(parsed) && parsed > 0) {
          seconds = parsed;
        }
      }

      cachedReconnectWindow = {
        data: seconds,
        cachedAt: now,
      };

      return seconds;
    } catch {
      return DEFAULT_RECONNECT_WINDOW_SECONDS;
    }
  },
};
