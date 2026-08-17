import React, { useMemo, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getGameById } from '@/games/registry';
import { getCategoryConfig } from '@/games/labels';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * ==============================================================================
 * TRANG CHỨA TRÒ CHƠI ĐỘNG (DYNAMIC GAME ROUTE CONTAINER: /game/:gameId)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & KỸ THUẬT:
 * 1. ROUTE ĐỘNG DUY NHẤT: Toàn bộ trò chơi đều đi qua route `/game/:gameId`.
 *    Không khai báo route tĩnh riêng cho từng game.
 * 2. CODE-SPLITTING LAZY LOADING:
 *    - Sử dụng `React.lazy(entry.loadView)` để chỉ tải mã nguồn View của trò chơi khi người dùng truy cập.
 *    - BẮT BUỘC dùng `useMemo(() => React.lazy(...), [entry])`: Tránh việc mỗi lần GamePage re-render
 *      lại tạo ra một Lazy Component Factory mới, làm React unmount/remount toàn bộ cây DOM bàn cờ.
 * 3. ĐIỀU HƯỚNG AN TOÀN:
 *    - Nút Back sử dụng `<Link to="/">` thay vì `navigate(-1)` để đảm bảo nếu người chơi truy cập
 *      trực tiếp qua URL bookmark/chia sẻ (không có history) thì vẫn quay về Trang chủ an toàn.
 * ==============================================================================
 */

export function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();

  // 1. Tra cứu game từ Nguồn chân lý duy nhất (Registry)
  const entry = useMemo(() => (gameId ? getGameById(gameId) : undefined), [gameId]);

  // 2. Tạo Lazy Component ổn định qua useMemo
  const LazyGameView = useMemo(() => {
    if (!entry) return null;
    return React.lazy(entry.loadView);
  }, [entry]);

  // 3. Xử lý trường hợp không tìm thấy game (404)
  if (!entry || !LazyGameView) {
    return <NotFoundPage />;
  }

  const { definition } = entry;
  const categoryConfig = getCategoryConfig(definition.category);

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-6">
      {/* Thanh điều hướng đầu game */}
      <div className="flex items-center justify-between bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl px-4 py-2.5 shadow-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-surface-muted dark:hover:bg-surface-dark-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label="Quay lại Sảnh trò chơi"
        >
          <span className="text-base">←</span>
          <span>Sảnh Game</span>
        </Link>

        {/* Badge Thể loại */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${categoryConfig.badgeClass}`}
          >
            <span>{categoryConfig.emoji}</span>
            <span>{categoryConfig.name}</span>
          </span>
        </div>
      </div>

      {/* Vùng nạp và hiển thị View trò chơi */}
      <Suspense
        fallback={
          <div className="p-12 text-center">
            <LoadingSpinner message={`Đang nạp trò chơi ${definition.name}...`} />
          </div>
        }
      >
        <LazyGameView definition={definition} />
      </Suspense>
    </div>
  );
}

export default GamePage;
