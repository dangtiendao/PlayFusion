// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';
import { storage } from '@/core/storage';

describe('SettingsStore Unit Tests (src/stores/settingsStore.ts)', () => {
  beforeEach(() => {
    storage.clear();
    useSettingsStore.getState().resetSettings();
  });

  it('1. Trạng thái khởi tạo mặc định chính xác', () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe('system');
    expect(state.soundEnabled).toBe(true);
    expect(state.hapticEnabled).toBe(true);
    expect(state.dismissedUpdateVersion).toBeNull();
  });

  it('2. Action setTheme: Thay đổi theme hiển thị', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');

    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');

    useSettingsStore.getState().setTheme('system');
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('3. Action toggleSound & toggleHaptic: Đảo trạng thái âm thanh và rung', () => {
    expect(useSettingsStore.getState().soundEnabled).toBe(true);
    useSettingsStore.getState().toggleSound();
    expect(useSettingsStore.getState().soundEnabled).toBe(false);

    expect(useSettingsStore.getState().hapticEnabled).toBe(true);
    useSettingsStore.getState().toggleHaptic();
    expect(useSettingsStore.getState().hapticEnabled).toBe(false);
  });

  it('4. Action dismissUpdate: Ghi nhận phiên bản cập nhật bị hoãn', () => {
    useSettingsStore.getState().dismissUpdate('0.8.0');
    expect(useSettingsStore.getState().dismissedUpdateVersion).toBe('0.8.0');
  });

  it('5. Action resetSettings: Khôi phục toàn bộ cài đặt về mặc định', () => {
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().toggleSound();
    useSettingsStore.getState().dismissUpdate('0.9.0');

    useSettingsStore.getState().resetSettings();

    const state = useSettingsStore.getState();
    expect(state.theme).toBe('system');
    expect(state.soundEnabled).toBe(true);
    expect(state.dismissedUpdateVersion).toBeNull();
  });

  it('6. Persistence: Dữ liệu được lưu trữ tự động vào localStorage với key settings', () => {
    useSettingsStore.getState().setTheme('dark');
    useSettingsStore.getState().toggleSound();

    // Đọc trực tiếp từ storage wrapper
    const saved = storage.getItem<{ state: { theme: string; soundEnabled: boolean } } | null>(
      'settings',
      null,
    );

    expect(saved).toBeDefined();
    expect(saved?.state.theme).toBe('dark');
    expect(saved?.state.soundEnabled).toBe(false);
  });
});
