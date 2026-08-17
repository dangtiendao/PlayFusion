import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * ==============================================================================
 * COMPONENT THÔNG BÁO CẬP NHẬT PHIÊN BẢN MỚI (UPDATE PROMPT)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & QUY TẮC THIẾT KẾ:
 *
 * 1. CƠ CHẾ CẬP NHẬT SERVICE WORKER (registerType: 'prompt'):
 *    - Khi Service Worker phát hiện có bản build mới tải về ở chế độ nền (precache hash mới),
 *      biến `needRefresh` chuyển sang `true`.
 *    - Người chơi bấm "Cập nhật" -> gọi `updateServiceWorker(true)` để kích hoạt SW mới
 *      và reload trang tức thì sang phiên bản mới.
 *    - Người chơi bấm "✕" -> ẩn toast trong phiên hiện tại (`setNeedRefresh(false)`).
 *
 * 2. GHI CHÚ VỀ LƯU TRỮ (PERSISTENCE):
 *    - Việc lưu trạng thái tạm hoãn cập nhật vào localStorage thuộc phạm vi Phase P0.8
 *      thông qua `storage.ts`. Ở phase này chỉ quản lý in-memory trong phiên.
 *
 * 3. GHI CHÚ KIẾN TRÚC TƯƠNG LAI (PHASE P3.x):
 *    - Khi tích hợp chế độ đấu Online (P3.x), KHÔNG hiển thị Prompt này nếu người chơi
 *      đang ở trong phòng đấu (ví dụ `isInMatch === true`) để tránh che màn hình hoặc
 *      gây bấm nhầm làm mất ván cờ. Điều kiện này sẽ được bổ sung tại Phase P3.x.
 * ==============================================================================
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        console.log('PWA Service Worker registered:', registration.scope);
      }
    },
    onRegisterError(error) {
      console.error('PWA Service Worker registration error:', error);
    },
  });

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleClose = () => {
    setNeedRefresh(false);
  };

  if (!needRefresh) {
    return null;
  }

  return (
    <aside
      aria-label="Thông báo cập nhật phiên bản"
      role="alert"
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-md border border-primary-500/50 shadow-2xl rounded-2xl p-4 transition-all duration-300 animate-slideUp"
    >
      <div className="flex items-start gap-3.5">
        {/* Icon Tên lửa cập nhật */}
        <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-950/70 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xl flex-none shadow-xs">
          🚀
        </div>

        {/* Nội dung thông báo */}
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
            Đã có phiên bản mới!
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Cập nhật ngay để trải nghiệm các tính năng mới và bản sửa lỗi mới nhất.
          </p>

          {/* Nút thao tác */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleUpdate}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 flex items-center justify-center gap-1.5"
            >
              <span>⚡ Cập nhật ngay</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-surface-muted dark:hover:bg-surface-dark-muted text-xs font-medium transition-all focus:outline-none"
            >
              <span>Để sau</span>
            </button>
          </div>
        </div>

        {/* Nút đóng nhanh góc trên */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Đóng thông báo cập nhật"
          className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors focus:outline-none"
        >
          <span className="text-lg leading-none">✕</span>
        </button>
      </div>
    </aside>
  );
}

export default UpdatePrompt;
