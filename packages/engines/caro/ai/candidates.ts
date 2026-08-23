/**
 * ==============================================================================
 * CARO AI CANDIDATE MOVE GENERATION (BỘ SINH NƯỚC ĐI ỨNG VIÊN & MOVE ORDERING)
 * ==============================================================================
 *
 * Tối ưu hóa không gian tìm kiếm cờ Caro:
 * Thu hẹp từ 225 ô cờ xuống ~20 ô cờ tiềm năng nhất quanh các quân đã đánh,
 * kết hợp thuật toán sắp xếp nước đi (Move Ordering) phục vụ Alpha-Beta Pruning.
 *
 * Pure TypeScript — 100% Deterministic — Zero Dependencies.
 */

import type { CaroState, CaroMove } from '../types.ts';
import { idx, xy, inBounds } from '../board.ts';
import { evaluateMove } from './evaluate.ts';

/**
 * Cấu hình tham số sinh nước ứng viên cho AI.
 */
export interface CandidateOptions {
  /**
   * Bán kính khoảng cách Chebyshev (max(|dx|, |dy|)) xung quanh các quân cờ đã đánh.
   * Mặc định là 2 (bao phủ vùng lân cận 5x5 quanh mỗi quân cờ).
   */
  readonly radius?: number;

  /**
   * Số lượng nước đi ứng viên tối đa được giữ lại sau khi sắp xếp theo điểm heuristic.
   * Mặc định: 20.
   *
   * Lý do chọn con số 20:
   * Bàn cờ 15x15 có 225 ô. Nếu duyệt toàn bộ 225 ô, hệ số phân nhánh b = 225 khiến
   * thuật toán Minimax ở độ sâu 4 phải duyệt tới 225^4 ≈ 2.5 tỷ trạng thái (gây tràn bộ nhớ/treo máy).
   * Cắt xuống Top 20 nước tiềm năng nhất kết hợp Alpha-Beta Pruning giúp cắt tỉa 90-95% số nhánh,
   * cho phép AI tìm kiếm sâu 4-6 tầng mượt mà chỉ trong 50-200ms trên Web Worker.
   */
  readonly maxCandidates?: number;
}

export const DEFAULT_CANDIDATE_RADIUS = 2;
export const DEFAULT_MAX_CANDIDATES = 20;

/**
 * Sinh danh sách các nước đi ứng viên sáng giá nhất trên bàn cờ, được sắp xếp giảm dần
 * theo điểm số heuristic (Move Ordering).
 *
 * 🎯 ĐÂY LÀ TỐI ƯU QUAN TRỌNG NHẤT CỦA AI CỜ CARO:
 * Thay vì duyệt ngây thơ 225 ô trống, hàm này chỉ tập trung vào ~20 ô có ảnh hưởng
 * chiến thuật trực tiếp tới ván đấu (gần các quân cờ đang giao tranh).
 *
 * Quy tắc thực thi:
 * 1. Bàn cờ trống hoàn toàn -> Trả về đúng 1 ô chính giữa bàn cờ `(size / 2, size / 2)`.
 * 2. Bàn cờ đã có quân -> Quét tất cả các ô trống nằm trong bán kính `radius` (mặc định 2)
 *    quanh bất kỳ quân cờ nào hiện có.
 * 3. Chấm điểm từng ô trống bằng `evaluateMove(state, move, currentPlayer)`.
 * 4. Sắp xếp giảm dần theo điểm số (nước thắng ngay hoặc chặn thua ngay luôn đứng đầu danh sách).
 * 5. Tie-break: Nếu điểm số bằng nhau, sắp xếp theo thứ tự flat index tăng dần (100% Deterministic).
 * 6. Cắt danh sách lấy tối đa `maxCandidates` phần tử.
 *
 * @param state Trạng thái trận đấu CaroState hiện tại.
 * @param options Tham số cấu hình radius và maxCandidates.
 * @returns Mảng các flat index nước đi ứng viên đã sắp xếp.
 */
export function generateCandidates(
  state: CaroState,
  options?: CandidateOptions,
): readonly CaroMove[] {
  const radius = options?.radius ?? DEFAULT_CANDIDATE_RADIUS;
  const maxCandidates = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const { board, options: caroOptions } = state;
  const size = caroOptions.boardSize;
  const totalCells = size * size;

  // 1. Kiểm tra bàn cờ trống hoàn toàn
  if (state.moveCount === 0) {
    const centerCoord = Math.floor(size / 2);
    const centerIndex = idx(centerCoord, centerCoord, size);
    return [centerIndex];
  }

  // 2. Tìm tập hợp tất cả các ô trống trong bán kính radius quanh các quân cờ đã đánh
  const candidateSet = new Set<number>();

  for (let cellIdx = 0; cellIdx < totalCells; cellIdx++) {
    // Chỉ xét các ô đã có quân cờ (0 hoặc 1)
    if (board[cellIdx] === -1) continue;

    const coords = xy(cellIdx, size);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = coords.x + dx;
        const ny = coords.y + dy;

        if (inBounds(nx, ny, size)) {
          const neighborIdx = idx(nx, ny, size);
          if (board[neighborIdx] === -1) {
            candidateSet.add(neighborIdx);
          }
        }
      }
    }
  }

  // Nếu không còn ô trống nào (bàn cờ đầy), trả về mảng rỗng
  if (candidateSet.size === 0) {
    return [];
  }

  // 3. Lượng giá điểm Heuristic cho từng nước đi ứng viên
  const scoredCandidates: { move: number; score: number }[] = [];
  const currentPlayer = state.currentPlayer;

  for (const move of candidateSet) {
    const score = evaluateMove(state, move, currentPlayer);
    scoredCandidates.push({ move, score });
  }

  // 4. Sắp xếp giảm dần theo điểm số (Move Ordering).
  // Tie-break: Sắp xếp theo index tăng dần để đảm bảo 100% Deterministic.
  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.move - b.move;
  });

  // 5. Cắt danh sách lấy tối đa maxCandidates
  const selectedMoves: CaroMove[] = [];
  const limit = Math.min(scoredCandidates.length, maxCandidates);

  for (let i = 0; i < limit; i++) {
    const item = scoredCandidates[i];
    if (item !== undefined) {
      selectedMoves.push(item.move);
    }
  }

  return selectedMoves;
}
