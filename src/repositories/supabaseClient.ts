/**
 * ==============================================================================
 * SUPABASE CLIENT SINGLETON (TẦNG REPOSITORIES)
 * ==============================================================================
 *
 * QUY ƯỚC TẦNG (LAYER CONVENTION - NGUYÊN TẮC "CỔNG THOÁT HIỂM" BẤT BIẾN):
 * 1. Độc quyền truy cập: CHỈ CÁC FILE TRONG THƯ MỤC `src/repositories/` VÀ `src/transport/`
 *    ĐƯỢC PHÉP IMPORT `supabaseClient` HOẶC `@supabase/supabase-js`.
 *    - `src/transport/` tái sử dụng Singleton instance từ file này thay vì tạo client thứ 2.
 *      (Lý do: Tạo 2 client đồng nghĩa với 2 kết nối Auth độc lập, gây lãng phí tài nguyên
 *      kết nối và có nguy cơ lệch JWT session giữa DB queries và Realtime WebSocket).
 * 2. Cấm rò rỉ: Mọi tầng khác (`src/pages`, `src/games`, `src/components`,
 *    `src/stores`, `src/core`, `packages/engines`) TUYỆT ĐỐI CẤM import trực tiếp
 *    từ Supabase SDK hoặc `supabaseClient`.
 * 3. Mục đích kiến trúc: Tách biệt hoàn toàn tầng giao diện (UI) và logic nghiệp vụ
 *    khỏi nhà cung cấp Backend cụ thể. Nếu trong tương lai cần đổi sang Firebase,
 *    Appwrite, hay Custom REST Server, ta chỉ cần viết lại các file trong
 *    `src/repositories/` mà không phải chạm vào bất kỳ View hay Store nào.
 * ==============================================================================
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getAppEnv } from '@/core/env';

let clientInstance: SupabaseClient | null = null;

/**
 * Khởi tạo hoặc lấy instance Supabase Client Singleton.
 *
 * Cấu hình Auth:
 * - `persistSession: true`: Tự động lưu trữ JWT session token vào localStorage của
 *   trình duyệt, duy trì trạng thái đăng nhập khi người dùng tải lại trang hoặc mở lại tab.
 * - `autoRefreshToken: true`: Tự động gửi request làm mới access token chạy ngầm
 *   trước khi token hiện tại hết hạn (JWT access token mặc định có thời hạn 3600s).
 * - `detectSessionInUrl: true`: Tự động phát hiện và trích xuất session/code từ URL hash
 *   khi người dùng đăng nhập bằng Google OAuth hoặc Magic Link chuyển hướng về (P2.1b).
 *
 * Cấu hình Realtime (Tối ưu Free Tier - P3.1a):
 * - `eventsPerSecond: 10`: Giới hạn tốc độ phát sinh sự kiện tối đa 10 tin nhắn/giây.
 *   - Tính toán quota: Đối với game đối kháng theo lượt (turn-based 1v1 như Caro, Cờ tướng),
 *     tần suất nước đi và tương tác thông thường chỉ dao động từ 0.2 - 1 msg/s.
 *   - Mức 10 msg/s đảm bảo trải nghiệm chơi và chat mượt mà tức thì, đồng thời là van an toàn
 *     chặn đứng các vòng lặp vô tận (infinite loop) hoặc client spam flood làm cạn kiệt
 *     hạn mức 2,000,000 messages/tháng của gói Supabase Free Tier.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    const env = getAppEnv();
    clientInstance = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return clientInstance;
}

/**
 * Instance Supabase Client dùng chung cho toàn bộ tầng repositories.
 */
export const supabase = getSupabaseClient();

/**
 * Hàm hỗ trợ reset client instance phục vụ môi trường Unit Test.
 */
export function _resetSupabaseClientForTesting(): void {
  clientInstance = null;
}
