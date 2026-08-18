// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import * as gameLocalDataModule from '../core/gameLocalData';

describe('SettingsPage Component Tests (SettingsPage.tsx - P0.8 & P1.5c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Render đầy đủ các nhóm cài đặt: Theme, Âm thanh & Rung, Dữ liệu trò chơi, Phiên bản', () => {
    render(<SettingsPage />);

    expect(screen.getByText(/Giao diện hiển thị \(Theme\)/i)).not.toBeNull();
    expect(screen.getByText(/Âm thanh & Rung phản hồi/i)).not.toBeNull();
    expect(screen.getByTestId('game-data-settings-section')).not.toBeNull();
    expect(screen.getByText(/Dữ liệu trò chơi cục bộ/i)).not.toBeNull();
    expect(screen.getByText(/Phiên bản Ứng dụng/i)).not.toBeNull();
  });

  it('2. Hiển thị danh sách game có dữ liệu và thực hiện xóa dữ liệu khi xác nhận', () => {
    vi.spyOn(gameLocalDataModule, 'hasGameData').mockImplementation((gameId) => gameId === 'caro');
    const clearSpy = vi.spyOn(gameLocalDataModule, 'clearGameData');

    render(<SettingsPage />);

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

  it('3. Hiển thị thông báo khi không có game nào có dữ liệu cục bộ', () => {
    vi.spyOn(gameLocalDataModule, 'hasGameData').mockReturnValue(false);

    render(<SettingsPage />);

    expect(screen.getByText(/Hiện chưa có dữ liệu lưu trữ cục bộ nào cần xóa/i)).not.toBeNull();
  });
});
