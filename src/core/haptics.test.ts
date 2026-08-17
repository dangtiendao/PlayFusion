// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vibrate, hapticTap, hapticSuccess, hapticError, isHapticSupported } from './haptics';
import { useSettingsStore } from '@/stores/settingsStore';

describe('Haptics Manager Unit Tests (src/core/haptics.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.getState().resetSettings();
  });

  it('1. isHapticSupported: Kiểm tra feature detect an toàn', () => {
    const supported = isHapticSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('2. vibrate: Gọi đúng navigator.vibrate khi được bật và thiết bị hỗ trợ', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    expect(useSettingsStore.getState().hapticEnabled).toBe(true);
    vibrate(25);
    expect(vibrateMock).toHaveBeenCalledWith(25);
  });

  it('3. vibrate: Không rung khi hapticEnabled là false (Tôn trọng cài đặt)', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    useSettingsStore.getState().toggleHaptic(); // hapticEnabled = false
    expect(useSettingsStore.getState().hapticEnabled).toBe(false);

    vibrate(30);
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it('4. Presets ngữ nghĩa: hapticTap, hapticSuccess, hapticError kích hoạt đúng mẫu', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    hapticTap();
    expect(vibrateMock).toHaveBeenCalledWith(15);

    hapticSuccess();
    expect(vibrateMock).toHaveBeenCalledWith([20, 50, 40]);

    hapticError();
    expect(vibrateMock).toHaveBeenCalledWith([40, 60, 40, 60, 40]);
  });

  it('5. Tương thích iOS: No-op an toàn khi navigator.vibrate không tồn tại', () => {
    // Giả lập môi trường iOS Safari (không có thuộc tính vibrate)
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(isHapticSupported()).toBe(false);
    expect(() => vibrate(10)).not.toThrow();
    expect(() => hapticTap()).not.toThrow();
  });
});
