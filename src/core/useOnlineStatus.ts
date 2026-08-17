import { useState, useEffect } from 'react';

/**
 * ==============================================================================
 * HOOK THEO DÕI TRẠNG THÁI KẾT NỐI MẠNG (ONLINE / OFFLINE)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT:
 * 1. Đọc trạng thái khởi tạo từ `navigator.onLine`.
 * 2. Đăng ký lắng nghe sự kiện `online` và `offline` trên đối tượng `window`.
 * 3. Trả về giá trị boolean `isOnline` phục vụ hiển thị Banner thông tin cho người dùng.
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Khi ở chế độ Offline, các ván cờ chơi với Máy (AI) hoặc 2 người chơi chung thiết bị
 *   (Pass & Play ở Phase P1.x) vẫn hoạt động bình thường nhờ Service Worker cache App Shell.
 * - Banner hiển thị chỉ mang tính chất thông tin, không chặn thao tác người dùng.
 * ==============================================================================
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default useOnlineStatus;
