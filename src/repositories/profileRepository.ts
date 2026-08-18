/**
 * ==============================================================================
 * PROFILE REPOSITORY (TẦNG GIAO TIẾP DỮ LIỆU HỒ SƠ NGƯỜI DÙNG)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. CỔNG THOÁT HIỂM BACKEND:
 *    Mọi truy vấn bảng `public.profiles` phải đi qua repository này. Tuyệt đối
 *    không gọi `supabase.from('profiles')` trực tiếp trong component UI hay Store.
 * 2. CHUẨN HÓA DỮ LIỆU & CLIENT VALIDATION:
 *    Ràng buộc độ dài `display_name` (2..20 ký tự, loại bỏ khoảng trắng thừa)
 *    được kiểm định fail-fast ngay phía client để mirror chính xác CHECK constraint của DB.
 * 3. BẢO VỆ CỘT HỆ THỐNG:
 *    Hàm `updateDisplayName` chỉ gửi trường `display_name`, tuyệt đối không cho phép
 *    sửa đổi `role`, `user_id` hay `is_anonymous`.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';

export interface Profile {
  /** Định danh duy nhất (UUID) của người dùng */
  readonly id: string;
  /** Khóa ngoại trỏ đến auth.users(id) */
  readonly userId: string;
  /** Tên hiển thị công khai (2..20 ký tự) */
  readonly displayName: string;
  /** Đường dẫn ảnh đại diện (nếu có từ Google) */
  readonly avatarUrl: string | null;
  /** Vai trò tài khoản (chuẩn bị cho P5.1) */
  readonly role: 'player' | 'moderator' | 'admin';
  /** Cờ báo tài khoản khách ẩn danh */
  readonly isAnonymous: boolean;
  /** Thời điểm tạo hồ sơ (ISO string) */
  readonly createdAt: string;
  /** Thời điểm cập nhật gần nhất (ISO string) */
  readonly updatedAt: string;
}

interface DbProfileRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: 'player' | 'moderator' | 'admin';
  is_anonymous: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Chuyển đổi bản ghi DB sang định dạng Profile dùng trong ứng dụng.
 */
function mapDbRowToProfile(row: DbProfileRow): Profile {
  return {
    id: row.user_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    isAnonymous: row.is_anonymous,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lấy thông tin Profile của người dùng hiện tại đang đăng nhập.
 * @returns Profile nếu tìm thấy, hoặc null nếu chưa đăng nhập / chưa có profile.
 */
export async function getMyProfile(): Promise<Profile | null> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, role, is_anonymous, created_at, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Không thể tải thông tin hồ sơ: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapDbRowToProfile(data as DbProfileRow);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi truy vấn hồ sơ người dùng.');
  }
}

/**
 * Cập nhật tên hiển thị của người dùng hiện tại.
 * @param name Tên hiển thị mới (tự động trim, yêu cầu 2..20 ký tự).
 * @returns Profile sau khi đã cập nhật thành công.
 */
export async function updateDisplayName(name: string): Promise<Profile> {
  const trimmed = name.trim();

  // Kiểm định phía client (mirror theo DB CHECK constraint)
  if (!trimmed || trimmed.length < 2 || trimmed.length > 20) {
    throw new Error(
      'Tên hiển thị phải có độ dài từ 2 đến 20 ký tự (không tính khoảng trắng thừa).',
    );
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('Bạn cần đăng nhập để cập nhật thông tin hồ sơ.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('user_id', user.id)
      .select('user_id, display_name, avatar_url, role, is_anonymous, created_at, updated_at')
      .single();

    if (error) {
      if (error.message.toLowerCase().includes('check constraint')) {
        throw new Error('Tên hiển thị không hợp lệ. Vui lòng chọn tên từ 2 đến 20 ký tự.');
      }
      throw new Error(`Lỗi cập nhật tên hiển thị: ${error.message}`);
    }

    return mapDbRowToProfile(data as DbProfileRow);
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Lỗi không xác định khi cập nhật tên hiển thị.');
  }
}
