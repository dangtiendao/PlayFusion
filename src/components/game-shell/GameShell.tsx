import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { GameDefinition } from '@engines/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { useGameSessionStore } from '@/stores/gameSessionStore';
import { audioManager } from '@/core/audio';
import { hapticTap } from '@/core/haptics';
import { useKeyboardShortcuts } from '@/core/input';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * ==============================================================================
 * GAMESHELL - KHUNG VỎ ĐIỀU KHIỂN TRONG TRẬN ĐẤU (IN-GAME SHELL CONTAINER)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & QUY TẮC THIẾT KẾ:
 * 1. KHUNG VỎ BẤT BIẾN DÀNH CHO MỌI GAME:
 *    - Bọc quanh View của tất cả các game trong hệ thống.
 *    - Tuyệt đối KHÔNG import `src/games` hoặc viết logic `if (gameId === ...)`.
 * 2. CƠ CHẾ BACK AN TOÀN (SAFE EXIT CONFIRMATION):
 *    - Khi người chơi bấm nút Back giữa ván đấu chưa hoàn thành, hiển thị ConfirmDialog
 *      để tránh mất tiến trình do chạm nhầm.
 * 3. PAUSE OVERLAY ĐỒNG BỘ STORE:
 *    - Khi mở Pause, cập nhật `gameSessionStore.isPaused = true`.
 *    - View của game sẽ nhận prop `isPaused` từ GamePage để tự động dừng timer/animation/logic.
 * 4. FULLSCREEN API VÀ ĐẶC THÙ IOS SAFARI:
 *    - Feature detect `document.fullscreenEnabled`.
 *    - Trên iPhone (iOS Safari không hỗ trợ Fullscreen API cho thẻ div thông thường),
 *      nút Fullscreen sẽ tự động ĐƯỢC ẨN ĐI thay vì bị disable xám màu.
 * ==============================================================================
 */

export interface GameShellProps {
  /** Tờ khai năng lực của trò chơi */
  readonly definition: GameDefinition;
  /** Nội dung View của trò chơi được truyền vào */
  readonly children: ReactNode;
  /** Callback khi người chơi xác nhận thoát ván đấu */
  readonly onExit: () => void;
  /** Cờ báo ván đấu đã kết thúc hay chưa (nếu đã kết thúc thì thoát không cần hỏi) */
  readonly isGameCompleted?: boolean;
}

export const GameShell: React.FC<GameShellProps> = ({
  definition,
  children,
  onExit,
  isGameCompleted = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Zustand Stores
  const isPaused = useGameSessionStore((state) => state.isPaused);
  const pause = useGameSessionStore((state) => state.pause);
  const resume = useGameSessionStore((state) => state.resume);

  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const toggleSound = useSettingsStore((state) => state.toggleSound);

  // State cục bộ
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [canFullscreen, setCanFullscreen] = useState<boolean>(false);

  // 1. Feature detect Fullscreen API
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const isSupported =
        Boolean(document.fullscreenEnabled) ||
        Boolean(
          (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled,
        );
      setCanFullscreen(isSupported);
    }
  }, []);

  // 2. Lắng nghe thay đổi trạng thái Fullscreen (kể cả khi thoát bằng phím ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = Boolean(
        document.fullscreenElement ||
          (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement,
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 3. Xử lý Toggle Fullscreen
  const handleToggleFullscreen = useCallback(async () => {
    audioManager.playSfx('click');
    hapticTap();

    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if (
          (containerRef.current as unknown as { webkitRequestFullscreen?: () => Promise<void> })
            .webkitRequestFullscreen
        ) {
          await (
            containerRef.current as unknown as { webkitRequestFullscreen: () => Promise<void> }
          ).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (
          (document as unknown as { webkitExitFullscreen?: () => Promise<void> })
            .webkitExitFullscreen
        ) {
          await (
            document as unknown as { webkitExitFullscreen: () => Promise<void> }
          ).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('[GameShell] Lỗi khi chuyển đổi chế độ Fullscreen:', err);
    }
  }, [isFullscreen]);

  // 4. Xử lý Nút Back an toàn
  const handleBackClick = () => {
    audioManager.playSfx('click');
    if (isGameCompleted) {
      onExit();
    } else {
      setShowExitConfirm(true);
    }
  };

  const handleConfirmExit = () => {
    audioManager.playSfx('click');
    setShowExitConfirm(false);
    onExit();
  };

  const handleCancelExit = () => {
    audioManager.playSfx('click');
    setShowExitConfirm(false);
  };

  // 5. Xử lý Pause / Resume
  const handleTogglePause = useCallback(() => {
    audioManager.playSfx('click');
    hapticTap();
    if (isPaused) {
      resume();
    } else {
      pause();
    }
  }, [isPaused, pause, resume]);

  // 6. Phím tắt tiện lợi trong trận (Escape -> Pause/Resume, M -> Mute)
  useKeyboardShortcuts({
    Escape: () => {
      if (showExitConfirm) {
        setShowExitConfirm(false);
      } else {
        handleTogglePause();
      }
    },
    p: handleTogglePause,
    P: handleTogglePause,
    m: toggleSound,
    M: toggleSound,
  });

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col w-full min-h-[500px] rounded-2xl bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border shadow-md overflow-hidden ${
        isFullscreen ? 'h-screen rounded-none border-none p-4' : ''
      }`}
    >
      {/* 
        ========================================================================
        A. THANH CÔNG CỤ ĐIỀU KHIỂN TRÊN CÙNG (TOOLBAR)
        ========================================================================
      */}
      <header className="flex-none flex items-center justify-between px-3 py-2 border-b border-surface-border/80 dark:border-surface-dark-border/80 bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-sm z-20">
        {/* Nút Back về Sảnh */}
        <button
          type="button"
          onClick={handleBackClick}
          aria-label="Quay lại Sảnh trò chơi"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-surface-muted dark:hover:bg-surface-dark-muted active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <span>←</span>
          <span className="hidden sm:inline">Rời trận</span>
        </button>

        {/* Tên game */}
        <div className="flex items-center gap-2 max-w-[200px] sm:max-w-xs truncate">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {definition.name}
          </h2>
        </div>

        {/* Cụm Action Buttons: Mute, Pause, Fullscreen */}
        <div className="flex items-center gap-1">
          {/* Nút Mute / Unmute */}
          <button
            type="button"
            onClick={() => {
              audioManager.playSfx('click');
              toggleSound();
            }}
            aria-label={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted active:scale-95 transition-all focus:outline-none"
          >
            <span className="text-base">{soundEnabled ? '🔊' : '🔇'}</span>
          </button>

          {/* Nút Pause */}
          <button
            type="button"
            onClick={handleTogglePause}
            aria-label={isPaused ? 'Tiếp tục ván đấu' : 'Tạm dừng ván đấu'}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 focus:outline-none ${
              isPaused
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted'
            }`}
          >
            <span>{isPaused ? '▶️' : '⏸️'}</span>
          </button>

          {/* Nút Fullscreen (Tự động ẩn trên iPhone / thiết bị không hỗ trợ) */}
          {canFullscreen && (
            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Mở toàn màn hình'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted active:scale-95 transition-all focus:outline-none"
            >
              <span className="text-base">{isFullscreen ? '🗗' : '⛶'}</span>
            </button>
          )}
        </div>
      </header>

      {/* 
        ========================================================================
        B. VÙNG VIEW TRÒ CHƠI CHÍNH
        ========================================================================
      */}
      <div className="relative flex-1 p-3 sm:p-5 flex flex-col justify-center items-center">
        {children}

        {/* 
          ======================================================================
          C. PAUSE OVERLAY (HIỂN THỊ KHI isPaused = true)
          ======================================================================
        */}
        {isPaused && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ván đấu đang tạm dừng"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/65 backdrop-blur-xs p-6 text-center animate-fadeIn select-none"
          >
            <div className="w-full max-w-xs bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border rounded-2xl p-6 shadow-2xl space-y-4 animate-scaleUp">
              <div className="space-y-1">
                <span className="text-3xl">⏸️</span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Đang Tạm Dừng
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ván đấu đã được dừng lại tạm thời
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  ▶️ Tiếp tục ván đấu
                </button>
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(true)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface-muted dark:bg-surface-dark-muted hover:bg-slate-200 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors focus:outline-none"
                >
                  🚪 Thoát ván đấu
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 
        ========================================================================
        D. MODAL XÁC NHẬN THOÁT TRẬN (CONFIRM DIALOG)
        ========================================================================
      */}
      <ConfirmDialog
        isOpen={showExitConfirm}
        title="Xác nhận rời trận đấu?"
        message="Tiến trình ván đấu hiện tại chưa hoàn thành và sẽ bị hủy bỏ nếu bạn rời đi."
        confirmText="Rời trận"
        cancelText="Ở lại chơi tiếp"
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />
    </div>
  );
};

export default GameShell;
