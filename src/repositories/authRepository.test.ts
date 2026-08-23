// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, Session } from '@supabase/supabase-js';

import * as authRepo from './authRepository';
import { supabase } from './supabaseClient';

describe('Auth Repository Unit Tests (authRepository.ts - P2.1b)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatAuthUser', () => {
    it('1. Trả về null nếu đầu vào user là null', () => {
      expect(authRepo.formatAuthUser(null)).toBeNull();
    });

    it('2. Định dạng chính xác tài khoản khách ẩn danh (Anonymous User)', () => {
      const mockUser: User = {
        id: 'anon-user-uuid-123',
        is_anonymous: true,
        app_metadata: { provider: 'anonymous' },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      };

      const result = authRepo.formatAuthUser(mockUser);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('anon-user-uuid-123');
      expect(result?.isAnonymous).toBe(true);
      expect(result?.email).toBeUndefined();
      expect(result?.provider).toBe('anonymous');
    });

    it('3. Định dạng chính xác tài khoản Google có email, displayName, avatarUrl', () => {
      const mockUser: User = {
        id: 'google-user-uuid-456',
        is_anonymous: false,
        email: 'player@example.com',
        app_metadata: { provider: 'google' },
        user_metadata: {
          full_name: 'Nguyễn Văn A',
          avatar_url: 'https://lh3.googleusercontent.com/a/avatar.jpg',
        },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      };

      const result = authRepo.formatAuthUser(mockUser);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('google-user-uuid-456');
      expect(result?.isAnonymous).toBe(false);
      expect(result?.email).toBe('player@example.com');
      expect(result?.displayName).toBe('Nguyễn Văn A');
      expect(result?.avatarUrl).toBe('https://lh3.googleusercontent.com/a/avatar.jpg');
      expect(result?.provider).toBe('google');
    });

    it('3b. Định dạng chính xác tài khoản khách sau khi đã liên kết Google (is_anonymous=true cũ nhưng có identity Google)', () => {
      const mockUser: User = {
        id: 'anon-user-linked-789',
        is_anonymous: true,
        email: 'linked_user@gmail.com',
        app_metadata: { provider: 'anonymous', providers: ['anonymous', 'google'] },
        identities: [
          {
            id: '1',
            identity_id: '1',
            user_id: 'anon-user-linked-789',
            identity_data: {},
            provider: 'anonymous',
            last_sign_in_at: '',
            created_at: '',
            updated_at: '',
          },
          {
            id: '2',
            identity_id: '2',
            user_id: 'anon-user-linked-789',
            identity_data: {},
            provider: 'google',
            last_sign_in_at: '',
            created_at: '',
            updated_at: '',
          },
        ],
        user_metadata: {
          full_name: 'Trần Văn B',
          avatar_url: 'https://lh3.googleusercontent.com/a/avatar2.jpg',
        },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      };

      const result = authRepo.formatAuthUser(mockUser);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('anon-user-linked-789');
      expect(result?.isAnonymous).toBe(false);
      expect(result?.email).toBe('linked_user@gmail.com');
      expect(result?.displayName).toBe('Trần Văn B');
      expect(result?.avatarUrl).toBe('https://lh3.googleusercontent.com/a/avatar2.jpg');
      expect(result?.provider).toBe('google');
    });
  });

  describe('getSession & getUser', () => {
    it('4. getSession trả về session khi có phiên đăng nhập', async () => {
      const mockSession = { access_token: 'token-123' } as Session;
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const session = await authRepo.getSession();
      expect(session).toBe(mockSession);
    });

    it('5. getUser trả về formatted user khi có user', async () => {
      const mockUser = {
        id: 'user-789',
        is_anonymous: false,
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;

      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const user = await authRepo.getUser();
      expect(user?.id).toBe('user-789');
      expect(user?.email).toBe('test@example.com');
    });
  });

  describe('signInAnonymously', () => {
    it('6. signInAnonymously thành công trả về AppAuthUser ẩn danh', async () => {
      const mockUser = {
        id: 'anon-id-999',
        is_anonymous: true,
        app_metadata: { provider: 'anonymous' },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;

      vi.spyOn(supabase.auth, 'signInAnonymously').mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      const user = await authRepo.signInAnonymously();
      expect(user.id).toBe('anon-id-999');
      expect(user.isAnonymous).toBe(true);
    });

    it('7. signInAnonymously ném lỗi tiếng Việt khi anonymous provider bị tắt', async () => {
      vi.spyOn(supabase.auth, 'signInAnonymously').mockResolvedValue({
        data: { user: null, session: null },
        error: {
          message: 'Anonymous provider disabled',
          name: 'AuthApiError',
          status: 400,
        } as unknown as null,
      });

      await expect(authRepo.signInAnonymously()).rejects.toThrowError(
        /Chế độ đăng nhập ẩn danh chưa được bật/i,
      );
    });
  });

  describe('signInWithGoogle & linkGoogleToAnonymous', () => {
    it('8. signInWithGoogle gọi supabase.auth.signInWithOAuth với provider google', async () => {
      const oauthSpy = vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValue({
        data: { provider: 'google', url: 'https://accounts.google.com/oauth' },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>);

      await authRepo.signInWithGoogle({ redirectTo: 'http://localhost:5173' });

      expect(oauthSpy).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'http://localhost:5173' },
      });
    });

    it('9. linkGoogleToAnonymous gọi supabase.auth.linkIdentity với provider google', async () => {
      const linkSpy = vi.spyOn(supabase.auth, 'linkIdentity').mockResolvedValue({
        data: { provider: 'google', url: 'https://accounts.google.com/link' },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.linkIdentity>>);

      await authRepo.linkGoogleToAnonymous({ redirectTo: 'http://localhost:5173' });

      expect(linkSpy).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'http://localhost:5173' },
      });
    });

    it('10. linkGoogleToAnonymous ném lỗi tiếng Việt khi Google account đã bị user khác dùng', async () => {
      vi.spyOn(supabase.auth, 'linkIdentity').mockResolvedValue({
        data: { provider: 'google', url: '' },
        error: {
          message: 'identity_already_exists: Identity already belongs to another user',
          name: 'AuthApiError',
          status: 422,
        },
      } as unknown as Awaited<ReturnType<typeof supabase.auth.linkIdentity>>);

      await expect(authRepo.linkGoogleToAnonymous()).rejects.toThrowError(
        /Tài khoản Google này đã được liên kết với một tài khoản người dùng khác/i,
      );
    });
  });

  describe('signOut & onAuthStateChange', () => {
    it('11. signOut gọi supabase.auth.signOut', async () => {
      const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({
        error: null,
      });

      await authRepo.signOut();
      expect(signOutSpy).toHaveBeenCalled();
    });

    it('12. onAuthStateChange đăng ký và trả về hàm unsubscribe', () => {
      const unsubscribeMock = vi.fn();
      vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
        data: { subscription: { unsubscribe: unsubscribeMock, id: 'sub-1', callback: vi.fn() } },
      });

      const { unsubscribe } = authRepo.onAuthStateChange(vi.fn());
      unsubscribe();

      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});
