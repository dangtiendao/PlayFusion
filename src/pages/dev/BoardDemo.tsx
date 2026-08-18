/**
 * ==============================================================================
 * CARO BOARD VIEW DEMO PAGE (KIỂM CHỨNG HIỂN THỊ CHO P1.3a)
 * ==============================================================================
 *
 * ⚠️ LƯU Ý KỸ THUẬT:
 * Trang này là DEMO P1.3a nhằm kiểm chứng khả năng hiển thị của component BoardView
 * trên nhiều kích thước ô khác nhau và ở cả 2 chế độ Dark / Light theme.
 * Trang này sẽ được GỠ BỎ ở Phase P1.3c khi đã tích hợp vào Caro View hoàn chỉnh.
 */

import React, { useState } from 'react';
import { BoardView } from '../../games/caro/components';

export const BoardDemoPage: React.FC = () => {
  const [cellSizePx, setCellSizePx] = useState<number>(32);

  // 1. Dựng bàn cờ giữa ván (15x15) ~20 quân cờ có lastMove
  const midGameBoard = Array(225).fill(-1);
  const midGameMoves = [
    { idx: 112, val: 0 }, // (7,7) X
    { idx: 113, val: 1 }, // (8,7) O
    { idx: 97, val: 0 }, // (7,6) X
    { idx: 127, val: 1 }, // (7,8) O
    { idx: 98, val: 0 }, // (8,6) X
    { idx: 83, val: 1 }, // (8,5) O
    { idx: 128, val: 0 }, // (8,8) X
    { idx: 143, val: 1 }, // (8,9) O
    { idx: 111, val: 0 }, // (6,7) X
    { idx: 110, val: 1 }, // (5,7) O
    { idx: 96, val: 0 }, // (6,6) X
    { idx: 126, val: 1 }, // (6,8) O
    { idx: 81, val: 0 }, // (6,5) X
    { idx: 82, val: 1 }, // (7,5) O
    { idx: 142, val: 0 }, // (7,9) X
    { idx: 141, val: 1 }, // (6,9) O
    { idx: 129, val: 0 }, // (9,8) X
    { idx: 114, val: 1 }, // (9,7) O
    { idx: 99, val: 0 }, // (9,6) X (lastMove)
  ];
  for (const m of midGameMoves) {
    midGameBoard[m.idx] = m.val;
  }
  const midGameLastMove = 99;

  // 2. Dựng bàn cờ thắng cuộc (11x11) với chuỗi thắng 5 quân X hàng ngang
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

  // 3. Dựng bàn cờ trống (9x9) có previewCell ở ô trung tâm (4,4) = 40
  const emptyBoard = Array(81).fill(-1);
  const previewCell = 40;

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-bold text-slate-100">Caro BoardView Demo (P1.3a)</h1>
        <p className="text-sm text-slate-400 mt-1">
          Kiểm chứng component BoardView hiển thị thuần (Pure Display): SVG vector sắc nét,
          highlight lastMove, winLine và previewCell.
        </p>
      </div>

      {/* Điều khiển kích thước ô cờ (Cell Size Slider) */}
      <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold text-slate-200">
            Kích thước ô cờ (cellSizePx): <strong className="text-cyan-400">{cellSizePx}px</strong>
          </span>
          <span className="text-xs text-slate-400">Kéo slider để xem co giãn bàn cờ</span>
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

      {/* 3 Bàn cờ mẫu */}
      <div className="space-y-8">
        {/* Bàn 1: Giữa ván 15x15 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <h2 className="text-base font-semibold text-slate-200">
              1. Bàn cờ giữa ván (15x15) — Có highlight lastMove (viền xanh tím + chấm góc)
            </h2>
          </div>
          <div className="overflow-x-auto pb-4">
            <BoardView
              board={midGameBoard}
              boardSize={15}
              lastMove={midGameLastMove}
              winLine={null}
              cellSizePx={cellSizePx}
            />
          </div>
        </div>

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
