import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorageAdapter } from '@/core/storage';

/**
 * ==============================================================================
 * STORE CÀI ĐẶT TOÀN HỆ THỐNG (SETTINGS STORE)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. QUẢN LÝ TẬP TRUNG: Toàn bộ tùy chọn người dùng (Theme, Âm thanh, Rung, Version cập nhật)
 *    đều được lưu trữ và truy cập thông qua store này.
 * 2. PERSISTENCE AN TOÀN: Tích hợp với `zustandStorageAdapter` (wrapper `storage.ts`)
 *    tự động lưu vào `localStorage` dưới namespace `wgh:v1:settings`.
 * ==============================================================================
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface SettingsState {
  /** Lựa chọn theme: 'light' | 'dark' | 'system' (Tiêu thụ bởi: useTheme) */
  readonly theme: ThemePreference;
  /** Bật/tắt hiệu ứng âm thanh (Tiêu thụ bởi: audio.ts tại Phase P0.8b) */
  readonly soundEnabled: boolean;
  /** Bật/tắt phản hồi rung haptics (Tiêu thụ bởi: audio.ts / haptics tại Phase P0.8b) */
  readonly hapticEnabled: boolean;
  /** Phiên bản PWA mà người dùng đã bấm 'Để sau' (Tiêu thụ bởi: UpdatePrompt) */
  readonly dismissedUpdateVersion: string | null;
}

export interface SettingsActions {
  /** Thiết lập theme hiển thị */
  readonly setTheme: (theme: ThemePreference) => void;
  /** Đảo trạng thái hiệu ứng âm thanh */
  readonly toggleSound: () => void;
  /** Đảo trạng thái rung phản hồi */
  readonly toggleHaptic: () => void;
  /** Ghi nhận phiên bản cập nhật đã được người dùng hoãn lại */
  readonly dismissUpdate: (version: string) => void;
  /** Khôi phục toàn bộ cài đặt về mặc định */
  readonly resetSettings: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const DEFAULT_SETTINGS: SettingsState = {
  theme: 'system',
  soundEnabled: true,
  hapticEnabled: true,
  dismissedUpdateVersion: null,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => set({ theme }),

      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

      toggleHaptic: () => set((state) => ({ hapticEnabled: !state.hapticEnabled })),

      dismissUpdate: (version) => set({ dismissedUpdateVersion: version }),

      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => zustandStorageAdapter),
    },
  ),
);

export default useSettingsStore;
