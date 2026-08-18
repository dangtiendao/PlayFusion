/**
 * ==============================================================================
 * AUTH STORE (ZUSTAND STORE QUẢN LÝ TRẠNG THÁI XÁC THỰC & HỒ SƠ NGƯỜI DÙNG)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC QUAN TRỌNG:
 * 1. KHÔNG DÙNG PERSIST MIDDLEWARE:
 *    Toàn bộ session token và refresh token đã được `@supabase/supabase-js` tự động
 *    quản lý và lưu trữ an toàn trong localStorage (với cờ `persistSession: true`).
 *    Tuyệt đối KHÔNG bọc zustand persist ở đây để tránh đồng bộ trùng lặp dữ liệu.
 * 2. CHỐNG DOUBLE-INIT TRONG REACT 18 STRICTMODE:
 *    `init()` sử dụng cờ kiểm soát (`isInitializing` / `isInitialized`) để đảm bảo
 *    khi component mount 2 lần trong dev mode, logic khởi tạo chỉ thực thi đúng 1 lần.
 * 3. NGUYÊN TẮC OFFLINE-FIRST (BẤT BIẾN):
 *    Trạng thái `loading` hoặc `error` của Auth STORE TUYỆT ĐỐI KHÔNG BAO GIỜ chặn
 *    giao diện hoặc làm gián đoạn các trò chơi offline (như Cờ Caro, Ô ăn quan).
 * 4. TỰ ĐỘNG ĐỒNG BỘ PROFILE (P2.1c):
 *    Sau khi xác thực hoặc khi nhận sự kiện `USER_UPDATED` (nâng cấp Google),
 *    store tự động nạp hồ sơ từ `profileRepository` để đồng bộ tên và avatar ngay lập tức.
 * ==============================================================================
 */

import { create } from 'zustand';
import {
  getSession,
  getUser,
  signInAnonymously,
  signInWithGoogle as repoSignInWithGoogle,
  linkGoogleToAnonymous as repoLinkGoogleToAnonymous,
  signOut as repoSignOut,
  onAuthStateChange,
  type AppAuthUser,
} from '@/repositories/authRepository';
import {
  getMyProfile,
  updateDisplayName as repoUpdateDisplayName,
  type Profile,
} from '@/repositories/profileRepository';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthState {
  /** Thông tin xác thực người dùng hiện tại */
  readonly user: AppAuthUser | null;
  /** Thông tin hồ sơ người dùng từ bảng public.profiles (P2.1c) */
  readonly profile: Profile | null;
  /** Trạng thái xác thực */
  readonly status: AuthStatus;
  /** Thông điệp lỗi gần nhất (nếu có) */
  readonly error: string | null;
  /** Cờ báo store đã hoàn thành khởi tạo lần đầu */
  readonly isInitialized: boolean;

  /** Khởi tạo phiên làm việc ban đầu (gọi 1 lần duy nhất từ App root) */
  readonly init: () => Promise<void>;
  /** Nạp thông tin hồ sơ Profile từ cơ sở dữ liệu */
  readonly loadProfile: () => Promise<Profile | null>;
  /** Cập nhật tên hiển thị của người dùng */
  readonly updateDisplayName: (name: string) => Promise<void>;
  /** Đăng nhập trực tiếp bằng Google OAuth */
  readonly signInWithGoogle: (options?: { redirectTo?: string }) => Promise<void>;
  /** Nâng cấp tài khoản khách ẩn danh hiện tại lên Google (giữ nguyên user id) */
  readonly linkGoogle: (options?: { redirectTo?: string }) => Promise<void>;
  /** Đăng xuất tài khoản (tự động cấp lại phiên khách mới để app luôn sẵn sàng) */
  readonly signOut: () => Promise<void>;
  /** Xóa thông điệp lỗi */
  readonly clearError: () => void;
}

// Biến nội bộ chống race-condition và double-init trong React StrictMode
let isInitializing = false;
let authSubscriptionCleanup: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  status: 'loading',
  error: null,
  isInitialized: false,

  loadProfile: async () => {
    try {
      const profile = await getMyProfile();
      set({ profile });
      return profile;
    } catch {
      // Khi bảng profiles chưa tạo hoặc lỗi mạng offline, không throw để bảo vệ Offline-First
      return null;
    }
  },

  updateDisplayName: async (name: string) => {
    set({ error: null });
    try {
      const updatedProfile = await repoUpdateDisplayName(name);
      set((state) => ({
        profile: updatedProfile,
        user: state.user ? { ...state.user, displayName: updatedProfile.displayName } : null,
      }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Cập nhật tên hiển thị thất bại.';
      set({ error: errorMessage });
      throw err;
    }
  },

  init: async () => {
    // Chống gọi init trùng lặp khi đang chạy hoặc đã khởi tạo
    if (isInitializing || get().isInitialized) {
      return;
    }

    isInitializing = true;
    set({ status: 'loading', error: null });

    try {
      // 1. Kiểm tra session hiện có trong Supabase storage
      const session = await getSession();

      if (session) {
        // Đã có phiên đăng nhập -> lấy thông tin user
        const currentUser = await getUser();
        set({
          user: currentUser,
          status: 'authenticated',
          isInitialized: true,
          error: null,
        });
      } else {
        // Chưa có phiên -> Tự động đăng nhập Khách Ẩn Danh (Anonymous)
        const anonUser = await signInAnonymously();
        set({
          user: anonUser,
          status: 'authenticated',
          isInitialized: true,
          error: null,
        });
      }

      // Tự động nạp profile chạy ngầm
      void get().loadProfile();

      // 2. Đăng ký lắng nghe sự kiện Auth nếu chưa đăng ký
      if (!authSubscriptionCleanup) {
        const { unsubscribe } = onAuthStateChange((event, user) => {
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
            set({
              user,
              status: 'authenticated',
              error: null,
            });
            // Reload profile khi có thay đổi trạng thái xác thực
            void get().loadProfile();
          } else if (event === 'SIGNED_OUT') {
            set({
              user: null,
              profile: null,
              status: 'unauthenticated',
            });
          }
        });
        authSubscriptionCleanup = unsubscribe;
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Không thể khởi tạo phiên xác thực người dùng.';
      set({
        status: 'error',
        error: errorMessage,
        isInitialized: true,
      });
    } finally {
      isInitializing = false;
    }
  },

  signInWithGoogle: async (options) => {
    set({ error: null });
    try {
      await repoSignInWithGoogle(options);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Đăng nhập Google thất bại.';
      set({ error: errorMessage });
      throw err;
    }
  },

  linkGoogle: async (options) => {
    set({ error: null });
    try {
      await repoLinkGoogleToAnonymous(options);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Nâng cấp tài khoản Google thất bại.';
      set({ error: errorMessage });
      throw err;
    }
  },

  signOut: async () => {
    set({ status: 'loading', error: null, profile: null });
    try {
      await repoSignOut();
      // Sau khi đăng xuất, tự động tạo lại phiên khách ẩn danh mới
      const newAnonUser = await signInAnonymously();
      set({
        user: newAnonUser,
        status: 'authenticated',
        error: null,
      });
      // Tải profile cho tài khoản khách mới
      void get().loadProfile();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Đăng xuất thất bại.';
      set({ status: 'error', error: errorMessage });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));

/**
 * Hook tiện ích lấy thông tin người dùng hiện tại.
 */
export const useAuthUser = () => useAuthStore((state) => state.user);

/**
 * Hook tiện ích lấy thông tin Profile hiện tại.
 */
export const useAuthProfile = () => useAuthStore((state) => state.profile);

/**
 * Hook tiện ích lấy tên hiển thị ưu tiên (Profile -> User -> Mặc định).
 */
export const useDisplayName = () =>
  useAuthStore((state) => {
    if (state.profile?.displayName) return state.profile.displayName;
    if (state.user?.displayName) return state.user.displayName;
    return state.user?.isAnonymous ? 'Người chơi khách' : 'Người chơi';
  });

/**
 * Hook tiện ích kiểm tra xem người dùng có đang ở chế độ khách ẩn danh hay không.
 */
export const useIsAnonymous = () => useAuthStore((state) => Boolean(state.user?.isAnonymous));

/**
 * Hook tiện ích kiểm tra xem người dùng đã liên kết với nhà cung cấp chính thức (Google) chưa.
 */
export const useIsSignedInWithProvider = () =>
  useAuthStore((state) => Boolean(state.user && !state.user.isAnonymous));

/**
 * Hook tiện ích lấy trạng thái xác thực.
 */
export const useAuthStatus = () => useAuthStore((state) => state.status);

/**
 * Hàm hỗ trợ reset state và cờ khởi tạo phục vụ kiểm thử Unit Test.
 */
export function _resetAuthStoreForTesting(): void {
  isInitializing = false;
  if (authSubscriptionCleanup) {
    authSubscriptionCleanup();
    authSubscriptionCleanup = null;
  }
  useAuthStore.setState({
    user: null,
    profile: null,
    status: 'loading',
    error: null,
    isInitialized: false,
  });
}
