import { useState } from 'react';
import { APP_CONFIG } from '@/config/app';
import { DummyEngineDemo } from '@/components/DummyEngineDemo';

export function HomePage() {
  const [testInputValue, setTestInputValue] = useState<string>('');

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Banner giới thiệu */}
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
          <span>
            {APP_CONFIG.name} v{APP_CONFIG.version}
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Sảnh Trò Chơi
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          {APP_CONFIG.description}
        </p>
      </section>

      {/* Dummy Engine Demo Component */}
      <section aria-label="Khu vực demo Engine">
        <DummyEngineDemo />
      </section>

      {/* Input Demo kiểm thử Bàn phím ảo */}
      <section className="bg-surface dark:bg-surface-dark rounded-xl border border-surface-border dark:border-surface-dark-border p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">⌨️</span>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Kiểm tra Bàn phím ảo (Virtual Keyboard Test)
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Chạm vào ô bên dưới trên điện thoại để mở bàn phím ảo. Xác nhận thanh Header và BottomNav
          vẫn giữ nguyên vị trí, không bị vỡ giao diện.
        </p>
        <input
          type="text"
          value={testInputValue}
          onChange={(e) => setTestInputValue(e.target.value)}
          placeholder="Chạm vào đây để gõ thử bàn phím ảo..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-surface-border dark:border-surface-dark-border bg-surface-muted dark:bg-surface-dark-muted text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
        />
      </section>
    </div>
  );
}

export default HomePage;
