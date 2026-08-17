import { APP_CONFIG } from '@/config/app';

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <span>⚙️ Tùy Chỉnh</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Cài Đặt Hệ Thống
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          Quản lý âm thanh, hiệu ứng, thông báo và hiển thị giao diện.
        </p>
      </section>

      {/* Placeholder Cài đặt */}
      <section className="bg-surface dark:bg-surface-dark rounded-xl border border-surface-border dark:border-surface-dark-border p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between py-2 border-b border-surface-border dark:border-surface-dark-border">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Hiệu ứng Âm thanh
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phát âm thanh khi đánh cờ hoặc thắng trận
            </p>
          </div>
          <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">Bật</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-surface-border dark:border-surface-dark-border">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Giao diện Dark Mode
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tự động hoặc tùy chỉnh theo sở thích
            </p>
          </div>
          <span className="text-xs text-slate-500">Nút góc trên Header</span>
        </div>

        {/* Thông tin Phiên bản Ứng dụng để kiểm chứng trực quan Luồng Update */}
        <div className="flex items-center justify-between py-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Phiên bản Ứng dụng
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Thông tin phiên bản PWA đang chạy trong máy
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
            v{APP_CONFIG.version}
          </span>
        </div>
      </section>
    </div>
  );
}

export default SettingsPage;
