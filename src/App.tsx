import { useState } from 'react';
import { APP_CONFIG } from '@/config/app';
import { DummyEngineDemo } from '@/components/DummyEngineDemo';

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

        {/* Dummy Engine Integration Verification Component */}
        <DummyEngineDemo />

        {/* Theme Settings & Toggle */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:bg-surface-muted dark:hover:bg-surface-dark-muted text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
          >
            {isDark ? '☀️ Chuyển sang Light Mode' : '🌙 Chuyển sang Dark Mode'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
