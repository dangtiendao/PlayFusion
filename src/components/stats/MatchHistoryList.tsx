import React from 'react';
import type { MatchSummary } from '@/repositories/types';
import { getModeKeyLabel, getOutcomeConfig } from '@/games/labels';
import { formatRelativeTime, formatDurationMs } from '@/core/text';

/**
 * ==============================================================================
 * DANH SÁCH LỊCH SỬ VÁN ĐẤU GENERIC (MATCH HISTORY LIST)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. COMPONENT THUẦN (PURE COMPONENT):
 *    - Nhận hàm `getGameName(gameId)` từ props do trang cha (ProfilePage) bơm vào
 *      thông qua Registry. Không tự import registry.
 * 2. XÁC ĐỊNH KẾT QUẢ THEO USER (MY USER ID):
 *    - Duyệt danh sách `participants` để tìm ghế của `myUserId` và hiển thị nhãn
 *      Thắng (✓), Thua (✗) hoặc Hòa (=).
 *    - Riêng chế độ 2 người 1 máy (`local_pvp`): Luôn hiển thị Icon trung tính (👥)
 *      vì đây là ván đấu đối kháng cục bộ, không phải thành tích cá nhân (P1.5a).
 * 3. SẴN SÀNG CHO REPLAY (PHASE P8.1):
 *    - Cấu trúc dòng trận đấu đã có sẵn các thông tin nhận diện để gắn nút "Xem lại" (Replay)
 *      khi hệ thống Replay Engine hoàn thiện ở Phase P8.1.
 * ==============================================================================
 */

export interface MatchHistoryListProps {
  /** Danh sách các ván đấu gần đây */
  readonly matches: MatchSummary[];
  /** ID người dùng hiện tại để xác định thắng/thua */
  readonly myUserId?: string | null;
  /** Hàm chuyển đổi gameId sang tên tiếng Việt của trò chơi */
  readonly getGameName: (gameId: string) => string;
  /** Thông điệp hiển thị khi danh sách trống */
  readonly emptyText?: string;
  /** Cờ trạng thái đang tải (Skeleton Loading) */
  readonly isLoading?: boolean;
}

export const MatchHistoryList = React.memo(function MatchHistoryList({
  matches,
  myUserId,
  getGameName,
  emptyText = 'Chưa có lịch sử ván đấu nào.',
  isLoading = false,
}: MatchHistoryListProps) {
  // 1. SKELETON LOADING STATE
  if (isLoading) {
    return (
      <div data-testid="match-history-skeleton" className="space-y-2.5 animate-pulse">
        {[1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3.5 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
              <div className="space-y-1.5">
                <div className="w-24 h-4 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="w-16 h-3 rounded bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
            <div className="space-y-1 text-right">
              <div className="w-16 h-3.5 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="w-10 h-3 rounded bg-slate-200 dark:bg-slate-800 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 2. EMPTY STATE
  if (!matches || matches.length === 0) {
    return (
      <div
        data-testid="match-history-empty"
        className="p-6 rounded-2xl border border-surface-border/60 dark:border-surface-dark-border/60 bg-surface-muted dark:bg-surface-dark-muted text-center space-y-1"
      >
        <span className="text-2xl">📜</span>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 italic">{emptyText}</p>
      </div>
    );
  }

  return (
    <div data-testid="match-history-list" className="space-y-2.5">
      {matches.map((match) => {
        const isLocalPvp = match.mode === 'local_pvp';

        // Xác định kết quả của người dùng trong trận
        let myOutcome: 'win' | 'loss' | 'draw' | 'neutral' = 'neutral';
        if (isLocalPvp) {
          myOutcome = 'neutral';
        } else if (match.participants && match.participants.length > 0) {
          const myParticipant = myUserId
            ? match.participants.find((p) => p.userId === myUserId)
            : match.participants.find((p) => !p.isBot);
          myOutcome = myParticipant?.result ?? 'neutral';
        }

        const outcomeConfig = getOutcomeConfig(myOutcome);
        const gameTitle = getGameName(match.gameId);
        const modeTitle = getModeKeyLabel(match.mode);
        const relativeTime = formatRelativeTime(match.startedAt);
        const durationText = formatDurationMs(match.durationMs);

        return (
          <div
            key={match.id}
            data-testid={`match-row-${match.id}`}
            className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark hover:border-primary-200 dark:hover:border-primary-800 transition-all shadow-sm"
          >
            {/* Cột trái: Badge Kết quả + Tên game + Chế độ */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                data-testid={`outcome-badge-${match.id}`}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-sm sm:text-base border flex-shrink-0 shadow-sm ${outcomeConfig.badgeClass}`}
                title={outcomeConfig.label}
              >
                {outcomeConfig.icon}
              </div>

              <div className="min-w-0 space-y-0.5">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {gameTitle}
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {modeTitle}
                  </span>
                  {match.isRanked && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold">
                      Ranked
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Cột phải: Thời gian tương đối + Thời lượng ván */}
            <div className="text-right flex-shrink-0 space-y-0.5 pl-2">
              <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {relativeTime}
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                ⏱️ {durationText}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
