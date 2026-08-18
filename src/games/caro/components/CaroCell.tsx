/**
 * ==============================================================================
 * CARO CELL COMPONENT (Ô CỜ CARO TỐI ƯU RE-RENDER)
 * ==============================================================================
 *
 * ⚠️ QUY TẮC HIỆU NĂNG BẮT BUỘC:
 * - Bọc trong `React.memo` với so sánh nông (Shallow Compare).
 * - Mọi props truyền vào PHẢI LÀ KIỂU NGUYÊN THỦY (primitive: number, boolean)
 *   hoặc callback có reference ổn định từ component cha.
 * - Nhờ đó, khi bàn cờ 15x15 (225 ô) có 1 nước đi mới, CHỈ CÓ 2 Ô re-render:
 *   ô vừa đánh và ô nước đi trước đó (`lastMove`). 223 ô còn lại giữ nguyên!
 *
 * ⚠️ VẼ QUÂN CỜ BẰNG SVG VECTOR:
 * - KHÔNG sử dụng text ký tự 'X' / 'O' vì font chữ khác nhau sẽ làm lệch tâm
 *   và kích thước không đồng nhất.
 * - SVG vector nội dòng đảm bảo độ sắc nét 100% trên màn hình Retina / Mobile High-DPI.
 */

import React, { memo, useCallback } from 'react';

export interface CaroCellProps {
  /** Index của ô trong mảng bàn cờ (0..size*size-1) */
  readonly index: number;
  /** Giá trị quân cờ tại ô (-1: trống, 0: quân X, 1: quân O) */
  readonly value: number;
  /** Ô này có phải là nước đi cuối cùng vừa đánh không? */
  readonly isLast: boolean;
  /** Ô này có thuộc chuỗi thắng cuộc không? */
  readonly isWin: boolean;
  /** Ô này có đang hiển thị preview nước đi không? (P1.3b dùng) */
  readonly isPreview: boolean;
  /** Người chơi của nước đi preview (0: X, 1: O) */
  readonly previewPlayer?: number;
  /** Kích thước cạnh ô tính theo pixel */
  readonly cellSizePx: number;
  /** Callback khi người chơi chạm/click vào ô */
  readonly onPointerDown?: (index: number) => void;
}

/**
 * Icon quân X vẽ bằng SVG vector nét bo tròn.
 */
const PieceX: React.FC<{ isPreview?: boolean }> = ({ isPreview }) => (
  <svg
    viewBox="0 0 24 24"
    className={`w-[72%] h-[72%] text-cyan-500 dark:text-cyan-400 stroke-current transition-transform duration-120 motion-reduce:transition-none ${
      isPreview ? 'opacity-50 scale-90' : 'scale-100'
    }`}
    fill="none"
  >
    <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" strokeWidth="3" strokeLinecap="round" />
    <line x1="19.5" y1="4.5" x2="4.5" y2="19.5" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/**
 * Icon quân O vẽ bằng SVG vector nét bo tròn.
 */
const PieceO: React.FC<{ isPreview?: boolean }> = ({ isPreview }) => (
  <svg
    viewBox="0 0 24 24"
    className={`w-[72%] h-[72%] text-rose-500 dark:text-rose-400 stroke-current transition-transform duration-120 motion-reduce:transition-none ${
      isPreview ? 'opacity-50 scale-90' : 'scale-100'
    }`}
    fill="none"
  >
    <circle cx="12" cy="12" r="7.5" strokeWidth="3" />
  </svg>
);

export const CaroCell = memo<CaroCellProps>(function CaroCell({
  index,
  value,
  isLast,
  isWin,
  isPreview,
  previewPlayer = 0,
  cellSizePx,
  onPointerDown,
}) {
  const handlePointerDown = useCallback(() => {
    if (onPointerDown) {
      onPointerDown(index);
    }
  }, [index, onPointerDown]);

  // Xác định quân cờ cần vẽ (quân thật hoặc quân preview)
  const pieceToRender = value !== -1 ? value : isPreview ? previewPlayer : -1;

  // Lớp CSS viền và nền ô cờ
  let cellBgClass =
    'bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/90 dark:hover:bg-slate-700/80';
  if (isWin) {
    cellBgClass = 'bg-amber-400/30 dark:bg-amber-400/35 animate-pulse';
  } else if (isLast) {
    cellBgClass = 'bg-indigo-50 dark:bg-indigo-950/40';
  }

  // Viền và hiệu ứng highlight
  let cellHighlightClass = '';
  if (isWin) {
    cellHighlightClass = 'ring-2 ring-amber-400 dark:ring-amber-300 ring-inset z-10';
  } else if (isLast) {
    cellHighlightClass = 'ring-2 ring-indigo-500 dark:ring-indigo-400 ring-inset z-10';
  } else if (isPreview) {
    cellHighlightClass = 'border-2 border-dashed border-cyan-400/70 dark:border-cyan-300/70 z-10';
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`caro-cell-${index}`}
      data-cell-index={index}
      data-last-move={isLast ? 'true' : undefined}
      data-win-line={isWin ? 'true' : undefined}
      data-preview={isPreview ? 'true' : undefined}
      data-value={value}
      onPointerDown={handlePointerDown}
      style={{
        width: `${cellSizePx}px`,
        height: `${cellSizePx}px`,
      }}
      className={`relative flex items-center justify-center border border-slate-300/80 dark:border-slate-700/70 select-none transition-colors duration-100 cursor-pointer ${cellBgClass} ${cellHighlightClass}`}
    >
      {/* Marker chấm tròn nhỏ ở góc trên phải cho nước đi cuối cùng */}
      {isLast && (
        <span
          data-testid="last-move-marker"
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 shadow-sm"
        />
      )}

      {/* Render quân cờ X hoặc O */}
      {pieceToRender === 0 && <PieceX isPreview={value === -1 && isPreview} />}
      {pieceToRender === 1 && <PieceO isPreview={value === -1 && isPreview} />}
    </div>
  );
});
