// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CaroGameView } from './View';
import { caroManifest } from '@engines/caro/manifest';
import type { GameShellApi } from '../types';

/**
 * Helper phát sự kiện PointerEvent kèm tọa độ clientX/clientY chính xác trong môi trường jsdom
 */
function firePointerEvent(
  element: HTMLElement,
  type: 'pointerdown' | 'pointerup',
  coords: { clientX: number; clientY: number } = { clientX: 100, clientY: 100 },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: coords.clientX, writable: false });
  Object.defineProperty(event, 'clientY', { value: coords.clientY, writable: false });
  fireEvent(element, event);
}

/**
 * Helper thực hiện nước đi bằng Shortcut 2 Chạm
 */
function playMove2Tap(cell: HTMLElement) {
  // Chạm 1: Đặt preview
  act(() => {
    firePointerEvent(cell, 'pointerdown', { clientX: 50, clientY: 50 });
    firePointerEvent(cell, 'pointerup', { clientX: 50, clientY: 50 });
  });
  // Chạm 2: Xác nhận đánh
  act(() => {
    firePointerEvent(cell, 'pointerdown', { clientX: 50, clientY: 50 });
    firePointerEvent(cell, 'pointerup', { clientX: 50, clientY: 50 });
  });
}

describe('Caro Game View Component (View.tsx - P1.3c)', () => {
  let mockShellApi: GameShellApi;
  let mockOnGameEnd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellApi = {
      playSfx: vi.fn(),
      hapticTap: vi.fn(),
      hapticSuccess: vi.fn(),
      hapticError: vi.fn(),
    };
    mockOnGameEnd = vi.fn();
  });

  it('1. Khởi tạo thành công ván đấu với Caro Manifest: Lượt X đầu tiên, nước đi 1', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    expect(screen.getByTestId('caro-game-view')).not.toBeNull();
    expect(screen.getByTestId('turn-indicator')).not.toBeNull();
    expect(screen.getByText('Quân X (Đấu 2 người)')).not.toBeNull();
    expect(screen.getByText('1')).not.toBeNull();
  });

  it('2. Đánh 1 nước hợp lệ: Cập nhật quân cờ, đổi lượt sang Quân O và phát âm thanh click', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    const cell112 = screen.getByTestId('caro-cell-112'); // H8

    // Chạm lần 1: Đặt preview
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    // Bấm nút Xác nhận "Đánh vào H8"
    const confirmBtn = screen.getByTestId('confirm-move-btn');
    act(() => {
      fireEvent.click(confirmBtn);
    });

    // Bàn cờ cập nhật quân X tại ô 112 (value = 0)
    expect(cell112.getAttribute('data-value')).toBe('0');
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('click');

    // Chuyển lượt sang Quân O
    expect(screen.getByText('Quân O (Đấu 2 người)')).not.toBeNull();
    expect(screen.getByText('2')).not.toBeNull();
  });

  it('3. Đánh vào ô đã có quân: Kích hoạt hapticError & sfx error, không đổi state', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');

    // X đánh vào ô 112 (Shortcut 2 chạm)
    playMove2Tap(cell112);

    expect(cell112.getAttribute('data-value')).toBe('0');

    // Lượt O chạm vào chính ô 112 đã có quân
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    // Kiểm tra gọi sfx error và haptic error
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('error');

    // Vẫn giữ nguyên lượt của O
    expect(screen.getByText('Quân O (Đấu 2 người)')).not.toBeNull();
  });

  it('4. Ván đấu kết thúc khi có chuỗi 5 quân: Gọi onGameEnd với report hợp lệ, highlight winLine & play sfx success', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Kịch bản chuỗi 5 quân X hàng 0: (0,0), (1,0), (2,0), (3,0), (4,0)
    // O đánh xen kẽ hàng 1: (0,1), (1,1), (2,1), (3,1)
    const moves = [
      0, // X đánh (0,0)
      15, // O đánh (0,1)
      1, // X đánh (1,0)
      16, // O đánh (1,1)
      2, // X đánh (2,0)
      17, // O đánh (2,1)
      3, // X đánh (3,0)
      18, // O đánh (3,1)
      4, // X đánh (4,0) -> 5 quân X thẳng hàng -> THẮNG!
    ];

    for (const cellIdx of moves) {
      const cell = screen.getByTestId(`caro-cell-${cellIdx}`);
      playMove2Tap(cell);
    }

    // Hiển thị Banner chiến thắng
    expect(screen.getByTestId('game-over-banner')).not.toBeNull();
    expect(screen.getByText('🎉 QUÂN X CHIẾN THẮNG!')).not.toBeNull();

    // Gọi sfx và haptic success
    expect(mockShellApi.playSfx).toHaveBeenCalledWith('success');
    expect(mockShellApi.hapticSuccess).toHaveBeenCalled();

    // Báo cáo onGameEnd được gọi với cấu trúc chuẩn MatchResultReport
    expect(mockOnGameEnd).toHaveBeenCalledTimes(1);
    const report = mockOnGameEnd.mock.calls[0]?.[0];
    expect(report).toMatchObject({
      gameId: 'caro',
      mode: 'local_pvp',
      participants: [
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ],
    });

    // Các ô trong chuỗi thắng có cờ data-win-line
    const winningCells = [0, 1, 2, 3, 4];
    for (const winIdx of winningCells) {
      const winCell = screen.getByTestId(`caro-cell-${winIdx}`);
      expect(winCell.getAttribute('data-win-line')).toBe('true');
    }
  });

  it('5. Bấm nút "Ván mới" sau khi kết thúc: Reset hoàn toàn bàn cờ về ban đầu', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // X thắng nhanh
    const moves = [0, 15, 1, 16, 2, 17, 3, 18, 4];
    for (const cellIdx of moves) {
      const cell = screen.getByTestId(`caro-cell-${cellIdx}`);
      playMove2Tap(cell);
    }

    expect(screen.getByTestId('game-over-banner')).not.toBeNull();

    // Bấm nút "Ván mới"
    const newGameBtn = screen.getByTestId('new-game-btn');
    act(() => {
      fireEvent.click(newGameBtn);
    });

    // Bàn cờ trở về trạng thái trống ban đầu
    expect(screen.queryByTestId('game-over-banner')).toBeNull();
    expect(screen.getByText('Quân X (Đấu 2 người)')).not.toBeNull();
    expect(screen.getByText('1')).not.toBeNull();

    const cell0 = screen.getByTestId('caro-cell-0');
    expect(cell0.getAttribute('data-value')).toBe('-1');
  });

  it('6. Khi isPaused = true: Bàn cờ bị khóa, không thể đánh quân', () => {
    render(
      <CaroGameView
        definition={caroManifest}
        isPaused={true}
        onGameEnd={mockOnGameEnd}
        shellApi={mockShellApi}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    // Không tạo preview hay đánh cờ
    expect(cell112.getAttribute('data-preview')).toBeNull();
    expect(cell112.getAttribute('data-value')).toBe('-1');
  });
});
