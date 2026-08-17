import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';

export type ThemeMode = 'light' | 'dark';

export interface UseThemeReturn {
  /** Theme thực tế đang được áp dụng trên DOM ('light' hoặc 'dark') */
  readonly theme: ThemeMode;
  /** Lựa chọn theme cấu hình trong cài đặt ('light' | 'dark' | 'system') */
  readonly themePreference: ThemePreference;
  /** True nếu giao diện thực tế đang ở chế độ Dark Mode */
  readonly isDark: boolean;
  /** Hàm chuyển đổi qua lại giữa Sáng và Tối */
  readonly toggleTheme: () => void;
  /** Hàm thiết lập trực tiếp cấu hình theme */
  readonly setTheme: (theme: ThemePreference) => void;
}

const LIGHT_THEME_COLOR = '#f8fafc';
const DARK_THEME_COLOR = '#0f172a';

/**
 * ==============================================================================
 * HOOK QUẢN LÝ THEME GIAO DIỆN (PERSISTED THEME MANAGER)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & TRẢ NỢ KỸ THUẬT:
 * 1. PERSISTENCE TOÀN DIỆN:
 *    - Đọc và lưu cấu hình theme qua `useSettingsStore` (được lưu bền vững trong localStorage
 *      với prefix `wgh:v1:settings`).
 * 2. HỖ TRỢ CHẾ ĐỘ 'SYSTEM' LINH HOẠT:
 *    - Khi `themePreference === 'system'`, hook tự động lắng nghe `matchMedia` và đồng bộ
 *      theo cài đặt Sáng/Tối của hệ điều hành.
 * 3. ĐỒNG BỘ DOM & META THEME-COLOR:
 *    - Tự động gán/xóa class `dark` trên thẻ `<html>` và cập nhật thẻ `<meta name="theme-color">`
 *      để thanh trạng thái trình duyệt di động (iOS Safari & Android Chrome) đồng bộ hoàn hảo.
 * ==============================================================================
 */
export function useTheme(): UseThemeReturn {
  const themePreference = useSettingsStore((state) => state.theme);
  const setThemePreference = useSettingsStore((state) => state.setTheme);

  // Trạng thái theme hệ điều hành thực tế
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // 1. Lắng nghe thay đổi theme từ hệ điều hành khi ở chế độ 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleOSChange = (event: MediaQueryListEvent) => {
      setSystemIsDark(event.matches);
    };

    mediaQuery.addEventListener('change', handleOSChange);
    return () => {
      mediaQuery.removeEventListener('change', handleOSChange);
    };
  }, []);

  // 2. Tính toán theme thực tế (resolved theme)
  const isDark = themePreference === 'system' ? systemIsDark : themePreference === 'dark';
  const resolvedTheme: ThemeMode = isDark ? 'dark' : 'light';

  // 3. Đồng bộ class DOM trên <html> và meta theme-color
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    const targetColor = isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

    if (themeColorMetas.length > 0) {
      themeColorMetas.forEach((meta) => {
        meta.setAttribute('content', targetColor);
      });
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = targetColor;
      document.head.appendChild(meta);
    }
  }, [isDark]);

  // 4. Hàm toggle nhanh qua lại
  const toggleTheme = useCallback(() => {
    if (themePreference === 'system') {
      setThemePreference(systemIsDark ? 'light' : 'dark');
    } else {
      setThemePreference(themePreference === 'dark' ? 'light' : 'dark');
    }
  }, [themePreference, systemIsDark, setThemePreference]);

  return {
    theme: resolvedTheme,
    themePreference,
    isDark,
    toggleTheme,
    setTheme: setThemePreference,
  };
}

export default useTheme;
