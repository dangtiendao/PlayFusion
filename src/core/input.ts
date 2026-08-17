import { useRef, useCallback, useEffect } from 'react';

/**
 * ==============================================================================
 * MODULE CHUẨN HÓA ĐẦU VÀO CẢM ỨNG & BÀN PHÍM (INPUT NORMALIZER)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & XỬ LÝ ĐẶC THÙ THIẾT BỊ:
 * 1. POINTER EVENTS VS TOUCH/MOUSE (CHỐNG DOUBLE-FIRE TRÊN THIẾT BỊ LAI):
 *    - Trên các thiết bị cảm ứng lai (laptop màn hình cảm ứng, iPad có trackpad), việc lắng nghe
 *      đồng thời `touchstart` và `click/mousedown` thường gây ra hiện tượng kích hoạt 2 lần (double-fire).
 *    - Module sử dụng chuẩn W3C Pointer Events (`pointerdown`, `pointerup`) để hợp nhất mọi loại đầu vào
 *      (Touch, Mouse, Pen) thành một luồng sự kiện duy nhất, đáng tin cậy.
 * 2. PHÂN BIỆT CHẠM (TAP) VS KÉO/CUỘN (DRAG/SCROLL):
 *    - Đặt ngưỡng di chuyển (Threshold mặc định 10px). Nếu ngón tay di chuyển quá 10px giữa down và up,
 *      thao tác được tính là cuộn trang hoặc rê cờ (drag) chứ không phải là tap, tránh bấm nhầm khi vuốt.
 * 3. CHỐNG LẶP PHÍM BÀN PHÍM (KEYBOARD REPEAT SUPPRESSION):
 *    - `useKeyboardShortcuts` tự động bỏ qua `event.repeat` khi người chơi giữ phím quá lâu và bỏ qua
 *      khi đang gõ trong các ô nhập liệu (`input`, `textarea`).
 * ==============================================================================
 */

/**
 * Tính toán khoảng cách Euclid giữa hai tọa độ (x1, y1) và (x2, y2).
 */
export function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Kiểm tra xem độ dịch chuyển (dx, dy) có nằm trong ngưỡng xem là một cú Chạm (Tap) hay không.
 *
 * @param dx Độ lệch trục X.
 * @param dy Độ lệch trục Y.
 * @param threshold Ngưỡng khoảng cách tối đa (mặc định 10px).
 */
export function isTapMovement(dx: number, dy: number, threshold = 10): boolean {
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}

export interface UseUnifiedPressOptions {
  /** Ngưỡng khoảng cách tối đa để công nhận là tap (px, mặc định 10) */
  readonly threshold?: number;
  /** Vô hiệu hóa press handler */
  readonly disabled?: boolean;
}

export interface UnifiedPressHandlers {
  readonly onPointerDown: (event: React.PointerEvent) => void;
  readonly onPointerUp: (event: React.PointerEvent) => void;
  readonly onPointerCancel: (event: React.PointerEvent) => void;
  readonly onPointerLeave: (event: React.PointerEvent) => void;
  readonly style: React.CSSProperties;
}

/**
 * Hook hợp nhất thao tác chạm/nhấn (Tap/Click) sử dụng Pointer Events chuẩn hóa.
 *
 * @param onPress Callback được thực thi khi người dùng chạm hợp lệ (không phải vuốt/kéo).
 * @param options Tùy chọn ngưỡng di chuyển và trạng thái kích hoạt.
 */
export function useUnifiedPress(
  onPress: () => void,
  options: UseUnifiedPressOptions = {},
): UnifiedPressHandlers {
  const { threshold = 10, disabled = false } = options;

  const startCoordRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled) return;
      // Chỉ chấp nhận nút chuột chính (Primary Button: chuột trái hoặc cảm ứng)
      if (event.button !== 0 && event.pointerType === 'mouse') return;

      startCoordRef.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
      };
    },
    [disabled],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || !startCoordRef.current) return;
      if (startCoordRef.current.id !== event.pointerId) return;

      const distance = calculateDistance(
        startCoordRef.current.x,
        startCoordRef.current.y,
        event.clientX,
        event.clientY,
      );

      startCoordRef.current = null;

      // Kích hoạt callback nếu khoảng cách nằm trong ngưỡng cho phép
      if (distance <= threshold) {
        onPress();
      }
    },
    [disabled, threshold, onPress],
  );

  const onPointerCancel = useCallback(() => {
    startCoordRef.current = null;
  }, []);

  const onPointerLeave = useCallback(() => {
    startCoordRef.current = null;
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    style: {
      touchAction: 'manipulation', // Tối ưu loại bỏ 300ms double-tap delay trên mobile
    },
  };
}

export interface UseKeyboardShortcutsOptions {
  /** Cho phép lắng nghe phím hay không (mặc định true) */
  readonly enabled?: boolean;
}

/**
 * Hook đăng ký phím tắt toàn cục có cơ chế chống lặp phím và bỏ qua input form.
 *
 * @param shortcuts Bản đồ phím tắt (key -> callback), ví dụ: { 'Escape': handleClose, 'Space': handlePause }.
 * @param options Tùy chọn kích hoạt.
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
  options: UseKeyboardShortcutsOptions = {},
): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // 1. Chống lặp phím khi người chơi đè giữ phím
      if (event.repeat) return;

      // 2. Bỏ qua nếu người dùng đang nhập văn bản trong input/textarea
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // 3. Khớp phím tắt (hỗ trợ cả 'Escape', ' ', 'ArrowLeft'...)
      const handler = shortcuts[event.key] || shortcuts[event.code];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
}
