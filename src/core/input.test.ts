// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { calculateDistance, isTapMovement, useUnifiedPress, useKeyboardShortcuts } from './input';

describe('Input Normalizer Unit Tests (src/core/input.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Hàm logic thuần phân loại Tap vs Drag (calculateDistance & isTapMovement)', () => {
    it('Tính chính xác khoảng cách Euclid theo định lý Pytago', () => {
      expect(calculateDistance(0, 0, 3, 4)).toBe(5);
      expect(calculateDistance(10, 10, 10, 10)).toBe(0);
    });

    it('Xác định đúng di chuyển nằm trong hoặc vượt ngưỡng Tap (Threshold)', () => {
      // Dưới ngưỡng 10px -> Tap hợp lệ
      expect(isTapMovement(3, 4, 10)).toBe(true);
      expect(isTapMovement(0, 8, 10)).toBe(true);

      // Vượt ngưỡng 10px -> Coi là kéo/cuộn trang
      expect(isTapMovement(15, 0, 10)).toBe(false);
      expect(isTapMovement(8, 8, 10)).toBe(false);
    });
  });

  describe('2. Hook useUnifiedPress (Pointer Events Normalizer)', () => {
    it('Kích hoạt onPress khi chạm tại chỗ (khoảng cách <= threshold)', () => {
      const onPressMock = vi.fn();
      const { result } = renderHook(() => useUnifiedPress(onPressMock, { threshold: 10 }));

      const handlers = result.current;

      act(() => {
        handlers.onPointerDown({
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          button: 0,
          pointerType: 'touch',
        } as unknown as React.PointerEvent);

        handlers.onPointerUp({
          clientX: 104,
          clientY: 103,
          pointerId: 1,
          button: 0,
          pointerType: 'touch',
        } as unknown as React.PointerEvent);
      });

      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('Hủy onPress khi khoảng cách di chuyển vượt ngưỡng threshold (Vuốt/Cuộn)', () => {
      const onPressMock = vi.fn();
      const { result } = renderHook(() => useUnifiedPress(onPressMock, { threshold: 10 }));

      const handlers = result.current;

      act(() => {
        handlers.onPointerDown({
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          button: 0,
          pointerType: 'touch',
        } as unknown as React.PointerEvent);

        // Di chuyển 50px (người dùng đang cuộn danh sách)
        handlers.onPointerUp({
          clientX: 100,
          clientY: 150,
          pointerId: 1,
          button: 0,
          pointerType: 'touch',
        } as unknown as React.PointerEvent);
      });

      expect(onPressMock).not.toHaveBeenCalled();
    });

    it('Không kích hoạt khi pointercancel xảy ra', () => {
      const onPressMock = vi.fn();
      const { result } = renderHook(() => useUnifiedPress(onPressMock));

      const handlers = result.current;

      act(() => {
        handlers.onPointerDown({
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          button: 0,
          pointerType: 'touch',
        } as unknown as React.PointerEvent);

        handlers.onPointerCancel({} as unknown as React.PointerEvent);

        handlers.onPointerUp({
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          button: 0,
          pointerType: 'touch',
        } as unknown as React.PointerEvent);
      });

      expect(onPressMock).not.toHaveBeenCalled();
    });
  });

  describe('3. Hook useKeyboardShortcuts (Chống lặp phím & Bỏ qua form input)', () => {
    it('Thực thi phím tắt khi người dùng nhấn phím hợp lệ', () => {
      const escapeHandler = vi.fn();
      renderHook(() => useKeyboardShortcuts({ Escape: escapeHandler }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(escapeHandler).toHaveBeenCalledTimes(1);
    });

    it('Bỏ qua khi phím bị đè lặp (event.repeat = true)', () => {
      const spaceHandler = vi.fn();
      renderHook(() => useKeyboardShortcuts({ ' ': spaceHandler }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
      });

      expect(spaceHandler).not.toHaveBeenCalled();
    });
  });
});
