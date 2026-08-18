// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { InteractiveBoard } from './InteractiveBoard';
import * as hapticsModule from '../../../core/haptics';

vi.mock('../../../core/haptics', () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
  hapticError: vi.fn(),
  vibrate: vi.fn(),
  isHapticSupported: vi.fn(() => true),
}));

/**
 * Helper phát sự kiện PointerEvent kèm tọa độ clientX/clientY chính xác trong môi trường jsdom
 */
function firePointerEvent(
  element: HTMLElement,
  type: 'pointerdown' | 'pointerup',
  coords: { clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: coords.clientX, writable: false });
  Object.defineProperty(event, 'clientY', { value: coords.clientY, writable: false });
  fireEvent(element, event);
}

describe('Caro InteractiveBoard Component (InteractiveBoard.tsx - P1.3b)', () => {
  let mockOnMoveConfirmed: ReturnType<typeof vi.fn>;
  let mockOnSfx: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnMoveConfirmed = vi.fn();
    mockOnSfx = vi.fn();
  });

  it('render thành công component InteractiveBoard với bàn cờ 15x15', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    expect(screen.getByTestId('interactive-caro-board')).not.toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(225);
  });

  it('chạm lần 1 vào ô trống -> hiển thị preview + nút xác nhận + gọi hapticTap', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112'); // Ô trung tâm (7,7) -> H8

    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 100, clientY: 100 });
      firePointerEvent(cell112, 'pointerup', { clientX: 102, clientY: 102 }); // Dịch 2.8px <= 10px -> tap
    });

    // Ô 112 có cờ preview
    expect(cell112.getAttribute('data-preview')).toBe('true');
    expect(hapticsModule.hapticTap).toHaveBeenCalledTimes(1);

    // Hiển thị nút xác nhận "Đánh vào H8"
    const confirmBtn = screen.getByTestId('confirm-move-btn');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn.textContent).toContain('Đánh vào H8');
  });

  it('chạm lần 2 vào CHÍNH Ô đang preview -> xác nhận nước đi ngay lập tức (Shortcut 2 Chạm)', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
        onSfx={mockOnSfx}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');

    // Chạm lần 1: Đặt preview
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 100, clientY: 100 });
      firePointerEvent(cell112, 'pointerup', { clientX: 100, clientY: 100 });
    });

    expect(cell112.getAttribute('data-preview')).toBe('true');
    expect(mockOnMoveConfirmed).not.toHaveBeenCalled();

    // Chạm lần 2 vào chính ô 112
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 100, clientY: 100 });
      firePointerEvent(cell112, 'pointerup', { clientX: 100, clientY: 100 });
    });

    expect(mockOnMoveConfirmed).toHaveBeenCalledWith(112);
    expect(hapticsModule.hapticSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnSfx).toHaveBeenCalledWith('click');
    expect(cell112.getAttribute('data-preview')).toBeNull();
  });

  it('bấm nút Xác nhận "Đánh vào H8" -> gọi onMoveConfirmed và xóa preview', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    const confirmBtn = screen.getByTestId('confirm-move-btn');
    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(mockOnMoveConfirmed).toHaveBeenCalledWith(112);
    expect(hapticsModule.hapticSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-move-btn')).toBeNull();
  });

  it('bấm nút Hủy -> xóa preview hiện tại mà không đánh cờ', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    const cancelBtn = screen.getByTestId('cancel-preview-btn');
    expect(cancelBtn).not.toBeNull();
    act(() => {
      fireEvent.click(cancelBtn);
    });

    expect(mockOnMoveConfirmed).not.toHaveBeenCalled();
    expect(cell112.getAttribute('data-preview')).toBeNull();
    expect(screen.queryByTestId('confirm-move-btn')).toBeNull();
  });

  it('chạm sang ô trống khác -> chuyển preview sang ô mới', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');
    const cell113 = screen.getByTestId('caro-cell-113');

    // Chạm ô 112 (H8)
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });
    expect(cell112.getAttribute('data-preview')).toBe('true');

    // Chạm ô 113 (I8)
    act(() => {
      firePointerEvent(cell113, 'pointerdown', { clientX: 80, clientY: 50 });
      firePointerEvent(cell113, 'pointerup', { clientX: 80, clientY: 50 });
    });
    expect(cell112.getAttribute('data-preview')).toBeNull();
    expect(cell113.getAttribute('data-preview')).toBe('true');

    const confirmBtn = screen.getByTestId('confirm-move-btn');
    expect(confirmBtn.textContent).toContain('Đánh vào I8');
  });

  it('chạm vào ô ĐÃ CÓ QUÂN -> gọi hapticError, nháy viền lỗi và KHÔNG tạo preview', async () => {
    const board = Array(225).fill(-1);
    board[112] = 0; // Đã có quân X tại ô 112

    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
        onSfx={mockOnSfx}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    expect(hapticsModule.hapticError).toHaveBeenCalledTimes(1);
    expect(mockOnSfx).toHaveBeenCalledWith('error');
    expect(cell112.getAttribute('data-preview')).toBeNull();
    expect(cell112.getAttribute('data-error-flash')).toBe('true');
    expect(mockOnMoveConfirmed).not.toHaveBeenCalled();

    // Chờ 300ms trong act để tự tắt error flash
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(cell112.getAttribute('data-error-flash')).toBeNull();
  });

  it('khi disabled = true -> không tạo preview hay đánh cờ khi chạm', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        disabled={true}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 50, clientY: 50 });
      firePointerEvent(cell112, 'pointerup', { clientX: 50, clientY: 50 });
    });

    expect(hapticsModule.hapticTap).not.toHaveBeenCalled();
    expect(cell112.getAttribute('data-preview')).toBeNull();
    expect(mockOnMoveConfirmed).not.toHaveBeenCalled();
  });

  it('khi di chuyển quá 10px (Pan kéo bàn cờ) -> không tạo preview', () => {
    const board = Array(225).fill(-1);
    render(
      <InteractiveBoard
        board={board}
        boardSize={15}
        lastMove={null}
        winLine={null}
        onMoveConfirmed={mockOnMoveConfirmed}
      />,
    );

    const cell112 = screen.getByTestId('caro-cell-112');

    // Dịch chuyển 30px (Pan: 100px -> 130px)
    act(() => {
      firePointerEvent(cell112, 'pointerdown', { clientX: 100, clientY: 100 });
      firePointerEvent(cell112, 'pointerup', { clientX: 130, clientY: 100 });
    });

    expect(hapticsModule.hapticTap).not.toHaveBeenCalled();
    expect(cell112.getAttribute('data-preview')).toBeNull();
  });
});
