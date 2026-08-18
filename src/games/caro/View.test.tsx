// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CaroGameView } from './View';
import { caroManifest } from '@engines/caro/manifest';
import type { GameShellApi } from '../types';
import * as useCaroAiModule from './useCaroAi';

/**
 * Mock hook useCaroAi để kiểm soát hành vi bất đồng bộ và kiểm tra 4 ca vòng đời
 */
vi.mock('./useCaroAi', () => ({
  useCaroAi: vi.fn(),
}));

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

describe('Caro Game View Component & AI Integration Tests (View.tsx - P1.4b)', () => {
  let mockShellApi: GameShellApi;
  let mockOnGameEnd: ReturnType<typeof vi.fn>;
  let mockRequestMove: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellApi = {
      playSfx: vi.fn(),
      hapticTap: vi.fn(),
      hapticSuccess: vi.fn(),
      hapticError: vi.fn(),
    };
    mockOnGameEnd = vi.fn();
    mockRequestMove = vi.fn();
    mockCancel = vi.fn();

    // Default mock implementation
    vi.mocked(useCaroAiModule.useCaroAi).mockReturnValue({
      requestMove: mockRequestMove,
      isThinking: false,
      cancel: mockCancel,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('3. Luồng Đấu máy - Máy đi trước (humanSeat = 1): Kích hoạt requestMove -> Board cập nhật -> Đổi lượt sang Người', async () => {
    // Mock AI resolve nước đi ô 112 (H8)
    mockRequestMove.mockResolvedValue(112);

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Chọn mức Khó
    act(() => {
      fireEvent.click(screen.getByTestId('ai-level-btn-hard'));
    });

    // Chọn Đi sau: Quân O (humanSeat = 1)
    act(() => {
      fireEvent.click(screen.getByTestId('seat-o-btn'));
    });

    // Bắt đầu đấu máy
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-vs-ai-btn'));
    });

    // Xác nhận requestMove được gọi với level: 'hard'
    expect(mockRequestMove).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ level: 'hard' }),
    );

    // Bàn cờ cập nhật quân X tại ô 112
    const cell112 = screen.getByTestId('caro-cell-112');
    expect(cell112.getAttribute('data-value')).toBe('0');

    // Chuyển lượt sang Người chơi (Quân O)
    expect(screen.getByText('Lượt của bạn (Quân O)')).not.toBeNull();
  });

  it('4. Ca vòng đời (a) - PAUSE khi AI đang suy nghĩ: Gọi cancel(), khi Resume tự kích hoạt lại lượt máy', async () => {
    let resolveAiPromise!: (move: number) => void;
    mockRequestMove.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveAiPromise = resolve;
        }),
    );

    const { rerender } = render(
      <CaroGameView
        definition={caroManifest}
        isPaused={false}
        onGameEnd={mockOnGameEnd}
        shellApi={mockShellApi}
      />,
    );

    // Chọn đi sau (Quân O)
    act(() => {
      fireEvent.click(screen.getByTestId('seat-o-btn'));
    });

    // Bắt đầu đấu máy
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-vs-ai-btn'));
    });

    expect(mockRequestMove).toHaveBeenCalledTimes(1);

    // 1. Tạm dừng ván đấu (isPaused = true)
    act(() => {
      rerender(
        <CaroGameView
          definition={caroManifest}
          isPaused={true}
          onGameEnd={mockOnGameEnd}
          shellApi={mockShellApi}
        />,
      );
    });

    // Xác nhận cancel() đã được gọi khi pause
    expect(mockCancel).toHaveBeenCalled();

    // 2. Tiếp tục ván đấu (isPaused = false -> Resume)
    await act(async () => {
      rerender(
        <CaroGameView
          definition={caroManifest}
          isPaused={false}
          onGameEnd={mockOnGameEnd}
          shellApi={mockShellApi}
        />,
      );
    });

    // Xác nhận requestMove() được kích hoạt lại lần 2
    expect(mockRequestMove).toHaveBeenCalledTimes(2);

    // Giải quyết nước đi cho AI
    await act(async () => {
      resolveAiPromise(112);
    });

    const cell112 = screen.getByTestId('caro-cell-112');
    expect(cell112.getAttribute('data-value')).toBe('0');
  });

  it('5. Ca vòng đời (b) - VÁN MỚI khi AI đang nghĩ: Gọi cancel(), kết quả cũ về muộn bị hủy bỏ', async () => {
    let resolveOldAi!: (move: number) => void;
    mockRequestMove.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveOldAi = resolve;
        }),
    );

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Chọn đi sau (Quân O)
    act(() => {
      fireEvent.click(screen.getByTestId('seat-o-btn'));
    });

    // Bắt đầu đấu máy (Máy đang tính nước mở màn)
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-vs-ai-btn'));
    });

    expect(mockRequestMove).toHaveBeenCalledTimes(1);

    // Bấm nút "Chơi lại ván mới" trong lúc máy đang nghĩ
    act(() => {
      fireEvent.click(screen.getByTestId('in-game-reset-btn'));
    });

    // Xác nhận cancel() được gọi
    expect(mockCancel).toHaveBeenCalled();

    // Kết quả cũ về muộn -> Phải bị bỏ qua an toàn
    await act(async () => {
      resolveOldAi(112);
    });

    // Ô 112 không bị gán sai
    const cell112 = screen.getByTestId('caro-cell-112');
    expect(cell112.getAttribute('data-value')).toBe('-1');
  });

  it('6. Ca vòng đời (d) - AI trả lỗi / Worker Crash: Hiển thị banner lỗi + Nút "Đi lại lượt máy" hoạt động', async () => {
    // Lần đầu AI bị reject lỗi
    mockRequestMove.mockRejectedValueOnce(new Error('Worker Out of Memory'));

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Chọn đi sau (Quân O)
    act(() => {
      fireEvent.click(screen.getByTestId('seat-o-btn'));
    });

    // Bắt đầu đấu máy (Máy đi trước)
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-vs-ai-btn'));
    });

    // Hiển thị banner lỗi AI
    expect(screen.getByTestId('ai-error-banner')).not.toBeNull();
    expect(screen.getByText(/Máy gặp lỗi tính toán: Worker Out of Memory/i)).not.toBeNull();
    expect(screen.getByTestId('retry-ai-btn')).not.toBeNull();

    // Lần sau AI thành công
    mockRequestMove.mockResolvedValueOnce(112);

    // Bấm nút "Đi lại lượt máy"
    await act(async () => {
      fireEvent.click(screen.getByTestId('retry-ai-btn'));
    });

    // Lỗi biến mất và nước đi được thực hiện
    expect(screen.queryByTestId('ai-error-banner')).toBeNull();
    const cell112 = screen.getByTestId('caro-cell-112');
    expect(cell112.getAttribute('data-value')).toBe('0');
  });
});
