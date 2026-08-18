// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@supabase/supabase-js';
import * as profileRepo from './profileRepository';
import { supabase } from './supabaseClient';

describe('Profile Repository Unit Tests (profileRepository.ts - P2.1c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMyProfile', () => {
    it('1. Trả về null nếu chưa có phiên đăng nhập (getUser trả về null)', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      const profile = await profileRepo.getMyProfile();
      expect(profile).toBeNull();
    });

    it('2. Trả về null nếu bảng profiles chưa có bản ghi cho user này', async () => {
      const mockUser = { id: 'test-user-id-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const profile = await profileRepo.getMyProfile();
      expect(profile).toBeNull();
    });

    it('3. Trả về đối tượng Profile hoàn chỉnh khi tìm thấy bản ghi DB', async () => {
      const mockUser = { id: 'test-user-id-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockDbRow = {
        user_id: 'test-user-id-123',
        display_name: 'Khách-123456',
        avatar_url: null,
        role: 'player' as const,
        is_anonymous: true,
        created_at: '2026-08-18T10:00:00.000Z',
        updated_at: '2026-08-18T10:00:00.000Z',
      };

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockDbRow, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const profile = await profileRepo.getMyProfile();
      expect(profile).not.toBeNull();
      expect(profile?.userId).toBe('test-user-id-123');
      expect(profile?.displayName).toBe('Khách-123456');
      expect(profile?.role).toBe('player');
      expect(profile?.isAnonymous).toBe(true);
    });

    it('4. Ném lỗi tiếng Việt khi truy vấn bảng profiles bị lỗi', async () => {
      const mockUser = { id: 'test-user-id-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection error' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(profileRepo.getMyProfile()).rejects.toThrowError(
        /Không thể tải thông tin hồ sơ: Database connection error/i,
      );
    });
  });

  describe('updateDisplayName', () => {
    it('5. Fail-Fast: Ném lỗi client validation nếu tên rỗng hoặc toàn khoảng trắng', async () => {
      await expect(profileRepo.updateDisplayName('')).rejects.toThrowError(
        /Tên hiển thị phải có độ dài từ 2 đến 20 ký tự/i,
      );
      await expect(profileRepo.updateDisplayName('   ')).rejects.toThrowError(
        /Tên hiển thị phải có độ dài từ 2 đến 20 ký tự/i,
      );
    });

    it('6. Fail-Fast: Ném lỗi client validation nếu tên ngắn hơn 2 ký tự hoặc dài hơn 20 ký tự', async () => {
      await expect(profileRepo.updateDisplayName('A')).rejects.toThrowError(
        /Tên hiển thị phải có độ dài từ 2 đến 20 ký tự/i,
      );
      await expect(
        profileRepo.updateDisplayName(
          'Đây là một cái tên quá dài vượt quá hai mươi ký tự quy định',
        ),
      ).rejects.toThrowError(/Tên hiển thị phải có độ dài từ 2 đến 20 ký tự/i);
    });

    it('7. Ném lỗi nếu chưa đăng nhập khi gọi updateDisplayName', async () => {
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.auth.getUser>>);

      await expect(profileRepo.updateDisplayName('GameThủ99')).rejects.toThrowError(
        /Bạn cần đăng nhập để cập nhật thông tin hồ sơ/i,
      );
    });

    it('8. Cập nhật thành công tên hiển thị và trả về Profile mới', async () => {
      const mockUser = { id: 'user-abc-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const updatedRow = {
        user_id: 'user-abc-123',
        display_name: 'CaoThủCaro',
        avatar_url: 'https://example.com/avatar.jpg',
        role: 'player' as const,
        is_anonymous: false,
        created_at: '2026-08-18T10:00:00.000Z',
        updated_at: '2026-08-18T10:05:00.000Z',
      };

      const mockQueryBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      const result = await profileRepo.updateDisplayName('  CaoThủCaro  ');

      expect(mockQueryBuilder.update).toHaveBeenCalledWith({ display_name: 'CaoThủCaro' });
      expect(result.displayName).toBe('CaoThủCaro');
      expect(result.updatedAt).toBe('2026-08-18T10:05:00.000Z');
    });

    it('9. Bắt lỗi check constraint từ cơ sở dữ liệu và hiển thị thông báo tiếng Việt', async () => {
      const mockUser = { id: 'user-abc-123' } as User;
      vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const mockQueryBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'new row for relation "profiles" violates check constraint' },
        }),
      };
      vi.spyOn(supabase, 'from').mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof supabase.from>,
      );

      await expect(profileRepo.updateDisplayName('TênHợpLệ')).rejects.toThrowError(
        /Tên hiển thị không hợp lệ\. Vui lòng chọn tên từ 2 đến 20 ký tự\./i,
      );
    });
  });
});
