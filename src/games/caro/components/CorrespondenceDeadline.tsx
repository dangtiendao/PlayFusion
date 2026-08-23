/**
 * ==============================================================================
 * CORRESPONDENCE DEADLINE COMPONENT (CORRESPONDENCEDEADLINE.TSX - P3.6c)
 * ==============================================================================
 *
 * HIỂN THỊ HẠN NƯỚC ĐI THÂN THIỆN CHO CHẾ ĐỘ ĐẤU THEO LƯỢT:
 * 1. ĐỊNH DẠNG 3 MỨC:
 *    - >= 1 giờ: "Còn X giờ Y phút để đi nước" (Thân thiện, không đếm giây gây stress).
 *    - < 1 giờ: Màu vàng Warning ("Còn M phút").
 *    - < 10 phút: Màu đỏ Danger + đếm mm:ss thật ("Còn 09:45" - tôn trọng reduced-motion).
 *    - Quá hạn: Màu đỏ "Đã quá hạn!".
 * 2. BANNER LƯỢT:
 *    - isMyTurn = true: "👑 Lượt của bạn — còn X"
 *    - isMyTurn = false: "⏳ Chờ đối thủ — họ còn X"
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { calculateRemainingMs, formatCorrespondenceRemaining } from '@/core/serverClock';

export interface CorrespondenceDeadlineProps {
  /** Mốc thời gian deadline từ server (ISO string) */
  readonly turnDeadline: string | null;
  /** Độ lệch đồng hồ giữa server và client (ms) */
  readonly clockOffset?: number;
  /** Có phải đang tới lượt của người chơi không */
  readonly isMyTurn: boolean;
  /** Ván đấu đã kết thúc chưa */
  readonly isGameOver: boolean;
  /** Tên hiển thị của đối thủ */
  readonly opponentName: string;
  /** Callback âm thanh / haptic nhịp đếm */
  readonly onTick?: () => void;
  /** ClassName tùy biến */
  readonly className?: string;
}

export const CorrespondenceDeadline: React.FC<CorrespondenceDeadlineProps> = ({
  turnDeadline,
  clockOffset = 0,
  isMyTurn,
  isGameOver,
  opponentName,
  onTick,
  className = '',
}) => {
  const [now, setNow] = useState(() => Date.now());

  // Interval cập nhật: 1s nếu < 10 phút, 10s nếu >= 10 phút
  useEffect(() => {
    if (isGameOver || !turnDeadline) return;

    const remaining = calculateRemainingMs(turnDeadline, clockOffset, Date.now());
    const intervalMs = remaining < 10 * 60 * 1000 ? 1000 : 10000;

    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      const currentRemaining = calculateRemainingMs(turnDeadline, clockOffset, currentNow);
      if (currentRemaining < 10 * 60 * 1000 && currentRemaining > 0) {
        onTick?.();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [turnDeadline, clockOffset, isGameOver, onTick]);

  const remainingMs = useMemo(() => {
    if (!turnDeadline || isGameOver) return 0;
    return Math.max(0, calculateRemainingMs(turnDeadline, clockOffset, now));
  }, [turnDeadline, clockOffset, isGameOver, now]);

  const { text, level } = useMemo(() => formatCorrespondenceRemaining(remainingMs), [remainingMs]);

  if (isGameOver) {
    return null;
  }

  // Style theo mức độ khẩn cấp
  const levelStyles = {
    normal: 'bg-slate-800/80 border-slate-700 text-slate-200',
    warning: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    danger:
      'bg-rose-500/20 border-rose-500/50 text-rose-400 font-mono animate-pulse motion-reduce:animate-none',
    expired: 'bg-rose-600/30 border-rose-500 text-rose-300 font-black',
  };

  return (
    <div
      data-testid="correspondence-deadline-banner"
      className={`w-full px-4 py-3 rounded-2xl border shadow-md flex items-center justify-between transition-all ${levelStyles[level]} ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg flex-shrink-0">{isMyTurn ? '👑' : '⏳'}</span>
        <div className="truncate">
          <p className="text-xs font-bold truncate">
            {isMyTurn ? 'Lượt của bạn' : `Chờ ${opponentName}`}
          </p>
          <p className="text-[11px] opacity-80 truncate">
            {isMyTurn ? 'Hãy đi một nước trước khi hết hạn' : `Đối thủ đang có thời gian suy nghĩ`}
          </p>
        </div>
      </div>

      <div
        data-testid="correspondence-time-display"
        className={`px-3 py-1.5 rounded-xl border flex-shrink-0 text-xs font-bold flex items-center gap-1.5 ${
          level === 'danger' || level === 'expired'
            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
            : level === 'warning'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
              : 'bg-slate-700/60 border-slate-600/60 text-slate-200'
        }`}
      >
        <span>🕒</span>
        <span>{text}</span>
      </div>
    </div>
  );
};

export default CorrespondenceDeadline;
