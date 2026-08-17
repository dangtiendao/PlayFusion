import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface UseThemeReturn {
  /** Theme hiện tại đang active ('light' hoặc 'dark') */
  readonly theme: ThemeMode;
  /** True nếu đang ở chế độ Dark Mode */
  readonly isDark: boolean;
  /** Hàm chuyển đổi giữa Sáng và Tối */
  readonly toggleTheme: () => void;
  /** True nếu người dùng đã tự toggle thủ công trong phiên làm việc hiện tại */
  readonly hasManualOverride: boolean;
}

const LIGHT_THEME_COLOR = '#f8fafc';
const DARK_THEME_COLOR = '#0f172a';

/**
 * ==============================================================================
 * HOOK QUẢN LÝ THEME GIAO DIỆN (LIGHT / DARK MODE)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & QUY TẮC KIẾN TRÚC:
 *
 * 1. KHỞI TẠO THEO HỆ ĐIỀU HÀNH (OS Preferred Color Scheme):
 *    - Khi mở ứng dụng lần đầu, hook tự động kiểm tra `window.matchMedia('(prefers-color-scheme: dark)')`
 *      để hiển thị đúng theme người dùng đã cài đặt trên máy.
 *
 * 2. LẮNG NGHE THAY ĐỔI HỆ ĐIỀU HÀNH REAL-TIME:
 *    - Đăng ký listener trên MediaQueryList. Nếu người dùng đổi chế độ Dark/Light của điện thoại
 *      trong khi đang mở web, app sẽ tự động chuyển theo NẾU người dùng chưa toggle thủ công
 *      trong phiên hiện tại.
 *
 * 3. ĐỒNG BỘ THẺ META THEME-COLOR:
 *    - Cập nhật nội dung thẻ `<meta name="theme-color">` bằng JavaScript khi đổi theme
 *      để thanh trạng thái trình duyệt di động (iOS Safari & Android Chrome) đồng bộ màu sắc.
 *
 * 4. GHI CHÚ KIẾN TRÚC VỀ LƯU TRỮ (PERSISTENCE):
 *    - Trạng thái theme trong phase này được lưu in-memory trong phiên làm việc.
 *    - Việc lưu lựa chọn vào localStorage sẽ được chuẩn hóa tại Phase P0.8 thông qua
 *      module lưu trữ tập trung `src/core/storage.ts` để đảm bảo tính nhất quán.
 * ==============================================================================
 */
export function useTheme(): UseThemeReturn {
  // 1. Xác định theme khởi tạo từ hệ điều hành
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Đánh dấu người dùng đã toggle thủ công trong phiên hay chưa
  const [hasManualOverride, setHasManualOverride] = useState<boolean>(false);

  // 2. Cập nhật DOM và meta theme-color mỗi khi theme thay đổi
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const isDarkMode = theme === 'dark';

    // Cập nhật class "dark" trên thẻ <html> để Tailwind kích hoạt dark mode
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Cập nhật động nội dung các thẻ meta theme-color
    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    const targetColor = isDarkMode ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

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
  }, [theme]);

  // 3. Lắng nghe thay đổi theme từ hệ điều hành (chỉ kích hoạt nếu chưa toggle tay)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleOSThemeChange = (event: MediaQueryListEvent) => {
      // Chỉ tự động đổi nếu người dùng chưa từng bấm nút toggle trong phiên này
      if (!hasManualOverride) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleOSThemeChange);
    return () => {
      mediaQuery.removeEventListener('change', handleOSThemeChange);
    };
  }, [hasManualOverride]);

  // 4. Hàm toggle thủ công
  const toggleTheme = useCallback(() => {
    setHasManualOverride(true);
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    hasManualOverride,
  };
}

export default useTheme;
