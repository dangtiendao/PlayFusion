/**
 * ==============================================================================
 * INTERACTIVE CARO BOARD (TƯƠNG TÁC CHẠM, ZOOM-PAN & CƠ CHẾ 2 CHẠM)
 * ==============================================================================
 *
 * ⚠️ ĐẶC TẢ TƯƠNG TÁC MOBILE (CHỐNG ĐÁNH NHẦM Ô):
 * 1. CƠ CHẾ 2 CHẠM (2-TAP CONFIRMATION):
 *    - Chạm 1: Đặt previewCell (quân mờ, viền nét đứt) + hapticTap() + hiện nút xác nhận nổi.
 *    - Chạm 2 vào chính ô preview: Xác nhận đánh ngay lập tức (Shortcut) + hapticSuccess().
 *    - Chạm ô trống khác: Đổi preview sang ô mới.
 *    - Chạm ô đã có quân: hapticError() + nháy đỏ ô 250ms, không tạo preview.
 * 2. ZOOM-PAN-PINCH:
 *    - Dùng `react-zoom-pan-pinch` bọc ngoài BoardView (phóng to 1x -> 3.2x).
 *    - Phân biệt Pan vs Tap: Dịch chuyển > 10px = Pan (kéo lướt), KHÔNG tạo preview.
 * 3. KHI DISABLED (AI đang nghĩ, ván kết thúc, game paused):
 *    - Vẫn cho phép Zoom/Pan tự do để xem bàn cờ.
 *    - Mọi chạm vào ô đều KHÔNG tạo preview hay đánh cờ.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';
import { BoardView } from './BoardView';
import { classifyPointerGesture, indexToCoordinate, type Point } from './gesture';
import { hapticTap, hapticSuccess, hapticError } from '../../../core/haptics';

export interface InteractiveBoardProps {
  /** Mảng 1 chiều trạng thái bàn cờ */
  readonly board: readonly number[];
  /** Kích thước cạnh bàn cờ (ví dụ: 15 cho bàn 15x15) */
  readonly boardSize: number;
  /** Index ô của nước đi cuối cùng (hoặc null) */
  readonly lastMove: number | null;
  /** Danh sách index các ô thuộc chuỗi thắng 5 quân (hoặc null) */
  readonly winLine: readonly number[] | null;
  /** Vô hiệu hóa tương tác đánh cờ (khi AI đang tính, paused, kết thúc ván) */
  readonly disabled?: boolean;
  /** Người chơi hiện tại (0: X, 1: O) để render preview */
  readonly currentPlayer?: number;
  /** Hàm kiểm tra ô có thể đánh được hay không (mặc định: board[index] === -1) */
  readonly isCellPlayable?: (index: number) => boolean;
  /** Callback kích hoạt khi nước đi được xác nhận */
  readonly onMoveConfirmed: (index: number) => void;
  /** Callback phát hiệu ứng âm thanh */
  readonly onSfx?: (name: 'click' | 'success' | 'error') => void;
  /** ClassName tùy biến cho container bao bọc bên ngoài */
  readonly className?: string;
}

/**
 * Nút điều khiển tiện ích nổi góc bàn cờ ("Về giữa" / Reset Zoom)
 */
const ResetViewButton: React.FC<{ isZoomed: boolean }> = ({ isZoomed }) => {
  const { resetTransform } = useControls();

  if (!isZoomed) return null;

  return (
    <button
      type="button"
      data-testid="recenter-btn"
      onClick={() => resetTransform()}
      className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-900 text-slate-200 hover:text-white border border-slate-700/80 shadow-lg text-xs font-semibold backdrop-blur-sm transition-all active:scale-95"
      aria-label="Về giữa bàn cờ"
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="2.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
        />
      </svg>
      <span>Về giữa</span>
    </button>
  );
};

export const InteractiveBoard: React.FC<InteractiveBoardProps> = ({
  board,
  boardSize,
  lastMove,
  winLine,
  disabled = false,
  currentPlayer = 0,
  isCellPlayable,
  onMoveConfirmed,
  onSfx,
  className = '',
}) => {
  // State ô đang preview trước khi xác nhận đánh
  const [previewCell, setPreviewCell] = useState<number | null>(null);
  // State ô đang nháy cảnh báo lỗi (khi chạm ô đã có quân)
  const [errorFlashCell, setErrorFlashCell] = useState<number | null>(null);
  // State theo dõi tỷ lệ zoom hiện tại
  const [currentScale, setCurrentScale] = useState<number>(1);
  // Kích thước ô cờ cơ bản (tự động tính toán theo container)
  const [cellSizePx, setCellSizePx] = useState<number>(28);

  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ point: Point; cellIndex: number } | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tự động tính toán kích thước ô cơ sở cellSizePx phù hợp bề rộng container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - 28;
        const calculated = Math.floor(availableWidth / boardSize);
        // Giới hạn trong khoảng 22px đến 38px
        const clamped = Math.max(22, Math.min(38, calculated));
        setCellSizePx(clamped);
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [boardSize]);

  // Xóa timer flash lỗi khi unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  // Khi disabled (AI đang nghĩ / game pause), tự động xóa preview hiện tại
  useEffect(() => {
    if (disabled) {
      setPreviewCell(null);
    }
  }, [disabled]);

  // Kiểm tra tính hợp lệ của ô
  const checkPlayable = useCallback(
    (index: number): boolean => {
      if (isCellPlayable) {
        return isCellPlayable(index);
      }
      return board[index] === -1;
    },
    [board, isCellPlayable],
  );

  // Xử lý xác nhận nước đi
  const handleConfirmMove = useCallback(
    (index: number) => {
      if (disabled || !checkPlayable(index)) return;

      hapticSuccess();
      if (onSfx) {
        onSfx('click');
      }
      setPreviewCell(null);
      onMoveConfirmed(index);
    },
    [disabled, checkPlayable, onMoveConfirmed, onSfx],
  );

  // Hủy preview
  const handleCancelPreview = useCallback(() => {
    setPreviewCell(null);
  }, []);

  // Bắt đầu chạm vào ô
  const handleCellPointerDown = useCallback(
    (cellIndex: number, e: React.PointerEvent<HTMLDivElement>) => {
      const rawX = e.clientX ?? (e.nativeEvent as PointerEvent)?.clientX ?? 0;
      const rawY = e.clientY ?? (e.nativeEvent as PointerEvent)?.clientY ?? 0;
      pointerStartRef.current = {
        point: { x: rawX, y: rawY },
        cellIndex,
      };
    },
    [],
  );

  // Kết thúc chạm vào ô (hoặc click trên Desktop)
  const handleCellPointerUp = useCallback(
    (cellIndex: number, e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerStartRef.current) {
        const startPoint = pointerStartRef.current.point;
        const rawX = e.clientX ?? (e.nativeEvent as PointerEvent)?.clientX;
        const rawY = e.clientY ?? (e.nativeEvent as PointerEvent)?.clientY;
        const endPoint: Point = {
          x: typeof rawX === 'number' ? rawX : startPoint.x,
          y: typeof rawY === 'number' ? rawY : startPoint.y,
        };
        const gesture = classifyPointerGesture(startPoint, endPoint);

        pointerStartRef.current = null;

        // Nếu di chuyển > 10px -> Thao tác Pan/Drag kéo bàn cờ -> KHÔNG tạo preview
        if (gesture === 'pan') {
          return;
        }
      }

      // THAO TÁC TAP CHỦ ĐÍCH:
      if (disabled) {
        return; // Đang disabled -> chỉ cho pan/zoom, không tương tác cờ
      }

      // 1. Kiểm tra nếu chạm vào ô KHÔNG HỢP LỆ (đã có quân)
      if (!checkPlayable(cellIndex)) {
        hapticError();
        if (onSfx) {
          onSfx('error');
        }
        setErrorFlashCell(cellIndex);
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
        }
        errorTimeoutRef.current = setTimeout(() => {
          setErrorFlashCell(null);
        }, 250);
        return;
      }

      // 2. Kiểm tra nếu chạm lần 2 vào CHÍNH Ô ĐANG PREVIEW (Shortcut 2 Chạm)
      if (previewCell === cellIndex) {
        handleConfirmMove(cellIndex);
        return;
      }

      // 3. Chạm lần 1 vào ô trống -> Đặt Preview
      hapticTap();
      setPreviewCell(cellIndex);
    },
    [disabled, checkPlayable, previewCell, handleConfirmMove, onSfx],
  );

  return (
    <div
      ref={containerRef}
      data-testid="interactive-caro-board"
      className={`relative flex flex-col items-center w-full select-none ${className}`}
    >
      {/* Vùng Zoom-Pan-Pinch */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-slate-950/40 border border-slate-800 shadow-2xl flex items-center justify-center p-2 min-h-[340px]">
        <TransformWrapper
          initialScale={1}
          minScale={0.9}
          maxScale={3.2}
          doubleClick={{ mode: 'zoomIn', step: 0.8 }}
          pinch={{ step: 5 }}
          panning={{ velocityDisabled: true }}
          onTransform={(_ref, state) => {
            setCurrentScale(state.scale);
          }}
        >
          {() => (
            <>
              {/* Nút tiện ích "Về giữa" khi đang phóng to */}
              <ResetViewButton isZoomed={currentScale > 1.05} />

              <TransformComponent
                wrapperStyle={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BoardView
                  board={board}
                  boardSize={boardSize}
                  lastMove={lastMove}
                  winLine={winLine}
                  previewCell={previewCell}
                  errorFlashCell={errorFlashCell}
                  previewPlayer={currentPlayer}
                  cellSizePx={cellSizePx}
                  onCellPointerDown={handleCellPointerDown}
                  onCellPointerUp={handleCellPointerUp}
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>

      {/* THANH XÁC NHẬN NƯỚC ĐI NỔI (Nằm NGOÀI TransformComponent để không bị zoom) */}
      <div
        data-testid="confirmation-bar-container"
        className={`w-full max-w-sm mt-3 transition-all duration-200 ${
          previewCell !== null
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 pointer-events-none -translate-y-2 h-0 overflow-hidden'
        }`}
      >
        {previewCell !== null && (
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-slate-900/95 border border-cyan-500/50 shadow-2xl backdrop-blur-md">
            {/* Nút Xác Nhận Đánh */}
            <button
              type="button"
              data-testid="confirm-move-btn"
              onClick={() => handleConfirmMove(previewCell)}
              className="flex-1 flex items-center justify-center gap-2 h-12 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base shadow-lg shadow-cyan-500/25 active:scale-98 transition-all"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>Đánh vào {indexToCoordinate(previewCell, boardSize)}</span>
            </button>

            {/* Nút Hủy Bỏ Preview */}
            <button
              type="button"
              data-testid="cancel-preview-btn"
              onClick={handleCancelPreview}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
              aria-label="Hủy chọn ô"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-none stroke-current"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
