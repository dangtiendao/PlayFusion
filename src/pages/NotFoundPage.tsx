import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="space-y-6 max-w-md mx-auto text-center py-12">
      <div className="text-6xl font-extrabold text-primary-600 dark:text-primary-400">404</div>
      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          Không tìm thấy trang
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Đường dẫn bạn yêu cầu không tồn tại hoặc đã được di chuyển sang địa chỉ khác.
        </p>
      </div>

      <div className="pt-4">
        <Link
          to="/"
          className="inline-flex items-center justify-center min-h-[44px] px-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-sm font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          <span>🏠 Quay về Trang chủ</span>
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
