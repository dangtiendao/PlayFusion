// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('Caro Game View State Machine Tests (View.tsx - P1.4a)', () => {
  let mockShellApi: GameShellApi;
  let mockOnGameEnd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockShellApi = {
      playSfx: vi.fn(),
      hapticTap: vi.fn(),
      hapticSuccess: vi.fn(),
      hapticError: vi.fn(),
    };
    mockOnGameEnd = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Khởi đầu tại màn hình SETUP: Hiển thị ModeSelect với các tùy chọn từ caroManifest', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.queryByTestId('interactive-caro-board')).toBeNull();
  });

  it('2. Luồng Chế độ 2 người 1 máy: Vào ván -> Đánh 5 quân thắng -> Finished Screen -> Ván mới / Đổi chế độ', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // 1. Bấm chọn 2 người 1 máy -> Chuyển sang màn hình PLAYING
    const pvpBtn = screen.getByTestId('mode-btn-local_pvp');
    act(() => {
      fireEvent.click(pvpBtn);
    });

    expect(screen.queryByTestId('caro-mode-select')).toBeNull();
    expect(screen.getByTestId('turn-indicator')).not.toBeNull();
    expect(screen.getByText('Quân X (2 người 1 máy)')).not.toBeNull();

    // 2. Chuỗi nước đi dẫn tới chiến thắng cho Quân X
    const moves = [0, 15, 1, 16, 2, 17, 3, 18, 4];
    for (const cellIdx of moves) {
      const cell = screen.getByTestId(`caro-cell-${cellIdx}`);
      playMove2Tap(cell);
    }

    // 3. Ván đấu kết thúc -> Chuyển sang FINISHED Screen
    expect(screen.getByTestId('game-over-banner')).not.toBeNull();
    expect(screen.getByText('🎉 QUÂN X CHIẾN THẮNG!')).not.toBeNull();
    expect(screen.getByTestId('game-over-actions')).not.toBeNull();

    expect(mockOnGameEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'caro',
        mode: 'local_pvp',
        participants: [
          { playerIndex: 0, outcome: 'win' },
          { playerIndex: 1, outcome: 'loss' },
        ],
      }),
    );

    // 4. Bấm nút "Chơi lại ván mới" -> Reset bàn cờ và giữ nguyên PLAYING screen
    const restartBtn = screen.getByTestId('restart-game-btn');
    act(() => {
      fireEvent.click(restartBtn);
    });

    expect(screen.queryByTestId('game-over-banner')).toBeNull();
    expect(screen.getByText('Quân X (2 người 1 máy)')).not.toBeNull();

    // 5. Thắng lại và bấm "Đổi chế độ" -> Quay về SETUP screen
    for (const cellIdx of moves) {
      const cell = screen.getByTestId(`caro-cell-${cellIdx}`);
      playMove2Tap(cell);
    }

    const backToSetupBtn = screen.getByTestId('back-to-setup-btn');
    act(() => {
      fireEvent.click(backToSetupBtn);
    });

    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.queryByTestId('interactive-caro-board')).toBeNull();
  });

  it('3. Luồng Chế độ Đấu máy (vs_ai): Chọn Đi sau (Quân O) -> Máy (stub) tự động đi trước', () => {
    vi.useFakeTimers();

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Chọn mức Dễ
    const easyBtn = screen.getByTestId('ai-level-btn-easy');
    act(() => {
      fireEvent.click(easyBtn);
    });

    // Chọn Đi sau: Quân O (humanSeat = 1)
    const seatOBtn = screen.getByTestId('seat-o-btn');
    act(() => {
      fireEvent.click(seatOBtn);
    });

    // Bắt đầu đấu máy
    const startBtn = screen.getByTestId('start-vs-ai-btn');
    act(() => {
      fireEvent.click(startBtn);
    });

    // Vào màn hình PLAYING: Lượt X (Máy đi trước)
    expect(screen.getByText(/Máy đang suy nghĩ.../i)).not.toBeNull();

    // Kích hoạt timer 500ms cho Bot AI Stub
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Máy đã đi nước đầu tiên (ô 0), chuyển lượt sang Người chơi (Quân O)
    const cell0 = screen.getByTestId('caro-cell-0');
    expect(cell0.getAttribute('data-value')).toBe('0'); // Quân X của máy
    expect(screen.getByText('Lượt của bạn (Quân O)')).not.toBeNull();
  });

  it('4. Khi isPaused = true: Bàn cờ bị khóa', () => {
    render(
      <CaroGameView
        definition={caroManifest}
        isPaused={true}
        onGameEnd={mockOnGameEnd}
        shellApi={mockShellApi}
      />,
    );

    // Vào ván 2 người
    const pvpBtn = screen.getByTestId('mode-btn-local_pvp');
    act(() => {
      fireEvent.click(pvpBtn);
    });

    const cell112 = screen.getByTestId('caro-cell-112');
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    expect(cell112.getAttribute('data-preview')).toBeNull();
    expect(cell112.getAttribute('data-value')).toBe('-1');
  });
});
