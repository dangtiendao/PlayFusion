/**
 * ==============================================================================
 * CẤU HÌNH BIẾN MÔI TRƯỜNG HỆ THỐNG (ENV VALIDATION)
 * ==============================================================================
 *
 * NGUYÊN TẮC THIẾT KẾ:
 * 1. Fail-Fast: Kiểm tra tính đầy đủ và hợp lệ của các biến môi trường bắt buộc
 *    ngay khi ứng dụng khởi chạy, ngăn chặn lỗi runtime mơ hồ (như "fetch failed").
 * 2. An toàn: Chỉ đọc các biến môi trường phía client có tiền tố `VITE_`, tuyệt
 *    đối không chứa thông tin nhạy cảm (như service_role key hay DB password).
 * 3. Hỗ trợ Test: Cung cấp hàm thuần túy `validateEnv` nhận nguồn biến tùy biến
 *    để kiểm thử toàn diện mọi kịch bản lỗi / hợp lệ trong Vitest.
 * ==============================================================================
 */

export interface AppEnv {
  /** URL của Supabase Project (ví dụ: https://xxxxxxxx.supabase.co) */
  readonly supabaseUrl: string;
  /** Public Anon Key của Supabase (an toàn phía client nhờ RLS) */
  readonly supabaseAnonKey: string;
  /** Cờ báo môi trường phát triển (development) */
  readonly isDev: boolean;
  /** Cờ báo môi trường production */
  readonly isProd: boolean;
  /** Cờ báo môi trường kiểm thử tự động (test) */
  readonly isTest: boolean;
}

/**
 * Kiểm định tính hợp lệ và trích xuất cấu hình môi trường từ Record biến.
 *
 * @param envSource Nguồn biến môi trường (mặc định lấy từ import.meta.env)
 * @returns Đối tượng `AppEnv` đã được validate sạch sẽ
 * @throws {Error} Ném ngoại lệ chi tiết nếu thiếu hoặc sai định dạng biến
 */
export function validateEnv(envSource: Record<string, unknown> = import.meta.env): AppEnv {
  const rawUrl = envSource.VITE_SUPABASE_URL;
  const rawAnonKey = envSource.VITE_SUPABASE_ANON_KEY;

  const errors: string[] = [];

  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    errors.push('VITE_SUPABASE_URL bị thiếu hoặc rỗng.');
  } else if (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://')) {
    errors.push('VITE_SUPABASE_URL phải là một URL hợp lệ bắt đầu bằng https:// hoặc http://');
  }

  if (!rawAnonKey || typeof rawAnonKey !== 'string' || rawAnonKey.trim() === '') {
    errors.push('VITE_SUPABASE_ANON_KEY bị thiếu hoặc rỗng.');
  }

  if (errors.length > 0) {
    const errorLines = [
      '❌ [LỖI KHỞI ĐỘNG - BIẾN MÔI TRƯỜNG SUPABASE KHÔNG HỢP LỆ]',
      ...errors.map((err) => `   • ${err}`),
      '',
      '👉 Hướng dẫn khắc phục:',
      '   1. Sao chép file ".env.example" thành ".env.local" tại thư mục gốc dự án.',
      '   2. Lấy URL và anon key từ Supabase Dashboard (Settings -> API) và điền vào .env.local.',
      '   3. Khởi động lại dev server: npm run dev',
    ];
    throw new Error(errorLines.join('\n'));
  }

  const mode = (envSource.MODE as string) || (envSource.NODE_ENV as string) || 'development';

  return {
    supabaseUrl: (rawUrl as string).trim().replace(/\/+$/, ''),
    supabaseAnonKey: (rawAnonKey as string).trim(),
    isDev: mode === 'development',
    isProd: mode === 'production',
    isTest: mode === 'test',
  };
}

let cachedEnv: AppEnv | null = null;

/**
 * Lấy cấu hình môi trường Singleton của ứng dụng.
 * Trong môi trường test tự động, nếu chưa cấu hình biến môi trường cục bộ,
 * hàm sẽ fallback về giá trị giả lập an toàn để không làm gián đoạn các test suite khác.
 */
export function getAppEnv(): AppEnv {
  if (!cachedEnv) {
    const isTestEnv =
      typeof import.meta !== 'undefined' &&
      (import.meta.env?.MODE === 'test' || import.meta.env?.NODE_ENV === 'test');

    if (
      isTestEnv &&
      (!import.meta.env?.VITE_SUPABASE_URL || !import.meta.env?.VITE_SUPABASE_ANON_KEY)
    ) {
      cachedEnv = validateEnv({
        ...import.meta.env,
        VITE_SUPABASE_URL: 'https://mock-dev-project.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'mock-anon-key-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      });
    } else {
      cachedEnv = validateEnv(import.meta.env);
    }
  }
  return cachedEnv;
}

/**
 * Xóa cache cấu hình môi trường (chỉ dùng cho Unit Test).
 */
export function _resetCachedEnvForTesting(): void {
  cachedEnv = null;
}
