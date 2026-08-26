import React from 'react';
import { GlobalLeaderboardRow } from './GlobalLeaderboardRow';
import type { MasterEntry, GrinderEntry, MyGlobalRank } from '../../repositories/types';

export interface GlobalLeaderboardListProps {
  /** Biến thể bảng xếp hạng ('masters' hoặc 'grinders') */
  readonly variant: 'masters' | 'grinders';
  /** Danh sách người chơi trên bảng */
  readonly entries: readonly (MasterEntry | GrinderEntry)[];
  /** ID người dùng hiện tại để đánh dấu dòng 'Bạn' */
  readonly myUserId: string | null;
  /** Cờ báo đang tải dữ liệu lần đầu */
  readonly isLoading: boolean;
  /** Thứ hạng cá nhân của người dùng hiện tại */
  readonly myRank: MyGlobalRank | null;
  /** Thông điệp hiển thị khi danh sách rỗng (tùy chọn) */
  readonly emptyText?: string;
}

/**
 * Hiệu ứng khung xương tải dữ liệu (Skeleton Rows).
 */
function GlobalLeaderboardSkeleton(): React.ReactNode {
  return (
    <div
      data-testid="global-leaderboard-skeleton"
      className="flex flex-col gap-2 w-full animate-pulse"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between min-h-[60px] px-3 sm:px-4 py-2.5 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface-muted/40 dark:bg-surface-dark-muted/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-6 bg-slate-300 dark:bg-slate-700 rounded" />
            <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
            <div className="flex flex-col gap-1.5">
              <div className="w-24 sm:w-32 h-4 bg-slate-300 dark:bg-slate-700 rounded" />
              <div className="w-20 h-3 bg-slate-300 dark:bg-slate-700 rounded" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="w-16 h-4 bg-slate-300 dark:bg-slate-700 rounded" />
            <div className="w-12 h-3 bg-slate-300 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Component hiển thị danh sách Bảng Xếp Hạng Toàn Hệ Thống.
 *
 * GHI CHÚ THIẾT KẾ:
 * - Hỗ trợ 2 biến thể: Bảng Cao Thủ ('masters') và Bảng Chăm Chỉ ('grinders').
 * - Tích hợp đầy đủ 4 trạng thái: Loading, Rỗng, Dữ liệu, và Khung Hạng Của Tôi ở đáy bảng.
 * - Component thuần (Pure Component): Nhận props từ ngoài, không gọi trực tiếp repository.
 */
export const GlobalLeaderboardList: React.FC<GlobalLeaderboardListProps> = ({
  variant,
  entries,
  myUserId,
  isLoading,
  myRank,
  emptyText,
}) => {
  // 1. Trạng thái Loading
  if (isLoading) {
    return <GlobalLeaderboardSkeleton />;
  }

  // 2. Trạng thái Empty
  if (entries.length === 0) {
    const defaultEmptyMessage =
      variant === 'masters'
        ? 'Chưa có kỳ thủ nào hoàn thành định hạng (≥10 ván) trong mùa này.'
        : 'Chưa có người chơi nào nhận thưởng xu từ ván đấu trong mùa này.';

    return (
      <div
        data-testid="global-leaderboard-empty"
        className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-dashed border-surface-border dark:border-surface-dark-border bg-surface/50 dark:bg-surface-dark/50"
      >
        <span className="text-4xl mb-3 select-none">{variant === 'masters' ? '🏆' : '🪙'}</span>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 max-w-sm mb-1">
          {emptyText || defaultEmptyMessage}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Hãy thi đấu các ván online ranked để ghi tên lên bảng vàng!
        </p>
      </div>
    );
  }

  // 3. Render danh sách các dòng và Footer cá nhân
  return (
    <div data-testid="global-leaderboard-list" className="flex flex-col gap-4 w-full">
      {/* Danh sách các dòng người chơi */}
      <div className="flex flex-col gap-2 w-full" data-testid="global-leaderboard-entries">
        {entries.map((entry) => (
          <GlobalLeaderboardRow
            key={entry.userId}
            variant={variant}
            entry={entry}
            isMe={Boolean(myUserId && entry.userId === myUserId)}
          />
        ))}
      </div>

      {/* Khung chân trang: Hạng của tôi */}
      <div
        data-testid="global-my-rank-footer"
        className="sticky bottom-0 z-10 p-3 sm:p-4 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface/95 dark:bg-surface-dark/95 backdrop-blur-md shadow-lg"
      >
        {myRank && myRank.rank !== null ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Hạng của bạn:
              </span>
              <span
                data-testid="my-global-rank-value"
                className="font-mono font-black text-base sm:text-lg text-primary-600 dark:text-primary-400"
              >
                #{myRank.rank}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-right font-mono font-bold text-sm text-slate-700 dark:text-slate-200">
              {variant === 'masters' ? (
                <>
                  <span>Điểm:</span>
                  <span className="text-primary-600 dark:text-primary-400">
                    {myRank.value?.toLocaleString('vi-VN')}
                  </span>
                </>
              ) : (
                <>
                  <span>Xu:</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    🪙 {myRank.value?.toLocaleString('vi-VN')}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            data-testid="my-global-rank-guidance"
            className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
          >
            <span className="text-base select-none">💡</span>
            <p>
              {variant === 'masters'
                ? 'Bạn chưa có tên trên bảng. Cần hoàn thành định hạng ít nhất 1 trò chơi (≥10 trận) mùa này.'
                : 'Bạn chưa có tên trên bảng. Chưa kiếm được xu nào từ đấu ván mùa này — hãy tham gia đấu ngay!'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
