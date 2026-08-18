/**
 * ==============================================================================
 * HEALTH REPOSITORY (KIỂM CHỨNG KẾT NỐI MÁY CHỦ SUPABASE)
 * ==============================================================================
 *
 * MỤC ĐÍCH:
 * 1. Cung cấp cơ chế kiểm tra kết nối (health check) nhẹ nhất có thể tới Supabase.
 * 2. Đo đạc độ trễ mạng thực tế (latencyMs) từ trình duyệt người dùng tới máy chủ.
 * 3. Hoạt động độc lập ngay cả khi CHƯA CÓ BẢNG NÀO tồn tại trong cơ sở dữ liệu.
 * 4. Trích xuất mã định danh Project Reference (projectRef) để phân biệt trực quan
 *    giữa môi trường DEV và PROD trên giao diện người dùng.
 * ==============================================================================
 */

import { getAppEnv } from '@/core/env';

export interface HealthCheckResult {
  /** Trạng thái kết nối thành công hay thất bại */
  readonly ok: boolean;
  /** Độ trễ mạng đo bằng mili-giây (ms) */
  readonly latencyMs: number;
  /** Mã định danh project Supabase trích xuất từ URL (ví dụ: "abcdefghijklmnopqrst") */
  readonly projectRef: string;
  /** Thông điệp lỗi chi tiết (nếu có lỗi kết nối) */
  readonly error?: string;
}

/**
 * Trích xuất mã định danh Project Reference (Subdomain) từ URL Supabase.
 *
 * @param url URL của project Supabase (ví dụ: https://xyz.supabase.co)
 * @returns Chuỗi projectRef hoặc hostname
 */
export function extractProjectRef(url: string): string {
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split('.');
    const firstPart = hostParts[0];
    if (hostParts.length >= 3 && hostParts[1] === 'supabase' && firstPart) {
      return firstPart;
    }
    return parsed.hostname;
  } catch {
    return 'unknown-project';
  }
}

/**
 * Kiểm tra kết nối tới máy chủ Supabase và đo thời gian phản hồi.
 *
 * Phương pháp: Gọi endpoint `/auth/v1/health` của GoTrue Auth Engine.
 * Lý do lựa chọn:
 * - Không yêu cầu bất kỳ bảng DB nào tồn tại (0 table dependency).
 * - Trả về HTTP 200 và JSON siêu nhẹ ({ version: "..." }) khi project active.
 * - Xác nhận tính khả dụng của cả mạng, SSL Certificate, và Supabase Gateway.
 * - Tự động fail nếu project đang bị tạm dừng (paused) hoặc sai URL/Key.
 *
 * @param timeoutMs Thời gian timeout tối đa trước khi hủy request (mặc định 5000ms)
 */
export async function checkConnection(timeoutMs = 5000): Promise<HealthCheckResult> {
  const env = getAppEnv();
  const projectRef = extractProjectRef(env.supabaseUrl);
  const healthEndpoint = `${env.supabaseUrl}/auth/v1/health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = performance.now();

  try {
    const response = await fetch(healthEndpoint, {
      method: 'GET',
      headers: {
        apikey: env.supabaseAnonKey,
      },
      signal: controller.signal,
    });

    const endTime = performance.now();
    clearTimeout(timeoutId);

    const latencyMs = Math.round(endTime - startTime);

    if (response.ok) {
      return {
        ok: true,
        latencyMs,
        projectRef,
      };
    }

    return {
      ok: false,
      latencyMs,
      projectRef,
      error: `Máy chủ phản hồi mã lỗi HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    const errorMessage =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Quá thời gian chờ phản hồi (${timeoutMs}ms)`
          : err.message
        : 'Lỗi mạng không xác định khi kết nối tới Supabase';

    return {
      ok: false,
      latencyMs,
      projectRef,
      error: errorMessage,
    };
  }
}
