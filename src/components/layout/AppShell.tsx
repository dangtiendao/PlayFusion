import { type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useOnlineStatus } from '@/core/useOnlineStatus';

/**
 * Interface định nghĩa một mục trên thanh điều hướng.
 */
export interface AppShellNavItem {
  readonly path: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

/**
 * Props của AppShell Layout Component.
 */
export interface AppShellProps {
  /** Nội dung chính hiển thị bên trong vùng cuộn của màn hình */
  readonly children: ReactNode;
  /** Danh sách các mục điều hướng (render cho cả BottomNav và Sidebar) */
  readonly navItems: readonly AppShellNavItem[];
  /** Tên ứng dụng (mặc định 'PlayFusion') */
  readonly appName?: string;
  /** Phiên bản ứng dụng */
  readonly appVersion?: string;
  /** Vùng chứa các nút thao tác nhanh ở góc phải Header (ví dụ Dark Mode toggle) */
  readonly headerAction?: ReactNode;
}

/**
 * ==============================================================================
 * APPSHELL - KHUNG GIAO DIỆN RESPONSIVE 2 HÌNH THÁI NAVIGATION (MOBILE-FIRST)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & QUY TẮC THIẾT KẾ ĐÃ ÁP DỤNG:
 *
 * 1. 2 HÌNH THÁI ĐIỀU HƯỚNG TỰ THÍCH ỨNG TỪ CÙNG 1 NGUỒN CẤU HÌNH:
 *    - Mobile (< 768px - breakpoint md): Sử dụng BottomNav cố định ở đáy màn hình.
 *    - Desktop (>= 768px - breakpoint md): Sử dụng Sidebar cố định bên trái, BottomNav ẩn đi.
 *
 * 2. VÙNG CHẠM TOUCH TARGET ĐẠT CHUẨN (>= 44x44px):
 *    - Mọi nút bấm trên BottomNav và Sidebar đều được thiết lập `min-h-[44px] min-w-[44px]`
 *      đáp ứng tiêu chuẩn công thái học Mobile-First của Apple và Google.
 *
 * 3. VÙNG AN TOÀN TRÀN VIỀN (Safe Area Insets):
 *    - Header: padding-top `env(safe-area-inset-top)`
 *    - BottomNav: padding-bottom `env(safe-area-inset-bottom)`
 *    - Main: padding-left & padding-right `env(safe-area-inset-left/right)`
 *
 * 4. CÔ LẬP VÙNG CUỘN (Single Scroll Container):
 *    - html, body, #root bị khóa cuộn.
 *    - DUY NHẤT thẻ `<main>` được cuộn (`overflow-y: auto`, `overscroll-contain`).
 *
 * 5. TRẠNG THÁI OFFLINE (P0.5b):
 *    - Khi mất kết nối internet, hiển thị banner thông báo nhẹ nhàng (non-blocking).
 *    - Các game offline (Pass & Play, chơi với AI ở Phase P1.x) vẫn chơi bình thường.
 * ==============================================================================
 */
export function AppShell({
  children,
  navItems,
  appName = 'PlayFusion',
  appVersion = '0.1.0',
  headerAction,
}: AppShellProps) {
  const location = useLocation();
  const isOnline = useOnlineStatus();

  // Xác định trang hiện tại để hiển thị tên trên Header
  const currentNav = navItems.find((item) => item.path === location.pathname);
  const currentTitle = currentNav ? currentNav.label : appName;

  return (
    <div
      id="app-shell"
      className="flex w-full h-dvh-screen overflow-hidden bg-surface dark:bg-surface-dark text-slate-900 dark:text-slate-100 select-none"
    >
      {/* 
        ========================================================================
        1. DESKTOP SIDEBAR (HIỂN THỊ TỪ BREAKPOINT MD TRỞ LÊN - >= 768px)
        - Cố định bên trái, chiều rộng 256px (w-64)
        - Ẩn hoàn toàn trên mobile (hidden md:flex)
        - Render từ cùng mảng navItems với BottomNav
        ========================================================================
      */}
      <aside
        aria-label="Thanh điều hướng Desktop"
        className="hidden md:flex md:flex-col md:w-64 flex-none border-r border-surface-border dark:border-surface-dark-border bg-surface/90 dark:bg-surface-dark/90 backdrop-blur-md z-30 pt-safe pb-safe"
      >
        {/* Header của Sidebar: Logo & Tên ứng dụng */}
        <div className="h-14 px-5 flex items-center gap-3 border-b border-surface-border dark:border-surface-dark-border">
          <div className="w-8 h-8 rounded-lg bg-primary-600 dark:bg-primary-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-none">
            PF
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {appName}
            </h1>
            <span className="text-[10px] font-semibold text-primary-600 dark:text-primary-400">
              v{appVersion}
            </span>
          </div>
        </div>

        {/* Danh sách Menu Items của Sidebar */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-surface-muted dark:hover:bg-surface-dark-muted hover:text-slate-900 dark:hover:text-slate-100'
                }`
              }
            >
              <span className="flex-none">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Chân Sidebar (Footer thông tin) */}
        <div className="p-4 border-t border-surface-border dark:border-surface-dark-border text-center text-xs text-slate-400 dark:text-slate-500">
          <span>Web Game Hub © 2026</span>
        </div>
      </aside>

      {/* 
        ========================================================================
        2. CỘT NỘI DUNG CHÍNH (GỒM HEADER, OFFLINE BANNER, MAIN, VÀ BOTTOMNAV)
        ========================================================================
      */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* 
          A. HEADER TRÊN ĐỈNH
          - Mobile: Hiển thị Logo + Tên trang hiện tại + Action
          - Desktop: Hiển thị Tên trang hiện tại + Action
        */}
        <header className="flex-none w-full bg-surface/90 dark:bg-surface-dark/90 backdrop-blur-md border-b border-surface-border dark:border-surface-dark-border z-30 pt-safe">
          <div className="w-full max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Logo nhỏ chỉ hiện trên Mobile khi sidebar bị ẩn */}
              <div className="md:hidden w-8 h-8 rounded-lg bg-primary-600 dark:bg-primary-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-none">
                PF
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
                  {currentTitle}
                </h2>
              </div>
            </div>

            {/* Vùng Header Action (Dark Mode / Profile / v.v.) */}
            {headerAction ? (
              <div className="flex items-center gap-2 flex-none">{headerAction}</div>
            ) : null}
          </div>
        </header>

        {/* 
          B. OFFLINE BANNER (THÔNG BÁO KHI MẤT MẠNG - KHÔNG CHẶN THAO TÁC)
        */}
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="flex-none flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/15 dark:bg-amber-950/60 border-b border-amber-300/40 dark:border-amber-700/50 text-amber-800 dark:text-amber-200 text-xs font-medium text-center transition-all animate-fadeIn"
          >
            <span className="flex-none text-sm">⚡</span>
            <span>Bạn đang ở chế độ Offline — Các game offline vẫn có thể chơi bình thường.</span>
          </div>
        )}

        {/* 
          C. VÙNG MAIN (VÙNG CUỘN DUY NHẤT TRONG TOÀN BỘ ỨNG DỤNG)
          - flex-1 overflow-y-auto: Cuộn nội dung mượt mà
          - overscroll-contain: Chặn bounce giật toàn trang
          - pl-safe & pr-safe: Bảo vệ nội dung khi xoay ngang (Landscape)
        */}
        <main
          id="app-main-scroll"
          className="flex-1 overflow-y-auto overscroll-contain pl-safe pr-safe select-text focus:outline-none"
          tabIndex={-1}
        >
          <div className="w-full max-w-5xl mx-auto px-4 py-6">{children}</div>
        </main>

        {/* 
          D. MOBILE BOTTOM NAVIGATION (HIỂN THỊ DƯỚI BREAKPOINT MD - < 768px)
          - pb-safe: Padding thêm safe-area-inset-bottom cho thanh Home Bar của iPhone
          - Ẩn trên desktop (md:hidden)
          - Vùng chạm mỗi nút tối thiểu 44x44px
        */}
        <nav
          aria-label="Thanh điều hướng Mobile"
          className="flex md:hidden flex-none w-full bg-surface/90 dark:bg-surface-dark/90 backdrop-blur-md border-t border-surface-border dark:border-surface-dark-border z-30 pb-safe"
        >
          <div className="w-full max-w-lg mx-auto px-2 h-16 flex items-center justify-around">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center min-h-[44px] min-w-[44px] flex-1 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    isActive
                      ? 'text-primary-600 dark:text-primary-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`
                }
              >
                <span className="flex items-center justify-center w-6 h-6">{item.icon}</span>
                <span className="truncate leading-tight mt-0.5">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default AppShell;
