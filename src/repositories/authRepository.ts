/**
 * ==============================================================================
 * AUTH REPOSITORY (TẦNG GIAO TIẾP XÁC THỰC SUPABASE)
 * ==============================================================================
 *
 * QUY ƯỚC KIẾN TRÚC ("CỔNG THOÁT HIỂM" - BẤT BIẾN):
 * 1. File này là nơi DUY NHẤT trong toàn bộ codebase được phép gọi các API
 *    xác thực của Supabase (`supabase.auth.*`).
 * 2. Toàn bộ logic giao diện, component, và zustand store KHÔNG BAO GIỜ gọi
 *    trực tiếp Supabase SDK mà bắt buộc phải thông qua `authRepository`.
 * 3. Chuẩn hóa lỗi: Mọi mã lỗi từ Supabase Auth được dịch sang thông điệp tiếng
 *    Việt dễ hiểu, giữ nguyên lỗi gốc trong thuộc tính `cause` của Exception.
 * ==============================================================================
 */

import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface AppAuthUser {
  /** Mã định danh người dùng UUID duy nhất (bất biến khi nâng cấp từ khách lên Google) */
  readonly id: string;
  /** Cờ báo người dùng đang sử dụng tài khoản khách ẩn danh */
  readonly isAnonymous: boolean;
  /** Địa chỉ email (chỉ có khi đăng nhập bằng Google hoặc nhà cung cấp có email) */
  readonly email?: string;
  /** Tên hiển thị người dùng */
  readonly displayName?: string;
  /** URL ảnh đại diện */
  readonly avatarUrl?: string;
  /** Tên nhà cung cấp xác thực (ví dụ: 'anonymous', 'google') */
  readonly provider?: string;
}

/**
 * Chuyển đổi đối tượng User của Supabase sang đối tượng chuẩn `AppAuthUser`.
 */
export function formatAuthUser(user: User | null): AppAuthUser | null {
  if (!user) return null;

  // Kiểm tra danh tính chính thức (Google, Email, v.v.)
  const hasOfficialIdentity =
    Array.isArray(user.identities) &&
    user.identities.some((id) => id.provider && id.provider !== 'anonymous');

  const appProviders = (user.app_metadata?.providers as string[] | undefined) || [];
  const hasOfficialProvider =
    appProviders.some((p) => p !== 'anonymous') ||
    (Boolean(user.app_metadata?.provider) && user.app_metadata?.provider !== 'anonymous');

  const hasEmail = Boolean(user.email);

  // Người dùng là Ẩn Danh khi và chỉ khi KHÔNG có bất kỳ danh tính chính thức nào và KHÔNG có email
  const isAnonymous =
    !hasOfficialIdentity &&
    !hasOfficialProvider &&
    !hasEmail &&
    (Boolean(user.is_anonymous) || user.app_metadata?.provider === 'anonymous');

  const userMetadata = user.user_metadata ?? {};
  const email = user.email || (userMetadata.email as string | undefined);
  const displayName =
    (userMetadata.full_name as string | undefined) ||
    (userMetadata.name as string | undefined) ||
    (userMetadata.user_name as string | undefined) ||
    (email ? email.split('@')[0] : undefined);
  const avatarUrl =
    (userMetadata.avatar_url as string | undefined) || (userMetadata.picture as string | undefined);

  const officialProviderName =
    user.identities?.find((id) => id.provider && id.provider !== 'anonymous')?.provider ||
    appProviders.find((p) => p !== 'anonymous') ||
    (user.app_metadata?.provider !== 'anonymous' ? user.app_metadata?.provider : undefined) ||
    (hasEmail ? 'google' : undefined);

  return {
    id: user.id,
    isAnonymous,
    email,
    displayName,
    avatarUrl,
    provider: officialProviderName ?? (isAnonymous ? 'anonymous' : undefined),
  };
}

/**
 * Chuẩn hóa và bản địa hóa thông báo lỗi từ Supabase Auth sang tiếng Việt.
 */
function mapAuthError(error: Error | { message: string; code?: string }): Error {
  const msg = error.message.toLowerCase();
  let viMessage = 'Đã xảy ra lỗi trong quá trình xác thực tài khoản.';

  if (
    msg.includes('anonymous_provider_disabled') ||
    (msg.includes('anonymous') && (msg.includes('disabled') || msg.includes('not enabled')))
  ) {
    viMessage = 'Chế độ đăng nhập ẩn danh chưa được bật trên máy chủ Supabase.';
  } else if (
    msg.includes('identity_already_exists') ||
    msg.includes('already linked') ||
    msg.includes('already assigned') ||
    msg.includes('identity already belongs to another user')
  ) {
    viMessage = 'Tài khoản Google này đã được liên kết với một tài khoản người dùng khác.';
  } else if (msg.includes('network') || msg.includes('fetch failed')) {
    viMessage = 'Không thể kết nối tới máy chủ xác thực. Vui lòng kiểm tra kết nối mạng.';
  } else if (msg.includes('rate limit') || msg.includes('too many requests')) {
    viMessage = 'Bạn đã gửi quá nhiều yêu cầu xác thực. Vui lòng thử lại sau giây lát.';
  } else if (msg.includes('user cancelled') || msg.includes('popup closed')) {
    viMessage = 'Đã hủy quá trình đăng nhập.';
  } else if (error.message) {
    viMessage = `Lỗi xác thực: ${error.message}`;
  }

  const err = new Error(viMessage);
  (err as Error & { cause?: unknown }).cause = error;
  return err;
}

/**
 * Lấy phiên đăng nhập hiện tại từ bộ nhớ cục bộ.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (err: unknown) {
    throw mapAuthError(err as Error);
  }
}

/**
 * Lấy thông tin người dùng hiện tại đang đăng nhập.
 */
export async function getUser(): Promise<AppAuthUser | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return formatAuthUser(data.user);
  } catch (err: unknown) {
    throw mapAuthError(err as Error);
  }
}

/**
 * Đăng nhập dưới dạng Khách Ẩn Danh (Anonymous Sign-In).
 *
 * JSDOC KIẾN TRÚC:
 * - Được tự động gọi khi ứng dụng khởi chạy nếu người dùng chưa có phiên đăng nhập.
 * - Cho phép người chơi vào thẳng game (ví dụ Caro) mà không bị chặn bởi màn hình đăng nhập.
 * - Supabase cấp cho user một UUID thật trong bảng `auth.users`, sẵn sàng cho việc
 *   lưu trữ dữ liệu và sau này nâng cấp lên tài khoản chính thức.
 */
export async function signInAnonymously(): Promise<AppAuthUser> {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.user) throw new Error('Không nhận được dữ liệu người dùng ẩn danh từ máy chủ.');
    const formatted = formatAuthUser(data.user);
    if (!formatted) throw new Error('Không thể định dạng thông tin người dùng ẩn danh.');
    return formatted;
  } catch (err: unknown) {
    throw mapAuthError(err as Error);
  }
}

/**
 * Đăng nhập tài khoản mới bằng Google OAuth.
 *
 * @param options Tùy chọn chuyển hướng sau khi hoàn tất đăng nhập
 */
export async function signInWithGoogle(options?: { redirectTo?: string }): Promise<void> {
  try {
    const redirectUrl =
      options?.redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) throw error;
  } catch (err: unknown) {
    throw mapAuthError(err as Error);
  }
}

/**
 * Nâng cấp tài khoản Khách ẩn danh hiện tại lên tài khoản Google (Link Identity).
 *
 * JSDOC QUAN TRỌNG:
 * - Sử dụng API `linkIdentity` của Supabase Auth để gán Google identity vào user khách hiện tại.
 * - GIỮ NGUYÊN HOÀN TOÀN `user.id` (UUID không đổi) -> Toàn bộ lịch sử ván đấu,
 *   thành tích và thống kê tích lũy trước đó KHÔNG BỊ MẤT.
 * - Nếu tài khoản Google đã từng được liên kết với một user khác trước đó, Supabase sẽ
 *   báo lỗi -> hàm sẽ ném lỗi thông báo rõ ràng "Tài khoản Google này đã được dùng...".
 *
 * @param options Tùy chọn chuyển hướng sau khi hoàn tất liên kết
 */
export async function linkGoogleToAnonymous(options?: { redirectTo?: string }): Promise<void> {
  try {
    const redirectUrl =
      options?.redirectTo || (typeof window !== 'undefined' ? window.location.origin : undefined);

    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const code = (error as unknown as { code?: string }).code || '';
      if (
        code === 'manual_linking_disabled' ||
        msg.includes('manual linking is disabled') ||
        msg.includes('manual_linking_disabled')
      ) {
        // Fallback sang đăng nhập Google thông thường nếu Manual Linking chưa bật trên Supabase
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
          },
        });
        if (oauthError) throw oauthError;
        return;
      }
      throw error;
    }
  } catch (err: unknown) {
    throw mapAuthError(err as Error);
  }
}

/**
 * Đăng xuất khỏi phiên làm việc hiện tại.
 */
export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (err: unknown) {
    throw mapAuthError(err as Error);
  }
}

/**
 * Đăng ký lắng nghe sự kiện thay đổi trạng thái xác thực từ Supabase Auth.
 *
 * @param callback Hàm xử lý khi trạng thái auth thay đổi
 * @returns Đối tượng chứa phương thức `unsubscribe` để hủy đăng ký dọn dẹp bộ nhớ
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, user: AppAuthUser | null) => void,
): { unsubscribe: () => void } {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    const user = formatAuthUser(session?.user ?? null);
    callback(event, user);
  });

  return {
    unsubscribe: () => subscription.unsubscribe(),
  };
}
