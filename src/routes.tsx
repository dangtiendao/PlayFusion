/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense, type ReactNode } from 'react';
import { GamepadIcon, TrophyIcon, UserIcon, SettingsIcon } from '@/components/icons/NavIcons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * ==============================================================================
 * CẤU HÌNH ĐIỀU HƯỚNG TẬP TRUNG (CENTRALIZED ROUTE CONFIGURATION)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC QUAN TRỌNG:
 * Phase P0.7 sẽ bổ sung route /game/:gameId render từ registry — không thêm route
 * game thật ở phase này. Toàn bộ menu game và router game sẽ được nạp động
 * từ src/core/registry.ts khi bước sang P0.7.
 * ==============================================================================
 */

export interface RouteConfig {
  /** Đường dẫn URL của route */
  readonly path: string;
  /** Tên hiển thị trên Header, BottomNav và Sidebar */
  readonly label: string;
  /** Icon hiển thị trên thanh điều hướng */
  readonly icon?: ReactNode;
  /** Component React hiển thị khi truy cập route */
  readonly element: ReactNode;
  /** Cho phép hiển thị trên BottomNav (mobile) và Sidebar (desktop) hay không */
  readonly showInNav: boolean;
}

// Lazy load các trang bằng React.lazy để tối ưu bundle size và chuẩn bị cho code-splitting
const HomePage = lazy(() => import('@/pages/HomePage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

/**
 * NGUỒN CẤU HÌNH ROUTE DUY NHẤT TOÀN DỰ ÁN
 */
export const APP_ROUTES: readonly RouteConfig[] = [
  {
    path: '/',
    label: 'Trò chơi',
    icon: <GamepadIcon className="w-5 h-5" />,
    element: (
      <Suspense fallback={<LoadingSpinner message="Đang tải Sảnh trò chơi..." />}>
        <HomePage />
      </Suspense>
    ),
    showInNav: true,
  },
  {
    path: '/leaderboard',
    label: 'Xếp hạng',
    icon: <TrophyIcon className="w-5 h-5" />,
    element: (
      <Suspense fallback={<LoadingSpinner message="Đang tải Bảng xếp hạng..." />}>
        <LeaderboardPage />
      </Suspense>
    ),
    showInNav: true,
  },
  {
    path: '/profile',
    label: 'Hồ sơ',
    icon: <UserIcon className="w-5 h-5" />,
    element: (
      <Suspense fallback={<LoadingSpinner message="Đang tải Hồ sơ..." />}>
        <ProfilePage />
      </Suspense>
    ),
    showInNav: true,
  },
  {
    path: '/settings',
    label: 'Cài đặt',
    icon: <SettingsIcon className="w-5 h-5" />,
    element: (
      <Suspense fallback={<LoadingSpinner message="Đang tải Cài đặt..." />}>
        <SettingsPage />
      </Suspense>
    ),
    showInNav: true,
  },
  {
    path: '*',
    label: 'Không tìm thấy trang',
    element: (
      <Suspense fallback={<LoadingSpinner message="Đang tải..." />}>
        <NotFoundPage />
      </Suspense>
    ),
    showInNav: false,
  },
];
