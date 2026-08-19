// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore, _resetAuthStoreForTesting } from './authStore';
import * as authRepo from '@/repositories/authRepository';
import * as profileRepo from '@/repositories/profileRepository';

describe('Auth Store Unit Tests (authStore.ts - P2.1b & P2.1c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetAuthStoreForTesting();
  });

  it('1. init khi chưa có session -> tự động gọi signInAnonymously và loadProfile', async () => {
    const mockAnonUser: authRepo.AppAuthUser = {
      id: 'anon-id-123',
      isAnonymous: true,
      provider: 'anonymous',
    };
    const mockProfile: profileRepo.Profile = {
      id: 'anon-id-123',
      userId: 'anon-id-123',
      displayName: 'Khách-123456',
      avatarUrl: null,
      role: 'player',
      isAnonymous: true,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:00:00.000Z',
    };

    vi.spyOn(authRepo, 'getSession').mockResolvedValue(null);
    const anonSpy = vi.spyOn(authRepo, 'signInAnonymously').mockResolvedValue(mockAnonUser);
    const profileSpy = vi.spyOn(profileRepo, 'getMyProfile').mockResolvedValue(mockProfile);
    vi.spyOn(authRepo, 'onAuthStateChange').mockReturnValue({ unsubscribe: vi.fn() });

    await useAuthStore.getState().init();

    expect(anonSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockAnonUser);
    expect(useAuthStore.getState().isInitialized).toBe(true);

    // Profile được nạp thành công
    await useAuthStore.getState().loadProfile();
    expect(profileSpy).toHaveBeenCalled();
    expect(useAuthStore.getState().profile).toEqual(mockProfile);
  });

  it('2. init khi ĐÃ có session -> lấy thông tin user hiện tại và nạp profile', async () => {
    const mockExistingUser: authRepo.AppAuthUser = {
      id: 'existing-google-id-456',
      isAnonymous: false,
      email: 'user@gmail.com',
      displayName: 'Player One',
      provider: 'google',
    };
    const mockProfile: profileRepo.Profile = {
      id: 'existing-google-id-456',
      userId: 'existing-google-id-456',
      displayName: 'Player One',
      avatarUrl: 'https://example.com/avatar.jpg',
      role: 'player',
      isAnonymous: false,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:00:00.000Z',
    };

    vi.spyOn(authRepo, 'getSession').mockResolvedValue({
      access_token: 'valid-token',
    } as unknown as Awaited<ReturnType<typeof authRepo.getSession>>);
    vi.spyOn(authRepo, 'getUser').mockResolvedValue(mockExistingUser);
    const anonSpy = vi.spyOn(authRepo, 'signInAnonymously');
    vi.spyOn(profileRepo, 'getMyProfile').mockResolvedValue(mockProfile);
    vi.spyOn(authRepo, 'onAuthStateChange').mockReturnValue({ unsubscribe: vi.fn() });

    await useAuthStore.getState().init();

    expect(anonSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockExistingUser);
  });

  it('3. onAuthStateChange SIGNED_IN -> cập nhật store và reload profile', async () => {
    type AuthChangeCallback = Parameters<typeof authRepo.onAuthStateChange>[0];
    let authCallback: AuthChangeCallback = () => {
      /* noop */
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

    const googleUser: authRepo.AppAuthUser = {
      id: 'anon-id-123',
      isAnonymous: false,
      email: 'upgraded@gmail.com',
      displayName: 'Upgraded Player',
      provider: 'google',
    };
    const upgradedProfile: profileRepo.Profile = {
      id: 'anon-id-123',
      userId: 'anon-id-123',
      displayName: 'Upgraded Player',
      avatarUrl: 'https://google.com/photo.jpg',
      role: 'player',
      isAnonymous: false,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:05:00.000Z',
    };

    const loadProfileSpy = vi.spyOn(profileRepo, 'getMyProfile').mockResolvedValue(upgradedProfile);

    authCallback('SIGNED_IN', googleUser);

    expect(useAuthStore.getState().user).toEqual(googleUser);
    expect(useAuthStore.getState().user?.isAnonymous).toBe(false);
    expect(loadProfileSpy).toHaveBeenCalled();
  });

  it('4. updateDisplayName cập nhật profile trong store và user.displayName', async () => {
    const updatedProfile: profileRepo.Profile = {
      id: 'user-1',
      userId: 'user-1',
      displayName: 'TênMới123',
      avatarUrl: null,
      role: 'player',
      isAnonymous: false,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:10:00.000Z',
    };

    useAuthStore.setState({
      user: { id: 'user-1', isAnonymous: false, displayName: 'TênCũ' },
      profile: null,
    });

    vi.spyOn(profileRepo, 'updateDisplayName').mockResolvedValue(updatedProfile);

    await useAuthStore.getState().updateDisplayName('TênMới123');

    expect(useAuthStore.getState().profile).toEqual(updatedProfile);
    expect(useAuthStore.getState().user?.displayName).toBe('TênMới123');
  });

  it('5. signOut -> gọi repoSignOut và tự động cấp lại phiên khách mới', async () => {
    const signOutSpy = vi.spyOn(authRepo, 'signOut').mockResolvedValue();
    const newAnonUser: authRepo.AppAuthUser = {
      id: 'new-anon-789',
      isAnonymous: true,
      provider: 'anonymous',
    };
    vi.spyOn(authRepo, 'signInAnonymously').mockResolvedValue(newAnonUser);
    vi.spyOn(profileRepo, 'getMyProfile').mockResolvedValue(null);

    await useAuthStore.getState().signOut();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toEqual(newAnonUser);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('6. linkGoogle gọi repoLinkGoogleToAnonymous và bắt lỗi nếu thất bại', async () => {
    vi.spyOn(authRepo, 'linkGoogleToAnonymous').mockRejectedValue(
      new Error('Tài khoản Google này đã được liên kết với một tài khoản người dùng khác.'),
    );

    await expect(useAuthStore.getState().linkGoogle()).rejects.toThrowError(
      /Tài khoản Google này đã được liên kết/i,
    );

    expect(useAuthStore.getState().error).toContain('Tài khoản Google này đã được liên kết');
  });

  it('7. StrictMode: Gọi init 2 lần liên tiếp chỉ chạy logic đúng 1 lần', async () => {
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
