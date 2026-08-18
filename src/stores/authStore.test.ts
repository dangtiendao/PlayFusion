// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { useAuthStore, _resetAuthStoreForTesting } from './authStore';
import * as authRepo from '@/repositories/authRepository';

describe('Auth Store Unit Tests (authStore.ts - P2.1b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetAuthStoreForTesting();
  });

  it('1. init khi chưa có session -> tự động gọi signInAnonymously và chuyển sang authenticated', async () => {
    const mockAnonUser: authRepo.AppAuthUser = {
      id: 'anon-id-123',
      isAnonymous: true,
      provider: 'anonymous',
    };

    vi.spyOn(authRepo, 'getSession').mockResolvedValue(null);
    const anonSpy = vi.spyOn(authRepo, 'signInAnonymously').mockResolvedValue(mockAnonUser);
    vi.spyOn(authRepo, 'onAuthStateChange').mockReturnValue({ unsubscribe: vi.fn() });

    await useAuthStore.getState().init();

    expect(anonSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockAnonUser);
    expect(useAuthStore.getState().isInitialized).toBe(true);
  });

  it('2. init khi ĐÃ có session -> lấy thông tin user hiện tại và KHÔNG gọi signInAnonymously', async () => {
    const mockExistingUser: authRepo.AppAuthUser = {
      id: 'existing-google-id-456',
      isAnonymous: false,
      email: 'user@gmail.com',
      displayName: 'Player One',
      provider: 'google',
    };

    vi.spyOn(authRepo, 'getSession').mockResolvedValue({ access_token: 'valid-token' } as Session);
    vi.spyOn(authRepo, 'getUser').mockResolvedValue(mockExistingUser);
    const anonSpy = vi.spyOn(authRepo, 'signInAnonymously');
    vi.spyOn(authRepo, 'onAuthStateChange').mockReturnValue({ unsubscribe: vi.fn() });

    await useAuthStore.getState().init();

    expect(anonSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockExistingUser);
  });

  it('3. onAuthStateChange SIGNED_IN -> cập nhật store với thông tin user Google', async () => {
    let authCallback = (_event: AuthChangeEvent, _user: authRepo.AppAuthUser | null): void => {
      void _event;
      void _user;
    };

    vi.spyOn(authRepo, 'getSession').mockResolvedValue(null);
    vi.spyOn(authRepo, 'signInAnonymously').mockResolvedValue({
      id: 'anon-id-123',
      isAnonymous: true,
    });
    vi.spyOn(authRepo, 'onAuthStateChange').mockImplementation((cb) => {
      authCallback = cb;
      return { unsubscribe: vi.fn() };
    });

    await useAuthStore.getState().init();

    // Giả lập sự kiện người dùng hoàn tất Google OAuth
    const googleUser: authRepo.AppAuthUser = {
      id: 'anon-id-123', // User ID giữ nguyên khi link identity
      isAnonymous: false,
      email: 'upgraded@gmail.com',
      displayName: 'Upgraded Player',
      provider: 'google',
    };

    authCallback('SIGNED_IN', googleUser);

    expect(useAuthStore.getState().user).toEqual(googleUser);
    expect(useAuthStore.getState().user?.isAnonymous).toBe(false);
  });

  it('4. signOut -> gọi repoSignOut và tự động cấp lại phiên khách mới', async () => {
    const signOutSpy = vi.spyOn(authRepo, 'signOut').mockResolvedValue();
    const newAnonUser: authRepo.AppAuthUser = {
      id: 'new-anon-789',
      isAnonymous: true,
      provider: 'anonymous',
    };
    vi.spyOn(authRepo, 'signInAnonymously').mockResolvedValue(newAnonUser);

    await useAuthStore.getState().signOut();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toEqual(newAnonUser);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('5. linkGoogle gọi repoLinkGoogleToAnonymous và bắt lỗi nếu thất bại', async () => {
    vi.spyOn(authRepo, 'linkGoogleToAnonymous').mockRejectedValue(
      new Error('Tài khoản Google này đã được liên kết với một tài khoản người dùng khác.'),
    );

    await expect(useAuthStore.getState().linkGoogle()).rejects.toThrowError(
      /Tài khoản Google này đã được liên kết/i,
    );

    expect(useAuthStore.getState().error).toContain('Tài khoản Google này đã được liên kết');
  });

  it('6. StrictMode: Gọi init 2 lần liên tiếp chỉ chạy logic đúng 1 lần', async () => {
    vi.spyOn(authRepo, 'getSession').mockResolvedValue(null);
    const anonSpy = vi.spyOn(authRepo, 'signInAnonymously').mockResolvedValue({
      id: 'anon-1',
      isAnonymous: true,
    });
    vi.spyOn(authRepo, 'onAuthStateChange').mockReturnValue({ unsubscribe: vi.fn() });

    // Gọi đồng thời 2 lần (mô phỏng React StrictMode mount)
    await Promise.all([useAuthStore.getState().init(), useAuthStore.getState().init()]);

    expect(anonSpy).toHaveBeenCalledTimes(1);
  });
});
