import React, { useState, useEffect, useRef } from 'react';
import { calculateRemainingMs, formatMmSs } from '@/core/serverClock';

export interface MatchClockProps {
  /** Quỹ thời gian cơ bản của từng ghế (ms) do server cung cấp dạng Record<string, number> */
  readonly clock: Record<string, number> | null;
  /** Hạn chót nước đi của lượt hiện tại (ISO string) */
  readonly turnDeadline: string | null;
  /** Ghế đang tới lượt đánh (0 hoặc 1) */
  readonly currentSeat: number;
  /** Ghế của người chơi trên thiết bị này */
  readonly mySeat: number;
  /** Tên hiển thị của đối thủ */
  readonly opponentName?: string;
  /** Độ lệch giờ ước lượng giữa server và client (ms) */
  readonly clockOffset: number;
  /** Cờ ván đấu đã kết thúc */
  readonly isGameOver?: boolean;
  /** Callback kích hoạt rung haptic nhẹ khi thời gian của mình còn dưới 10 giây */
  readonly onHapticTick?: () => void;
}

/**
 * ==============================================================================
 * COMPONENT ĐỒNG HỒ THI ĐẤU VÁN CỜ TRỰC TUYẾN (SRC/GAMES/CARO/COMPONENTS/MATCHCLOCK.TSX)
 * ==============================================================================
 *
 * GHI CHÚ BẢO MẬT & KIẾN TRÚC:
 * 1. NGUYÊN TẮC CLIENT CHỈ HIỂN THỊ (DISPLAY-ONLY):
 *    - Đồng hồ chạy đếm ngược dựa trên `turnDeadline` và `clockOffset` từ Server.
 *    - Khi thời gian về 0, đồng hồ hiển thị "00:00" đứng yên và CHỜ PHÁN QUYẾT từ Server.
 *    - Client TUYỆT ĐỐI không tự ý quyết định kết quả thắng/thua khi đồng hồ chạm 0.
 * 2. HIỆU ỨNG CẢNH BÁO (ACCESSIBILITY & UX):
 *    - Còn < 30 giây: Chuyển màu đỏ cảnh báo + nhấp nháy nhẹ (tôn trọng prefers-reduced-motion).
 *    - Còn < 10 giây: Rung nhẹ haptic định kỳ mỗi 2 giây CHỈ khi là lượt của mình.
 * ==============================================================================
 */
export const MatchClock: React.FC<MatchClockProps> = ({
  clock,
  turnDeadline,
  currentSeat,
  mySeat,
  opponentName = 'Đối thủ',
  clockOffset,
  isGameOver = false,
  onHapticTick,
}) => {
  const [activeRemainingMs, setActiveRemainingMs] = useState<number>(() => {
    if (!turnDeadline || isGameOver) return 0;
    return Math.max(0, calculateRemainingMs(turnDeadline, clockOffset));
  });

  const lastHapticTimeRef = useRef<number>(0);

  // Interval cập nhật đếm ngược mỗi 500ms
  useEffect(() => {
    if (isGameOver || !turnDeadline) return;

    const updateClock = () => {
      const remaining = calculateRemainingMs(turnDeadline, clockOffset);
      const safeRemaining = Math.max(0, remaining);
      setActiveRemainingMs(safeRemaining);

      // Cảnh báo Haptic khi còn dưới 10s trong lượt của mình (mỗi 2s rung 1 lần)
      if (currentSeat === mySeat && safeRemaining > 0 && safeRemaining <= 10000 && onHapticTick) {
        const now = Date.now();
        if (now - lastHapticTimeRef.current >= 2000) {
          lastHapticTimeRef.current = now;
          onHapticTick();
        }
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 500);
    return () => clearInterval(timer);
  }, [turnDeadline, clockOffset, isGameOver, currentSeat, mySeat, onHapticTick]);

  const opponentSeat = 1 - mySeat;

  // Lấy thời gian hiển thị cho My Seat
  const myTimeMs =
    currentSeat === mySeat && !isGameOver ? activeRemainingMs : (clock?.[String(mySeat)] ?? 300000);

  // Lấy thời gian hiển thị cho Opponent Seat
  const oppTimeMs =
    currentSeat === opponentSeat && !isGameOver
      ? activeRemainingMs
      : (clock?.[String(opponentSeat)] ?? 300000);

  const isMyTurn = currentSeat === mySeat && !isGameOver;
  const isOppTurn = currentSeat === opponentSeat && !isGameOver;

  const isMyDanger = isMyTurn && myTimeMs < 30000 && myTimeMs > 0;
  const isOppDanger = isOppTurn && oppTimeMs < 30000 && oppTimeMs > 0;

  return (
    <div
      data-testid="match-clock-container"
      className="grid grid-cols-2 gap-3 w-full max-w-md mx-auto mb-2 select-none"
    >
      {/* Đồng hồ CỦA BẠN */}
      <div
        data-testid="my-clock-box"
        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 ${
          isMyTurn
            ? isMyDanger
              ? 'bg-red-500/10 border-red-500 shadow-md shadow-red-500/20'
              : 'bg-cyan-500/10 border-cyan-500 shadow-md shadow-cyan-500/20'
            : 'bg-slate-800/40 border-slate-700/50 opacity-75'
        }`}
      >
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-300">
            Bạn ({mySeat === 0 ? 'X' : 'O'})
          </span>
          <span
            className={`text-[10px] uppercase font-bold tracking-wider ${
              isMyTurn ? 'text-cyan-400' : 'text-slate-400'
            }`}
          >
            {isMyTurn ? '● Đang đánh' : 'Chờ lượt'}
          </span>
        </div>
        <div
          data-testid="my-clock-time"
          className={`font-mono text-xl font-bold tracking-wider px-2 py-0.5 rounded-lg ${
            isMyTurn
              ? isMyDanger
                ? 'text-red-400 bg-red-950/40 motion-safe:animate-pulse'
                : 'text-cyan-300 bg-slate-900/60'
              : 'text-slate-300 bg-slate-900/40'
          }`}
        >
          {formatMmSs(myTimeMs)}
        </div>
      </div>

      {/* Đồng hồ CỦA ĐỐI THỦ */}
      <div
        data-testid="opponent-clock-box"
        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all duration-300 ${
          isOppTurn
            ? isOppDanger
              ? 'bg-red-500/10 border-red-500 shadow-md shadow-red-500/20'
              : 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/20'
            : 'bg-slate-800/40 border-slate-700/50 opacity-75'
        }`}
      >
        <div className="flex flex-col max-w-[100px] truncate">
          <span className="text-xs font-semibold text-slate-300 truncate">
            {opponentName} ({opponentSeat === 0 ? 'X' : 'O'})
          </span>
          <span
            className={`text-[10px] uppercase font-bold tracking-wider ${
              isOppTurn ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            {isOppTurn ? '● Đang đánh' : 'Chờ lượt'}
          </span>
        </div>
        <div
          data-testid="opponent-clock-time"
          className={`font-mono text-xl font-bold tracking-wider px-2 py-0.5 rounded-lg ${
            isOppTurn
              ? isOppDanger
                ? 'text-red-400 bg-red-950/40 motion-safe:animate-pulse'
                : 'text-amber-300 bg-slate-900/60'
              : 'text-slate-300 bg-slate-900/40'
          }`}
        >
          {formatMmSs(oppTimeMs)}
        </div>
      </div>
    </div>
  );
};

export default MatchClock;
