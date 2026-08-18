/**
 * ==============================================================================
 * CARO BOARD VIEW & INTERACTIVE DEMO (KIỂM CHỨNG TƯƠNG TÁC CHO P1.3b)
 * ==============================================================================
 *
 * ⚠️ LƯU Ý KỸ THUẬT:
 * Trang này là DEMO P1.3b nhằm kiểm chứng:
 * 1. Cơ chế 2 Chạm (2-Tap Confirmation) chống đánh nhầm ô trên mobile.
 * 2. Phóng to / Thu nhỏ / Kéo lướt bàn cờ (Zoom-Pan-Pinch 1x -> 3.2x).
 * 3. Phân biệt Pan vs Tap (kéo > 10px không bị nhảy preview).
 * 4. Nút "Về giữa" khi đang zoom.
 *
 * Trang này sẽ được GỠ BỎ ở Phase P1.3c khi đã tích hợp vào Caro View hoàn chỉnh.
 */

import React, { useState } from 'react';
import { BoardView, InteractiveBoard } from '../../games/caro/components';

export const BoardDemoPage: React.FC = () => {
  const [cellSizePx, setCellSizePx] = useState<number>(32);

  // State bàn cờ tương tác thử nghiệm cho Bàn 1
  const [interactiveBoard, setInteractiveBoard] = useState<number[]>(() => {
    const initial = Array(225).fill(-1);
    initial[112] = 0; // X tại ô (7,7)
    initial[113] = 1; // O tại ô (8,7)
    return initial;
  });
  const [interactiveLastMove, setInteractiveLastMove] = useState<number | null>(113);
  const [interactivePlayer, setInteractivePlayer] = useState<number>(0); // 0: X, 1: O

  // Xử lý khi xác nhận đánh 1 nước trên bàn cờ tương tác (Đổi lượt cục bộ để thử nghiệm)
  const handleInteractiveMoveConfirmed = (index: number) => {
    setInteractiveBoard((prev) => {
      const next = [...prev];
      next[index] = interactivePlayer;
      return next;
    });
    setInteractiveLastMove(index);
    setInteractivePlayer((prev) => (prev === 0 ? 1 : 0));
  };

  // Reset bàn tương tác về ban đầu
  const handleResetInteractiveBoard = () => {
    const initial = Array(225).fill(-1);
    initial[112] = 0;
    initial[113] = 1;
    setInteractiveBoard(initial);
    setInteractiveLastMove(113);
    setInteractivePlayer(0);
  };

  // 2. Dựng bàn cờ thắng cuộc tĩnh (11x11) với chuỗi thắng 5 quân X hàng ngang
  const winBoard = Array(121).fill(-1);
  const winLine = [58, 59, 60, 61, 62]; // y=5, x=3..7
  for (const idx of winLine) {
    winBoard[idx] = 0;
  }
  winBoard[47] = 1; // (3,4) O
  winBoard[48] = 1; // (4,4) O
  winBoard[49] = 1; // (5,4) O
  winBoard[71] = 1; // (5,6) O
  winBoard[72] = 1; // (6,6) O

  // 3. Dựng bàn cờ trống tĩnh (9x9) có previewCell ở ô trung tâm (4,4) = 40
  const emptyBoard = Array(81).fill(-1);
  const previewCell = 40;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-bold text-slate-100">
          Caro Interactive & BoardView Demo (P1.3b)
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Kiểm chứng tương tác Mobile: <strong>Zoom-Pan-Pinch</strong>,{' '}
          <strong>Cơ chế 2 Chạm</strong>, <strong>Haptic</strong> và{' '}
          <strong>Chống đánh nhầm ô</strong>.
        </p>
      </div>

      {/* Bàn 1: Interactive Board với Zoom-Pan & 2 Chạm */}
      <div className="space-y-4 p-4 sm:p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-lg font-bold text-slate-100">
              1. Bàn cờ Tương tác 15x15 (Zoom, Pan, 2-Tap Confirmation)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Lượt đánh:{' '}
              <strong className={interactivePlayer === 0 ? 'text-cyan-400' : 'text-rose-400'}>
                Quân {interactivePlayer === 0 ? 'X' : 'O'}
              </strong>
            </span>
            <button
              type="button"
              onClick={handleResetInteractiveBoard}
              className="text-xs px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all active:scale-95"
            >
              Làm mới bàn
            </button>
          </div>
        </div>

        {/* Hướng dẫn thao tác */}
        <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 space-y-1">
          <p>
            👉 <strong>Mobile</strong>: Chụm 2 ngón để Zoom (1x - 3.2x), kéo để Pan. Chạm lần 1 để
            ngắm (Preview) $\rightarrow$ Chạm lần 2 hoặc bấm nút xác nhận bên dưới để đánh.
          </p>
          <p>
            👉 <strong>Desktop</strong>: Click chọn ô $\rightarrow$ Click lại ô đó hoặc bấm nút để
            xác nhận. Kéo chuột để Pan.
          </p>
        </div>

        {/* Component InteractiveBoard */}
        <InteractiveBoard
          board={interactiveBoard}
          boardSize={15}
          lastMove={interactiveLastMove}
          winLine={null}
          currentPlayer={interactivePlayer}
          onMoveConfirmed={handleInteractiveMoveConfirmed}
        />
      </div>

      {/* Thanh trượt điều chỉnh kích thước tĩnh cho 2 bàn bên dưới */}
      <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold text-slate-200">
            Kích thước ô cờ tĩnh: <strong className="text-cyan-400">{cellSizePx}px</strong>
          </span>
          <span className="text-xs text-slate-400">
            Kéo slider để xem co giãn 2 bàn tĩnh bên dưới
          </span>
        </div>
        <input
          type="range"
          min={20}
          max={48}
          step={2}
          value={cellSizePx}
          onChange={(e) => setCellSizePx(Number(e.target.value))}
          className="w-full accent-cyan-500 cursor-pointer"
        />
      </div>

      {/* 2 Bàn cờ mẫu tĩnh */}
      <div className="space-y-8">
        {/* Bàn 2: Thắng cuộc 11x11 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <h2 className="text-base font-semibold text-slate-200">
              2. Bàn cờ kết thúc ván (11x11) — Có chuỗi thắng 5 quân (winLine animate pulse)
            </h2>
          </div>
          <div className="overflow-x-auto pb-4">
            <BoardView
              board={winBoard}
              boardSize={11}
              lastMove={62}
              winLine={winLine}
              cellSizePx={cellSizePx}
            />
          </div>
        </div>

        {/* Bàn 3: Bàn trống 9x9 có Preview Cell */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <h2 className="text-base font-semibold text-slate-200">
              3. Bàn cờ ban đầu (9x9) — Có ô preview quân X (viền nét đứt + mờ 50%)
            </h2>
          </div>
          <div className="overflow-x-auto pb-4">
            <BoardView
              board={emptyBoard}
              boardSize={9}
              lastMove={null}
              winLine={null}
              previewCell={previewCell}
              previewPlayer={0}
              cellSizePx={cellSizePx}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
