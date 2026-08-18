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

describe('Caro Game View Component & AI Integration Tests (View.tsx - P1.4c)', () => {
  let mockShellApi: GameShellApi;
  let mockOnGameEnd: ReturnType<typeof vi.fn>;
  let mockRequestMove: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. Khởi đầu tại màn hình SETUP: Hiển thị ModeSelect với các tùy chọn từ caroManifest', () => {
    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.queryByTestId('interactive-caro-board')).toBeNull();
  });

  it('2. Luồng Chế độ 2 người 1 máy: Vào ván -> Đánh 5 quân thắng -> MatchEndOverlay -> Chơi lại tăng tỷ số phiên', async () => {
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

    // 3. Ván đấu kết thúc -> Sau 800ms MatchEndOverlay xuất hiện
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('match-end-overlay')).not.toBeNull();
    expect(screen.getByText('QUÂN X THẮNG! 🎉')).not.toBeNull();

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

    // 4. Bấm nút "Chơi lại (Đổi lượt đi)" -> Bàn cờ reset, tỷ số tăng lên Ván 2 (1 - 0)
    const restartBtn = screen.getByTestId('overlay-restart-btn');
    act(() => {
      fireEvent.click(restartBtn);
    });

    expect(screen.queryByTestId('match-end-overlay')).toBeNull();
    expect(screen.getByText('Ván 2')).not.toBeNull();
    expect(screen.getByText('1 - 0')).not.toBeNull();

    // 5. Thắng lại và bấm "Đổi chế độ" -> Quay về SETUP screen
    for (const cellIdx of moves) {
      const cell = screen.getByTestId(`caro-cell-${cellIdx}`);
      playMove2Tap(cell);
    }
    act(() => {
      vi.advanceTimersByTime(800);
    });

    const backToSetupBtn = screen.getByTestId('overlay-setup-btn');
    act(() => {
      fireEvent.click(backToSetupBtn);
    });

    expect(screen.getByTestId('caro-mode-select')).not.toBeNull();
    expect(screen.queryByTestId('interactive-caro-board')).toBeNull();
  });

  it('3. Luồng Đấu máy (vs_ai) - Chơi lại ĐỔI LƯỢT ĐI: Ván 1 Người X -> Ván 2 Người O, Máy tự mở màn', async () => {
    // Ván 1: Người cầm X (đi trước), máy cầm O
    mockRequestMove.mockResolvedValue(112);

    render(
      <CaroGameView definition={caroManifest} onGameEnd={mockOnGameEnd} shellApi={mockShellApi} />,
    );

    // Chọn mức Khó + Cầm X (Đi trước)
    act(() => {
      fireEvent.click(screen.getByTestId('ai-level-btn-hard'));
      fireEvent.click(screen.getByTestId('seat-x-btn'));
    });

    // Bắt đầu đấu máy
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-vs-ai-btn'));
    });

    // Người X đánh 5 nước thắng: 0, 1, 2, 3, 4 (xen kẽ máy đánh 15, 16, 17, 18)
    // Để test gọn, ta đánh thẳng các nước của người khi đến lượt
    playMove2Tap(screen.getByTestId('caro-cell-0'));

    // Chờ máy O trả nước đi 15
    await act(async () => {
      mockRequestMove.mockResolvedValueOnce(15);
      vi.advanceTimersByTime(100);
    });

    // Người X đánh tiếp 1, 2, 3, 4
    const humanMoves = [1, 2, 3, 4];
    for (const [i, cellIdx] of humanMoves.entries()) {
      playMove2Tap(screen.getByTestId(`caro-cell-${cellIdx}`));
      if (i < humanMoves.length - 1) {
        await act(async () => {
          mockRequestMove.mockResolvedValueOnce(16 + i);
          vi.advanceTimersByTime(100);
        });
      }
    }

    // Kết thúc ván 1 -> Chờ 800ms hiện overlay
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.getByTestId('match-end-overlay')).not.toBeNull();
    expect(screen.getByText('BẠN THẮNG! 🎉')).not.toBeNull();

    // Bấm Chơi lại (Đổi lượt)
    mockRequestMove.mockResolvedValue(112); // Nước mở màn của máy ở Ván 2

    await act(async () => {
      fireEvent.click(screen.getByTestId('overlay-restart-btn'));
    });

    // Ván 2: Người chuyển sang cầm O (Đi sau), Máy cầm X tự động tính toán nước mở màn!
    expect(screen.getByText('Ván 2')).not.toBeNull();
    expect(mockRequestMove).toHaveBeenCalled();
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
