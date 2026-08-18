// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import * as gameLocalDataModule from '../core/gameLocalData';
import * as healthRepoModule from '../repositories/healthRepository';

describe('SettingsPage Component Tests (SettingsPage.tsx - P0.8, P1.5c & P2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(healthRepoModule, 'checkConnection').mockResolvedValue({
      ok: true,
      latencyMs: 45,
      projectRef: 'mock-dev-ref',
    });
  });

  it('1. Render đầy đủ các nhóm cài đặt: Theme, Âm thanh & Rung, Chẩn đoán máy chủ, Dữ liệu trò chơi, Phiên bản', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Giao diện hiển thị \(Theme\)/i)).not.toBeNull();
    expect(screen.getByText(/Âm thanh & Rung phản hồi/i)).not.toBeNull();
    expect(screen.getByTestId('server-connection-card')).not.toBeNull();
    expect(screen.getByTestId('game-data-settings-section')).not.toBeNull();
    expect(screen.getByText(/Dữ liệu trò chơi cục bộ/i)).not.toBeNull();
    expect(screen.getByText(/Phiên bản Ứng dụng/i)).not.toBeNull();
  });

  it('2. Hiển thị thông tin kết nối Supabase thành công kèm projectRef và độ trễ (P2.1a)', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Kết nối máy chủ: OK \(45ms\)/i)).not.toBeNull();
    expect(screen.getByTestId('project-ref-badge')).not.toBeNull();
    expect(screen.getByText(/ref: mock-dev-ref/i)).not.toBeNull();
  });

  it('3. Hiển thị thông báo thất bại khi kết nối Supabase bị lỗi (P2.1a)', async () => {
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

  it('4. Bấm nút "Đo lại" kích hoạt lại hàm checkConnection', async () => {
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

  it('5. Hiển thị danh sách game có dữ liệu và thực hiện xóa dữ liệu khi xác nhận', async () => {
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

  it('6. Hiển thị thông báo khi không có game nào có dữ liệu cục bộ', async () => {
    vi.spyOn(gameLocalDataModule, 'hasGameData').mockReturnValue(false);

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Hiện chưa có dữ liệu lưu trữ cục bộ nào cần xóa/i)).not.toBeNull();
  });
});
