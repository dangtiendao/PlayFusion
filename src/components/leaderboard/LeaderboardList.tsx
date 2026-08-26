import React from 'react';
import { LeaderboardRow } from './LeaderboardRow';
import type { LeaderboardEntry } from '../../repositories/types';

export interface LeaderboardListProps {
  /** Danh sách kỳ thủ trên bảng xếp hạng */
  readonly entries: readonly LeaderboardEntry[];
  /** ID người dùng hiện tại để đánh dấu dòng 'Bạn' */
  readonly myUserId: string | null;
  /** Cờ báo còn trang tiếp theo để tải hay không */
  readonly hasMore: boolean;
  /** Cờ báo đang trong quá trình tải thêm dữ liệu trang sau */
  readonly isLoadingMore: boolean;
  /** Callback kích hoạt tải trang kế tiếp */
  readonly onLoadMore: () => void;
  /** Cờ báo đang tải dữ liệu lần đầu */
  readonly isLoading: boolean;
  /** Thông điệp hiển thị khi danh sách rỗng (tùy chọn) */
  readonly emptyText?: string;
}

/**
 * Hiệu ứng khung xương tải dữ liệu (Skeleton Rows).
 */
function LeaderboardSkeleton(): React.ReactNode {
  return (
    <div data-testid="leaderboard-skeleton" className="flex flex-col gap-2 w-full animate-pulse">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between min-h-[56px] px-3 sm:px-4 py-2.5 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface-muted/40 dark:bg-surface-dark-muted/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-6 bg-slate-300 dark:bg-slate-700 rounded" />
            <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
            <div className="flex flex-col gap-1.5">
              <div className="w-24 sm:w-32 h-4 bg-slate-300 dark:bg-slate-700 rounded" />
              <div className="w-16 h-3.5 bg-slate-300 dark:bg-slate-700 rounded" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="w-14 h-4 bg-slate-300 dark:bg-slate-700 rounded" />
            <div className="w-20 h-3 bg-slate-300 dark:bg-slate-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Component hiển thị danh sách bảng xếp hạng hoàn chỉnh (Leaderboard List).
 *
 * GHI CHÚ THIẾT KẾ:
 * - Hỗ trợ đầy đủ 4 trạng thái: Loading ban đầu, Danh sách rỗng (Empty state), Có dữ liệu, Đang tải thêm (Loading More).
 * - Sử dụng nút bấm "Xem thêm" tường minh thay vì Infinite Scroll để tiết kiệm tài nguyên mạng và tránh gửi request liên tục ngoài ý muốn trên Free Tier.
 * - Component thuần (Pure Component): Nhận props từ ngoài, hoàn toàn không gọi repository hay chứa tên game cụ thể.
 */
export const LeaderboardList: React.FC<LeaderboardListProps> = ({
  entries,
  myUserId,
  hasMore,
  isLoadingMore,
  onLoadMore,
  isLoading,
  emptyText = 'Chưa có ai trên bảng — hãy là người đầu tiên!',
}) => {
  // 1. Trạng thái Đang tải dữ liệu ban đầu
  if (isLoading) {
    return <LeaderboardSkeleton />;
  }

  // 2. Trạng thái Danh sách rỗng
  if (entries.length === 0) {
    return (
      <div
        data-testid="leaderboard-empty-state"
        className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-surface-border dark:border-surface-dark-border bg-surface/50 dark:bg-surface-dark/50"
      >
        <span className="text-4xl mb-3" role="img" aria-label="Cúp">
          🏆
        </span>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
          Bảng xếp hạng trống
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          {emptyText}
        </p>
      </div>
    );
  }

  // 3. Trạng thái Có dữ liệu
  return (
    <div data-testid="leaderboard-list" className="flex flex-col gap-2 w-full">
      {entries.map((entry) => (
        <LeaderboardRow key={entry.userId} entry={entry} isMe={entry.userId === myUserId} />
      ))}

      {/* Nút Xem thêm (Keyset Pagination) */}
      {hasMore && (
        <div className="flex justify-center pt-3 pb-1">
          <button
            type="button"
            data-testid="load-more-btn"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200 bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border hover:bg-surface-muted dark:hover:bg-surface-dark-muted active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {isLoadingMore ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Đang tải thêm...</span>
              </>
            ) : (
              <span>Xem thêm</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
