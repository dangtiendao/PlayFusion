import { useSettingsStore } from '@/stores/settingsStore';

/**
 * ==============================================================================
 * MODULE QUẢN LÝ RUNG PHẢN HỒI XÚC GIÁC (HAPTICS FEEDBACK MANAGER)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & ĐẶC THÙ THIẾT BỊ:
 * 1. TƯƠNG THÍCH TRÌNH DUYỆT (FEATURE DETECTION):
 *    - `navigator.vibrate` là chuẩn của W3C Vibration API nhưng KHÔNG được hỗ trợ trên iOS Safari.
 *    - Module thực hiện kiểm tra an toàn `typeof navigator !== 'undefined' && 'vibrate' in navigator`.
 *      Trên thiết bị không hỗ trợ (như iPhone), mọi hàm rung sẽ suy thoái an toàn (no-op) mà không ném lỗi.
 * 2. TÔN TRỌNG CÀI ĐẶT NGƯỜI DÙNG:
 *    - Mọi thao tác rung đều kiểm tra `useSettingsStore.getState().hapticEnabled` trước khi thực thi.
 * 3. PRESETS NGỮ NGHĨA DÀNH CHO GAME:
 *    - Cung cấp các hàm ngữ nghĩa chuẩn (`hapticTap`, `hapticSuccess`, `hapticError`) để các game View
 *      chỉ cần gọi trực tiếp mà không phải hard-code pattern thời gian lặp lại.
 * ==============================================================================
 */

/**
 * Kiểm tra xem thiết bị và trình duyệt hiện tại có hỗ trợ Vibration API hay không.
 */
export function isHapticSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator &&
    typeof navigator.vibrate === 'function'
  );
}

/**
 * Thực hiện rung theo một khoảng thời gian hoặc mô thức (pattern) xung nhịp.
 *
 * @param pattern Thời gian rung (ms) hoặc mảng [rung, nghỉ, rung...].
 */
export function vibrate(pattern: number | number[]): void {
  // 1. Kiểm tra cấu hình cài đặt của người dùng
  const hapticEnabled = useSettingsStore.getState().hapticEnabled;
  if (!hapticEnabled) return;

  // 2. Kiểm tra hỗ trợ của phần cứng / trình duyệt
  if (!isHapticSupported()) return;

  try {
    navigator.vibrate(pattern);
  } catch (err) {
    console.warn('[Haptics] Không thể kích hoạt rung phản hồi:', err);
  }
}

/**
 * Preset: Rung nhẹ khi chạm nút hoặc đặt quân cờ trên bàn đấu (~15ms).
 */
export function hapticTap(): void {
  vibrate(15);
}

/**
 * Preset: Mô thức rung nhịp điệu khi thắng ván đấu hoặc hoàn thành chuỗi thành công [20ms rung, 50ms nghỉ, 40ms rung].
 */
export function hapticSuccess(): void {
  vibrate([20, 50, 40]);
}

/**
 * Preset: Mô thức rung cảnh báo khi thực hiện nước đi không hợp lệ hoặc thua ván đấu [40ms, 60ms, 40ms, 60ms, 40ms].
 */
export function hapticError(): void {
  vibrate([40, 60, 40, 60, 40]);
}
