import React, { useEffect } from 'react';

/**
 * ==============================================================================
 * MODAL XÁC NHẬN THAO TÁC AN TOÀN (CONFIRM DIALOG)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Dùng để cảnh báo khi người dùng nhấn nút Back/Thoát trong trận để chống bấm nhầm mất ván đấu.
 * - Đáp ứng chuẩn Mobile-First: Vùng chạm các nút $\ge 44\times 44\text{px}$, backdrop mờ.
 * ==============================================================================
 */

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmText?: string;
  readonly cancelText?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Thoát trận',
  cancelText = 'Ở lại',
  onConfirm,
  onCancel,
}) => {
  // Lắng nghe phím Escape để hủy dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
    >
      <div className="w-full max-w-sm bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl p-5 shadow-2xl space-y-4 animate-scaleUp">
        {/* Tiêu đề & Nội dung cảnh báo */}
        <div className="space-y-1.5 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl mb-2">
            ⚠️
          </div>
          <h3
            id="confirm-dialog-title"
            className="text-base font-bold text-slate-900 dark:text-white"
          >
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Nút hành động */}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface-muted dark:bg-surface-dark-muted hover:bg-slate-200 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
