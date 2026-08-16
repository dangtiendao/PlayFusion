import { useState } from 'react';
import { APP_CONFIG } from '@/config/app';

export function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggleDarkMode = (): void => {
    const nextState = !isDark;
    setIsDark(nextState);
    if (nextState) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-200">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
            <span>Phiên bản v{APP_CONFIG.version}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {APP_CONFIG.name}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            {APP_CONFIG.description}
          </p>
        </header>

        {/* Demo Card */}
        <div className="bg-surface-subtle dark:bg-surface-dark-subtle border border-surface-border dark:border-surface-dark-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border dark:border-surface-dark-border pb-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Cấu hình Giao diện (Mobile-First)
            </h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-success-DEFAULT dark:bg-green-950/60 dark:text-green-400">
              Tailwind Active
            </span>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Layout được thiết kế tối ưu hóa 1 cột trên màn hình điện thoại (375px) và tự động căn
            giữa có giới hạn độ rộng trên màn hình lớn.
          </p>

          {/* Theme State Indicator */}
          <div className="p-3 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-500 dark:text-slate-400">Chế độ hiện tại:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {isDark ? '🌙 Dark Mode (Tối)' : '☀️ Light Mode (Sáng)'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-primary hover:bg-primary-hover active:scale-[0.98] transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              Nút Chính (Primary)
            </button>
            <button
              type="button"
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-danger hover:bg-danger-hover active:scale-[0.98] transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-danger/50"
            >
              Nút Nguy hiểm (Danger)
            </button>
          </div>
        </div>

        {/* Temporary Dark Mode Toggle */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted text-slate-700 dark:text-slate-200 transition-colors"
          >
            {isDark ? '☀️ Chuyển sang Light Mode' : '🌙 Chuyển sang Dark Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
