import { useState, useEffect } from 'react';
import { useSettingsStore, type ThemePreference } from '@/stores/settingsStore';
import { APP_CONFIG } from '@/config/app';
import { audioManager } from '@/core/audio';
import { hapticTap, hapticSuccess, isHapticSupported } from '@/core/haptics';
import { useUnifiedPress } from '@/core/input';

/**
 * ==============================================================================
 * TRANG CÀI ĐẶT HỆ THỐNG (SETTINGS PAGE)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. Toàn bộ cài đặt được quản lý qua `useSettingsStore` và tự động lưu vào localStorage (`wgh:v1:settings`).
 * 2. Đạt chuẩn Mobile-First UX: Vùng chạm $\ge 44\times 44\text{px}$, hiệu ứng chuyển trạng thái mượt mà.
 * 3. Tích hợp công cụ chẩn đoán phần cứng (Audio, Haptics, Unified Press) phục vụ kiểm chứng P0.8b.
 * ==============================================================================
 */

export function SettingsPage() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const toggleSound = useSettingsStore((state) => state.toggleSound);
  const hapticEnabled = useSettingsStore((state) => state.hapticEnabled);
  const toggleHaptic = useSettingsStore((state) => state.toggleHaptic);

  // State chẩn đoán phần cứng cho Demo P0.8b
  const [audioState, setAudioState] = useState<string>('Đang kiểm tra...');
  const [pressCount, setPressCount] = useState<number>(0);

  useEffect(() => {
    const updateAudioState = () => {
      setAudioState(audioManager.getState());
    };
    updateAudioState();
    const timer = setInterval(updateAudioState, 1000);
    return () => clearInterval(timer);
  }, []);

  const pressHandlers = useUnifiedPress(() => {
    setPressCount((c) => c + 1);
    hapticTap();
    audioManager.playSfx('click');
  });

  const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'light', label: 'Sáng', icon: '☀️' },
    { value: 'dark', label: 'Tối', icon: '🌙' },
    { value: 'system', label: 'Hệ thống', icon: '📱' },
  ];

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-8">
      {/* Tiêu đề trang */}
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
          <span>⚙️ Tùy Chỉnh</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Cài Đặt Hệ Thống
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Tùy chỉnh giao diện, âm thanh và hiệu ứng phản hồi ván đấu.
        </p>
      </section>

      {/* 1. NHÓM CÀI ĐẶT GIAO DIỆN (THEME) */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Giao diện hiển thị (Theme)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Lựa chọn chế độ sáng, tối hoặc tự động theo thiết bị
          </p>
        </div>

        {/* Segmented Control Lựa chọn Theme */}
        <div
          role="radiogroup"
          aria-label="Chọn theme giao diện"
          className="grid grid-cols-3 gap-2 bg-surface-muted dark:bg-surface-dark-muted p-1.5 rounded-xl"
        >
          {themeOptions.map((option) => {
            const isSelected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setTheme(option.value)}
                className={`min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-xs ${
                  isSelected
                    ? 'bg-surface dark:bg-surface-dark text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. NHÓM CÀI ĐẶT HIỆU ỨNG & ÂM THANH */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Âm thanh & Rung phản hồi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hiệu ứng khi di chuyển quân cờ, ăn quân và kết thúc ván
          </p>
        </div>

        {/* Toggle Âm thanh */}
        <div className="flex items-center justify-between py-2 border-b border-surface-border/60 dark:border-surface-dark-border/60">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Hiệu ứng Âm thanh
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phát âm thanh khi đánh cờ, thắng trận hoặc cảnh báo
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            onClick={toggleSound}
            aria-label="Bật hoặc tắt hiệu ứng âm thanh"
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px] min-w-[44px] items-center p-0.5 ${
              soundEnabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                soundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Toggle Rung */}
        <div className="flex items-center justify-between py-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Rung phản hồi (Haptic)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rung nhẹ khi chạm và thực hiện nước đi trên điện thoại
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hapticEnabled}
            onClick={toggleHaptic}
            aria-label="Bật hoặc tắt rung phản hồi"
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px] min-w-[44px] items-center p-0.5 ${
              hapticEnabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                hapticEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      {/* 3. KHU VỰC CHẨN ĐOÁN PHẦN CỨNG & KIỂM TRA THIẾT BỊ (DEMO P0.8b) */}
      {/* GHI CHÚ: DEMO P0.8b — GameShell P0.8c sẽ là nơi dùng thật, khu này giữ lại làm công cụ chẩn đoán */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-primary-200 dark:border-primary-800/60 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              🛠️ Chẩn Đoán & Kiểm Tra Thiết Bị
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Công cụ kiểm thử trực tiếp Web Audio, Vibration và Pointer Input
            </p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold border border-primary-200 dark:border-primary-800">
            P0.8b Test
          </span>
        </div>

        {/* Trạng thái AudioContext & Haptics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-surface-muted dark:bg-surface-dark-muted space-y-1">
            <span className="text-slate-500">AudioContext:</span>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  audioState === 'running' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{audioState}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-surface-muted dark:bg-surface-dark-muted space-y-1">
            <span className="text-slate-500">Vibration API:</span>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isHapticSupported() ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span>{isHapticSupported() ? 'Hỗ trợ' : 'Không hỗ trợ (iOS)'}</span>
            </div>
          </div>
        </div>

        {/* Nút thử Âm thanh & Rung */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => audioManager.playSfx('click')}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-surface-muted dark:bg-surface-dark-muted hover:bg-primary-50 dark:hover:bg-primary-950/50 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-surface-border dark:border-surface-dark-border active:scale-95 transition-all"
          >
            🔊 Thử Âm Click
          </button>
          <button
            type="button"
            onClick={() => audioManager.playSfx('success')}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-surface-muted dark:bg-surface-dark-muted hover:bg-primary-50 dark:hover:bg-primary-950/50 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-surface-border dark:border-surface-dark-border active:scale-95 transition-all"
          >
            🎉 Thử Âm Thắng
          </button>
          <button
            type="button"
            onClick={hapticTap}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-surface-muted dark:bg-surface-dark-muted hover:bg-primary-50 dark:hover:bg-primary-950/50 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-surface-border dark:border-surface-dark-border active:scale-95 transition-all"
          >
            📳 Thử Rung Nhẹ (Tap)
          </button>
          <button
            type="button"
            onClick={hapticSuccess}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-surface-muted dark:bg-surface-dark-muted hover:bg-primary-50 dark:hover:bg-primary-950/50 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-surface-border dark:border-surface-dark-border active:scale-95 transition-all"
          >
            ⚡ Thử Rung Chuỗi
          </button>
        </div>

        {/* Nút kiểm tra Unified Pointer Press */}
        <div className="pt-2 border-t border-surface-border/60 dark:border-surface-dark-border/60">
          <button
            type="button"
            {...pressHandlers}
            className="w-full min-h-[44px] p-3 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-800 text-xs text-primary-700 dark:text-primary-300 font-semibold flex items-center justify-between active:scale-[0.99] transition-all select-none"
          >
            <span>👉 Thử Unified Press (Chống double-fire & vuốt cuộn):</span>
            <span className="px-2 py-0.5 rounded-lg bg-primary-600 text-white font-mono">
              {pressCount} lần chạm
            </span>
          </button>
        </div>
      </section>

      {/* 4. NHÓM THÔNG TIN PHIÊN BẢN */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Phiên bản Ứng dụng
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              PlayFusion Progressive Web App (PWA)
            </p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-mono font-bold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
            v{APP_CONFIG.version}
          </span>
        </div>
      </section>
    </div>
  );
}

export default SettingsPage;
