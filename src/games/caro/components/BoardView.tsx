/**
 * ==============================================================================
 * CARO BOARD VIEW COMPONENT (HIỂN THỊ THUẦN BÀN CỜ CARO)
 * ==============================================================================
 *
 * ⚠️ ĐẶC TẢ THIẾT KẾ:
 * - Là component hiển thị thuần ("Dumb Component"): CHỈ nhận props và render.
 * - Tuyệt đối KHÔNG import engine, AI, hay store vào component này.
 * - Kích thước ô cờ `cellSizePx` do component cha truyền vào (phục vụ Zoom ở P1.3b).
 * - Sử dụng CSS Grid tạo lưới bàn cờ chuẩn xác, kết hợp `CaroCell` bọc `React.memo`
 *   để tối ưu hóa hiệu năng re-render tuyệt đối.
 */

import React, { useMemo, useCallback } from 'react';
import { CaroCell } from './CaroCell';

export interface BoardViewProps {
  /** Mảng 1 chiều trạng thái bàn cờ (size * size phần tử: -1 là trống, 0 là X, 1 là O) */
  readonly board: readonly number[];
  /** Kích thước cạnh bàn cờ (ví dụ: 15 cho bàn 15x15) */
  readonly boardSize: number;
  /** Index ô của nước đi cuối cùng (0..size*size-1 hoặc null) */
  readonly lastMove: number | null;
  /** Danh sách index các ô thuộc chuỗi thắng 5 quân (hoặc null) */
  readonly winLine: readonly number[] | null;
  /** Index ô đang preview trước khi xác nhận đánh (P1.3b dùng) */
  readonly previewCell?: number | null;
  /** Người chơi của nước đi preview (0: X, 1: O) */
  readonly previewPlayer?: number;
  /** Kích thước 1 ô cờ tính theo pixel (do cha quyết định) */
  readonly cellSizePx: number;
  /** Callback khi người chơi chạm/click vào ô cờ (sẵn sàng cho P1.3b) */
  readonly onCellPointerDown?: (index: number) => void;
  /** ClassName tùy biến cho container bên ngoài */
  readonly className?: string;
}

export const BoardView: React.FC<BoardViewProps> = ({
  board,
  boardSize,
  lastMove,
  winLine,
  previewCell = null,
  previewPlayer = 0,
  cellSizePx,
  onCellPointerDown,
  className = '',
}) => {
  // Tạo Set tra cứu nhanh O(1) cho danh sách các ô thuộc chuỗi thắng
  const winLineSet = useMemo(() => {
    return winLine ? new Set(winLine) : null;
  }, [winLine]);

  // Callback ổn định truyền xuống từng ô
  const handleCellPointerDown = useCallback(
    (cellIndex: number) => {
      if (onCellPointerDown) {
        onCellPointerDown(cellIndex);
      }
    },
    [onCellPointerDown],
  );

  const totalWidth = boardSize * cellSizePx;
  const totalHeight = boardSize * cellSizePx;

  return (
    <div
      data-testid="caro-board-container"
      className={`inline-block p-1.5 rounded-xl bg-slate-200/90 dark:bg-slate-900/90 shadow-xl border border-slate-300 dark:border-slate-800 select-none ${className}`}
      style={{
        width: `${totalWidth + 14}px`,
        height: `${totalHeight + 14}px`,
      }}
    >
      <div
        data-testid="caro-board-grid"
        role="grid"
        aria-label={`Bàn cờ Caro ${boardSize}x${boardSize}`}
        className="grid bg-slate-300 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-400 dark:border-slate-700 shadow-inner"
        style={{
          gridTemplateColumns: `repeat(${boardSize}, ${cellSizePx}px)`,
          gridTemplateRows: `repeat(${boardSize}, ${cellSizePx}px)`,
          width: `${totalWidth}px`,
          height: `${totalHeight}px`,
        }}
      >
        {board.map((cellValue, index) => {
          const isLast = lastMove === index;
          const isWin = winLineSet !== null && winLineSet.has(index);
          const isPreview = previewCell === index;

          return (
            <CaroCell
              key={index}
              index={index}
              value={cellValue}
              isLast={isLast}
              isWin={isWin}
              isPreview={isPreview}
              previewPlayer={previewPlayer}
              cellSizePx={cellSizePx}
              onPointerDown={handleCellPointerDown}
            />
          );
        })}
      </div>
    </div>
  );
};
