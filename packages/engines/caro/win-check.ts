import type { PlayerIndex } from '../types/index.ts';
import type { CaroOptions } from './types.ts';
import { idx, xy, inBounds } from './board.ts';

/**
 * ==============================================================================
 * CARO WIN CHECK LOGIC (KIỂM TRA THẮNG THUA & LUẬT CHẶN 2 ĐẦU CỜ CARO)
 * ==============================================================================
 *
 * Module này chứa toàn bộ logic toán học kiểm tra thắng thua thuần túy (Pure TS).
 * Được thiết kế độc lập để tái sử dụng xuyên suốt:
 * - Engine P1.1c: `isTerminal` & `applyMove`
 * - Web Worker AI P1.2: Hàm Heuristic lượng giá bàn cờ và Minimax Search
 * - React View P1.3: Lấy mảng `line` để highlight dãy cờ thắng
 */

/**
 * Kết quả thắng cờ chi tiết.
 */
export interface WinResult {
  /** Ghế của người chơi chiến thắng (0: Seat 0 / X, 1: Seat 1 / O) */
  readonly winner: PlayerIndex;
  /** Danh sách các flat index của chuỗi quân cờ thắng (được sắp xếp theo thứ tự thẳng hàng) */
  readonly line: readonly number[];
}

/**
 * 4 vector hướng trên mặt phẳng bàn cờ:
 * 1. Ngang (Horizontal): dx = 1, dy = 0
 * 2. Dọc (Vertical): dx = 0, dy = 1
 * 3. Chéo xuôi (Main Diagonal \): dx = 1, dy = 1
 * 4. Chéo ngược (Anti-Diagonal /): dx = 1, dy = -1
 */
const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
] as const;

/**
 * Kiểm tra xem nước đi tại vị trí `index` có tạo thành chuỗi thắng hợp lệ hay không.
 *
 * TỐI ƯU HÓA:
 * Chỉ quét 4 hướng đi qua đúng ô `index` (độ phức tạp O(winLength) ~ O(1) thay vì O(size^2)).
 *
 * ĐẶC TẢ LUẬT THẮNG:
 * 1. Đủ độ dài: Chuỗi liên tiếp >= winLength quân (nếu allowOverline = true) hoặc đúng = winLength (nếu allowOverline = false).
 * 2. Luật chặn 2 đầu (blockedTwoEndsRule = true - Luật Caro Việt Nam):
 *    - Chuỗi chỉ bị coi là vô hiệu nếu CẢ HAI ĐẦU của chuỗi liên tiếp tối đa đều bị chặn bởi QUÂN ĐỐI PHƯƠNG.
 *    - Mép bàn cờ KHÔNG tính là bị chặn (chuỗi sát biên + 1 đầu bị quân đối thủ chặn -> VẪN THẮNG).
 *    - Với chuỗi overline (> winLength): Xét chặn 2 đầu tại 2 đầu mút ngoài cùng của toàn bộ chuỗi liên tục đó.
 *
 * @param board Mảng 1D trạng thái bàn cờ.
 * @param size Kích thước cạnh bàn cờ vuông.
 * @param index Flat index của ô cờ cần kiểm tra (thường là lastMove).
 * @param options Cấu hình bàn cờ (winLength, blockedTwoEndsRule, allowOverline).
 * @returns Đối tượng WinResult nếu có chuỗi thắng, ngược lại trả về `null`.
 */
export function checkWinAt(
  board: readonly number[],
  size: number,
  index: number,
  options: CaroOptions,
): WinResult | null {
  const piece = board[index];
  if (piece !== 0 && piece !== 1) {
    return null;
  }

  const { x: x0, y: y0 } = xy(index, size);
  const opponent = (piece === 0 ? 1 : 0) as PlayerIndex;

  for (const { dx, dy } of DIRECTIONS) {
    // 1. Quét về phía dương (+dx, +dy)
    const posLine: number[] = [];
    for (let step = 1; step < size; step++) {
      const curX = x0 + step * dx;
      const curY = y0 + step * dy;
      if (!inBounds(curX, curY, size)) {
        break;
      }
      const cellIdx = idx(curX, curY, size);
      if (board[cellIdx] !== piece) {
        break;
      }
      posLine.push(cellIdx);
    }

    // 2. Quét về phía âm (-dx, -dy)
    const negLine: number[] = [];
    for (let step = 1; step < size; step++) {
      const curX = x0 - step * dx;
      const curY = y0 - step * dy;
      if (!inBounds(curX, curY, size)) {
        break;
      }
      const cellIdx = idx(curX, curY, size);
      if (board[cellIdx] !== piece) {
        break;
      }
      negLine.push(cellIdx);
    }

    // 3. Gom toàn bộ chuỗi liên tiếp tối đa theo thứ tự từ âm sang dương
    negLine.reverse();
    const fullLine = [...negLine, index, ...posLine];
    const len = fullLine.length;

    // 4. Kiểm tra điều kiện độ dài chuỗi thắng
    if (len < options.winLength) {
      continue;
    }
    if (len > options.winLength && !options.allowOverline) {
      continue;
    }

    // 5. Kiểm tra luật chặn 2 đầu (Luật Caro Việt Nam)
    if (options.blockedTwoEndsRule) {
      const firstIdx = fullLine[0] as number;
      const lastIdx = fullLine[fullLine.length - 1] as number;

      const firstCoords = xy(firstIdx, size);
      const lastCoords = xy(lastIdx, size);

      // Kiểm tra đầu âm ngoài cùng
      const negBeyondX = firstCoords.x - dx;
      const negBeyondY = firstCoords.y - dy;
      let negBlocked = false;
      if (inBounds(negBeyondX, negBeyondY, size)) {
        const negBeyondIdx = idx(negBeyondX, negBeyondY, size);
        if (board[negBeyondIdx] === opponent) {
          negBlocked = true;
        }
      }

      // Kiểm tra đầu dương ngoài cùng
      const posBeyondX = lastCoords.x + dx;
      const posBeyondY = lastCoords.y + dy;
      let posBlocked = false;
      if (inBounds(posBeyondX, posBeyondY, size)) {
        const posBeyondIdx = idx(posBeyondX, posBeyondY, size);
        if (board[posBeyondIdx] === opponent) {
          posBlocked = true;
        }
      }

      // Nếu CẢ HAI ĐẦU đều bị chặn bởi QUÂN ĐỐI PHƯƠNG -> Không tính là thắng
      if (negBlocked && posBlocked) {
        continue;
      }
    }

    // Thỏa mãn toàn bộ điều kiện -> Chiến thắng hợp lệ!
    return {
      winner: piece as PlayerIndex,
      line: fullLine,
    };
  }

  return null;
}

/**
 * Quét toàn bộ bàn cờ để tìm chuỗi thắng (Full Scan).
 * Dùng khi `lastMove === null` (đầu ván hoặc sau khi deserialize snapshot không rõ lastMove),
 * và dùng làm hàm đối chứng trong bộ Unit Test.
 *
 * @param board Mảng 1D trạng thái bàn cờ.
 * @param size Kích thước cạnh bàn cờ vuông.
 * @param options Cấu hình bàn cờ.
 * @returns Đối tượng WinResult nếu có người thắng, ngược lại trả về `null`.
 */
export function checkWinFullScan(
  board: readonly number[],
  size: number,
  options: CaroOptions,
): WinResult | null {
  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (piece === 0 || piece === 1) {
      const win = checkWinAt(board, size, i, options);
      if (win !== null) {
        return win;
      }
    }
  }

  return null;
}
