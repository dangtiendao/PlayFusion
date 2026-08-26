/**
 * ==============================================================================
 * BANNER THÔNG BÁO MÙA GIẢI MỚI (SRC/COMPONENTS/SEASON/NEWSEASONBANNER.TSX)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & TRẢI NGHIỆM NGƯỜI DÙNG:
 * 1. CƠ CHẾ HIỂN THỊ 1 LẦN (LOCAL STORAGE GUARD):
 *    - Sử dụng key `wgh:v1:lastSeenSeason` trong LocalStorage.
 *    - Khi người dùng đăng nhập/vào app và phát hiện `activeSeason.id` lớn hơn mùa đã xem,
 *      banner sẽ xuất hiện 1 lần duy nhất để chào mừng.
 *    - Nhấn nút "Đã hiểu" sẽ lưu ID mùa mới vào LocalStorage và đóng banner vĩnh viễn.
 * ==============================================================================
 */

import React, { useState, useEffect } from 'react';
import type { Season } from '@/repositories/types';
import { audioManager } from '@/core/audio';
import { hapticTap } from '@/core/haptics';

export const LAST_SEEN_SEASON_KEY = 'wgh:v1:lastSeenSeason';

export interface NewSeasonBannerProps {
  /** Mùa giải đang active từ catalogRepository */
  readonly activeSeason: Season | null;
  /** Class CSS tùy biến */
  readonly className?: string;
}

export const NewSeasonBanner: React.FC<NewSeasonBannerProps> = ({
  activeSeason,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!activeSeason || !activeSeason.id) {
      setIsVisible(false);
      return;
    }

    try {
      const storedVal = localStorage.getItem(LAST_SEEN_SEASON_KEY);
      if (storedVal === null) {
        // Lần đầu người dùng vào app:
        // Nếu là Mùa 1 -> Lưu luôn không cần hiện banner
        // Nếu từ Mùa 2 trở lên -> Hiện banner chào mừng
        if (activeSeason.id > 1) {
          setIsVisible(true);
        } else {
          localStorage.setItem(LAST_SEEN_SEASON_KEY, String(activeSeason.id));
          setIsVisible(false);
        }
      } else {
        const lastSeenId = Number.parseInt(storedVal, 10);
        if (!Number.isNaN(lastSeenId) && activeSeason.id > lastSeenId) {
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      }
    } catch {
      // Bỏ qua lỗi LocalStorage trên môi trường bị chặn
      setIsVisible(false);
    }
  }, [activeSeason]);

  const handleDismiss = () => {
    hapticTap();
    audioManager.playSfx('click');

    if (activeSeason?.id) {
      try {
        localStorage.setItem(LAST_SEEN_SEASON_KEY, String(activeSeason.id));
      } catch {
        // Bỏ qua lỗi
      }
    }
    setIsVisible(false);
  };

  if (!isVisible || !activeSeason) {
    return null;
  }

  return (
    <aside
      data-testid="new-season-banner"
      aria-label="Thông báo khởi tranh mùa giải mới"
      className={`relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-indigo-500/15 via-primary-500/15 to-purple-500/15 border border-primary-500/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-xl flex-shrink-0 shadow-inner">
          🎉
        </div>
        <div className="space-y-0.5 min-w-0">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
            <span>{activeSeason.name} đã chính thức khởi tranh!</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-600 text-white font-black uppercase tracking-wider">
              MỚI
            </span>
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Điểm xếp hạng đã được làm mới một phần (Soft-Reset), huy hiệu mùa trước đã được lưu trữ
            vĩnh viễn vào Hồ sơ.
          </p>
        </div>
      </div>

      <button
        type="button"
        data-testid="dismiss-season-banner-btn"
        onClick={handleDismiss}
        className="self-end sm:self-center px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition-all shadow-xs active:scale-95 flex-shrink-0"
      >
        Đã hiểu
      </button>
    </aside>
  );
};
