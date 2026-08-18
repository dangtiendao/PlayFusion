// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import * as gameLocalDataModule from '../core/gameLocalData';
import * as healthRepoModule from '../repositories/healthRepository';
import { useAuthStore, _resetAuthStoreForTesting } from '../stores/authStore';

describe('SettingsPage Component Tests (SettingsPage.tsx - P0.8, P1.5c, P2.1a & P2.1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAuthStoreForTesting();
    vi.spyOn(healthRepoModule, 'checkConnection').mockResolvedValue({
      ok: true,
      latencyMs: 45,
      projectRef: 'mock-dev-ref',
    });
    // Set default anonymous user in authStore
    useAuthStore.setState({
      user: {
        id: 'anon-user-12345678-abcd',
        isAnonymous: true,
        provider: 'anonymous',
      },
      status: 'authenticated',
      isInitialized: true,
      error: null,
    });
  });

  it('1. Render đầy đủ các nhóm cài đặt: Tài khoản, Theme, Âm thanh & Rung, Chẩn đoán, Dữ liệu trò chơi, Phiên bản', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByTestId('auth-account-section')).not.toBeNull();
    expect(screen.getByText(/Giao diện hiển thị \(Theme\)/i)).not.toBeNull();
    expect(screen.getByText(/Âm thanh & Rung phản hồi/i)).not.toBeNull();
    expect(screen.getByTestId('server-connection-card')).not.toBeNull();
    expect(screen.getByTestId('game-data-settings-section')).not.toBeNull();
    expect(screen.getByText(/Dữ liệu trò chơi cục bộ/i)).not.toBeNull();
    expect(screen.getByText(/Phiên bản Ứng dụng/i)).not.toBeNull();
  });

  it('2. Hiển thị thông tin tài khoản Khách ẩn danh kèm nút Đăng nhập Google (P2.1b)', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText('Khách (Ẩn danh)')).not.toBeNull();
    expect(screen.getByText(/ID: anon-use\.\.\.abcd/i)).not.toBeNull();
    expect(screen.getByTestId('link-google-btn')).not.toBeNull();
    expect(screen.getByTestId('sign-out-btn')).not.toBeNull();
  });

  it('3. Bấm nút "Đăng nhập Google" khi đang ở tài khoản khách gọi linkGoogle (P2.1b)', async () => {
    const linkSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      linkGoogle: linkSpy,
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    const googleBtn = screen.getByTestId('link-google-btn');
    await act(async () => {
      fireEvent.click(googleBtn);
    });

    expect(linkSpy).toHaveBeenCalled();
  });

  it('4. Đăng xuất tài khoản khách mở modal xác nhận trước khi gọi signOut (P2.1b)', async () => {
    const signOutSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      signOut: signOutSpy,
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    const signOutBtn = screen.getByTestId('sign-out-btn');
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    // Modal xác nhận xuất hiện
    expect(screen.getByText('Đăng xuất tài khoản khách?')).not.toBeNull();

    // Bấm nút "Xác nhận đăng xuất" trên modal
    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận đăng xuất' });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(signOutSpy).toHaveBeenCalled();
  });

  it('5. Hiển thị thông tin tài khoản Google khi đã đăng nhập chính thức (P2.1b)', async () => {
    useAuthStore.setState({
      user: {
        id: 'google-user-98765432-wxyz',
        isAnonymous: false,
        email: 'player@gmail.com',
        displayName: 'Nguyễn Văn Game',
        avatarUrl: 'https://example.com/avatar.png',
        provider: 'google',
      },
      status: 'authenticated',
      isInitialized: true,
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText('Google Account')).not.toBeNull();
    expect(screen.getByText('Nguyễn Văn Game')).not.toBeNull();
    expect(screen.getByText(/player@gmail\.com/i)).not.toBeNull();
    // Không có nút Link Google vì đã là tài khoản Google
    expect(screen.queryByTestId('link-google-btn')).toBeNull();
  });

  it('6. Hiển thị thông tin kết nối Supabase thành công kèm projectRef và độ trễ (P2.1a)', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Kết nối máy chủ: OK \(45ms\)/i)).not.toBeNull();
    expect(screen.getByTestId('project-ref-badge')).not.toBeNull();
    expect(screen.getByText(/ref: mock-dev-ref/i)).not.toBeNull();
  });

  it('7. Hiển thị thông báo thất bại khi kết nối Supabase bị lỗi (P2.1a)', async () => {
    vi.spyOn(healthRepoModule, 'checkConnection').mockResolvedValue({
      ok: false,
      latencyMs: 0,
      projectRef: 'mock-fail-ref',
      error: 'HTTP 503: Service Unavailable',
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Kết nối máy chủ: Thất bại/i)).not.toBeNull();
    expect(screen.getByText(/HTTP 503: Service Unavailable/i)).not.toBeNull();
  });

  it('8. Bấm nút "Đo lại" kích hoạt lại hàm checkConnection', async () => {
    const checkSpy = vi.spyOn(healthRepoModule, 'checkConnection').mockResolvedValue({
      ok: true,
      latencyMs: 30,
      projectRef: 'mock-dev-ref',
    });

    await act(async () => {
      render(<SettingsPage />);
    });

    const refreshBtn = screen.getByRole('button', { name: /Kiểm tra lại kết nối máy chủ/i });
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(checkSpy).toHaveBeenCalledTimes(2);
  });

  it('9. Hiển thị danh sách game có dữ liệu và thực hiện xóa dữ liệu khi xác nhận', async () => {
    vi.spyOn(gameLocalDataModule, 'hasGameData').mockImplementation((gameId) => gameId === 'caro');
    const clearSpy = vi.spyOn(gameLocalDataModule, 'clearGameData');

    await act(async () => {
      render(<SettingsPage />);
    });

    // Kiểm tra hàng game caro xuất hiện
    expect(screen.getByTestId('game-data-row-caro')).not.toBeNull();
    expect(screen.getByText('Cờ Caro')).not.toBeNull();

    // Bấm nút Xóa dữ liệu
    const clearBtn = screen.getByTestId('clear-game-data-btn-caro');
    act(() => {
      fireEvent.click(clearBtn);
    });

    // Modal xác nhận xuất hiện
    expect(screen.getByText('Xác nhận xóa dữ liệu?')).not.toBeNull();
    expect(
      screen.getByText(/Xóa toàn bộ thống kê, lịch sử và ván dở của "Cờ Caro"/i),
    ).not.toBeNull();

    // Bấm nút "Xóa sạch" trên modal
    const confirmBtn = screen.getByText('Xóa sạch');
    act(() => {
      fireEvent.click(confirmBtn);
    });

    // clearGameData('caro') được gọi
    expect(clearSpy).toHaveBeenCalledWith('caro');
  });

  it('10. Hiển thị thông báo khi không có game nào có dữ liệu cục bộ', async () => {
    vi.spyOn(gameLocalDataModule, 'hasGameData').mockReturnValue(false);

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Hiện chưa có dữ liệu lưu trữ cục bộ nào cần xóa/i)).not.toBeNull();
  });
});
