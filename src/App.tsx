import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { APP_CONFIG } from '@/config/app';
import { APP_ROUTES } from '@/routes';
import { AppShell } from '@/components/layout/AppShell';
import { useTheme } from '@/core/useTheme';
import { SunIcon, MoonIcon } from '@/components/icons/NavIcons';
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt';
import { useAuthStore } from '@/stores/authStore';
import { initSyncBootstrap } from '@/core/syncBootstrap';

/**
 * AppContent Component - Render bên trong BrowserRouter để sử dụng Router hooks.
 */
function AppContent() {
  const { isDark, toggleTheme } = useTheme();

  // Khởi tạo phiên xác thực (Khách ẩn danh tự động hoặc khôi phục session cũ)
  // và kích hoạt Hàng đợi đồng bộ Outbox (Offline-first sync bootstrap).
  // NGUYÊN TẮC OFFLINE-FIRST BẤT BIẾN: auth và sync chạy ngầm, tuyệt đối KHÔNG chặn
  // render giao diện hay làm gián đoạn các trò chơi offline (Caro, Ô ăn quan).
  useEffect(() => {
    useAuthStore.getState().init();
    const cleanupSync = initSyncBootstrap();
    return cleanupSync;
  }, []);

  // Lọc các route được phép hiển thị trên thanh điều hướng
  const navItems = APP_ROUTES.filter((route) => route.showInNav);

  return (
    <AppShell
      appName={APP_CONFIG.name}
      appVersion={APP_CONFIG.version}
      navItems={navItems}
      headerAction={
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
          className="min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted border border-surface-border dark:border-surface-dark-border transition-colors text-sm flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {isDark ? (
            <SunIcon className="w-5 h-5 text-amber-500" />
          ) : (
            <MoonIcon className="w-5 h-5 text-slate-700" />
          )}
        </button>
      }
    >
      <Routes>
        {APP_ROUTES.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
      {/* Toast thông báo cập nhật phiên bản mới của PWA */}
      <UpdatePrompt />
    </AppShell>
  );
}

/**
 * App Root Component bọc BrowserRouter cho toàn bộ ứng dụng.
 */
export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
