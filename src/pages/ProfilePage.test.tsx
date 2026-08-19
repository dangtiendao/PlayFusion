// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';
import { useAuthStore, _resetAuthStoreForTesting } from '../stores/authStore';
import * as gameLocalDataModule from '../core/gameLocalData';

describe('ProfilePage Component Tests (ProfilePage.tsx - P2.1c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetAuthStoreForTesting();

    // Default guest user
    useAuthStore.setState({
      user: {
        id: 'anon-user-1234-abcd',
        isAnonymous: true,
        provider: 'anonymous',
      },
      profile: {
        id: 'anon-user-1234-abcd',
        userId: 'anon-user-1234-abcd',
        displayName: 'Khách-123456',
        avatarUrl: null,
        role: 'player',
        isAnonymous: true,
        createdAt: '2026-08-18T10:00:00.000Z',
        updatedAt: '2026-08-18T10:00:00.000Z',
      },
      status: 'authenticated',
      isInitialized: true,
      error: null,
    });
  });

  it('1. Render đầy đủ thông tin tài khoản khách: tên hiển thị, nhãn Khách, ID rút gọn', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });

    expect(screen.getByTestId('profile-card')).not.toBeNull();
    expect(screen.getByTestId('profile-display-name').textContent).toBe('Khách-123456');
    expect(screen.getByTestId('profile-status-badge').textContent).toBe('Khách (Ẩn danh)');
    expect(screen.getByText(/ID: anon-use\.\.\.abcd/i)).not.toBeNull();
  });

  it('2. Hiển thị banner nâng cấp Google khi đang ở tài khoản khách', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });

    expect(screen.getByTestId('google-upgrade-banner')).not.toBeNull();
    expect(screen.getByText('Đăng Nhập Tài Khoản Google')).not.toBeNull();
    expect(screen.getByTestId('google-signin-btn')).not.toBeNull();
  });

  it('3. Bấm nút Đăng nhập Google kích hoạt hàm linkGoogle', async () => {
    const linkSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ linkGoogle: linkSpy });

    await act(async () => {
      render(<ProfilePage />);
    });

    const btn = screen.getByTestId('google-signin-btn');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(linkSpy).toHaveBeenCalled();
  });

  it('4. Hiển thị thông tin tài khoản Google khi đã đăng nhập chính thức (ẩn banner)', async () => {
    useAuthStore.setState({
      user: {
        id: 'google-user-9999-wxyz',
        isAnonymous: false,
        email: 'player@gmail.com',
        displayName: 'VuaCờCaro',
        avatarUrl: 'https://example.com/avatar.png',
        provider: 'google',
      },
      profile: {
        id: 'google-user-9999-wxyz',
        userId: 'google-user-9999-wxyz',
        displayName: 'VuaCờCaro',
        avatarUrl: 'https://example.com/avatar.png',
        role: 'player',
        isAnonymous: false,
        createdAt: '2026-08-18T10:00:00.000Z',
        updatedAt: '2026-08-18T10:00:00.000Z',
      },
      status: 'authenticated',
      isInitialized: true,
    });

    await act(async () => {
      render(<ProfilePage />);
    });

    expect(screen.getByTestId('profile-display-name').textContent).toBe('VuaCờCaro');
    expect(screen.getByTestId('profile-status-badge').textContent).toBe('Google Account');
    expect(screen.getByText(/✉️ player@gmail\.com/i)).not.toBeNull();
    expect(screen.queryByTestId('google-upgrade-banner')).toBeNull();
    expect(screen.getByTestId('profile-sign-out-btn')).not.toBeNull();
  });

  it('5. Đổi tên hiển thị: Validate client-side báo lỗi khi tên rỗng hoặc ngắn hơn 2 ký tự', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });

    const input = screen.getByTestId('display-name-input');
    const form = input.closest('form');
    expect(form).not.toBeNull();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'A' } });
    });

    if (form) {
      await act(async () => {
        fireEvent.submit(form);
      });
    }

    expect(screen.getByTestId('name-error-banner')).not.toBeNull();
    expect(screen.getByText(/Tên hiển thị phải có độ dài từ 2 đến 20 ký tự/i)).not.toBeNull();
  });

  it('6. Đổi tên hiển thị thành công: gọi updateDisplayName và hiển thị thông báo thành công', async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ updateDisplayName: updateSpy });

    await act(async () => {
      render(<ProfilePage />);
    });

    const input = screen.getByTestId('display-name-input');
    const form = input.closest('form');
    expect(form).not.toBeNull();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ChiếnThầnCaro' } });
    });

    if (form) {
      await act(async () => {
        fireEvent.submit(form);
      });
    }

    expect(updateSpy).toHaveBeenCalledWith('ChiếnThầnCaro');
    expect(screen.getByTestId('name-success-banner')).not.toBeNull();
    expect(screen.getByText(/Cập nhật tên hiển thị thành công!/i)).not.toBeNull();
  });

  it('7. Hiển thị khối thống kê thành tích offline khi có dữ liệu game cục bộ', async () => {
    vi.spyOn(gameLocalDataModule, 'hasGameData').mockImplementation((gameId) => gameId === 'caro');
    vi.spyOn(gameLocalDataModule, 'getStats').mockReturnValue({
      totalMatches: 10,
      wins: 7,
      losses: 3,
      draws: 0,
      currentStreak: 2,
      bestStreak: 5,
      byMode: {},
      updatedAt: '2026-08-18T10:00:00.000Z',
    });

    await act(async () => {
      render(<ProfilePage />);
    });

    expect(screen.getByTestId('stats-card-caro')).not.toBeNull();
    expect(screen.getByText('10 ván đã đấu')).not.toBeNull();
    expect(screen.getByText('70%')).not.toBeNull();
    expect(screen.getByText('5 🔥')).not.toBeNull();
  });
});
