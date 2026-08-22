/**
 * ==============================================================================
 * SUPABASE CLIENT FACTORY TRÊN EDGE FUNCTIONS (SUPABASE/FUNCTIONS/_SHARED/SUPABASEADMIN.TS)
 * ==============================================================================
 *
 * GHI CHÚ BẢO MẬT & KIẾN TRÚC:
 * 1. ADMIN CLIENT (SERVICE ROLE KEY):
 *    - Sử dụng cho Trọng Tài Server-side (P3.2) để đọc/ghi trực tiếp bảng DB `matches`,
 *      bỏ qua RLS sau khi đã thẩm định tính hợp lệ của nước đi bằng TS Engine.
 * 2. USER AUTHENTICATION:
 *    - Trích xuất và xác thực JWT token từ Header `Authorization: Bearer <token>`.
 * ==============================================================================
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/**
 * Tạo Supabase Client với Service Role Key (quyền Admin tối cao trên server).
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Thiếu biến môi trường SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Edge Functions.',
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Trích xuất và xác thực người dùng từ Authorization Header của HTTP Request.
 * Trả về thông tin User hoặc null nếu token không hợp lệ / không có header.
 */
export async function getUserFromRequest(
  req: Request,
): Promise<{ user: User | null; error: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Thiếu Authorization Bearer header.' };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { user: null, error: 'Token Authorization rỗng.' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey) {
    return { user: null, error: 'Thiếu cấu hình Supabase URL/Key.' };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { user: null, error: error ? error.message : 'Không tìm thấy người dùng từ token.' };
  }

  return { user: data.user, error: null };
}
