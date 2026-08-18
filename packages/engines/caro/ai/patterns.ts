/**
 * ==============================================================================
 * CARO AI PATTERN RECOGNITION & SCORING (NHẬN DIỆN VÀ CHẤM ĐIỂM MẪU CỜ)
 * ==============================================================================
 *
 * Module nhận diện các mẫu cờ đặc trưng (Five, Open Four, Blocked Four,
 * Open Three, Blocked Three, Open Two, Blocked Two) theo từng hướng và gán điểm
 * số theo thang bậc số học lũy tiến.
 *
 * Pure TypeScript — 100% Deterministic — Zero Dependencies.
 */

import type { PlayerIndex } from '../../types';
import type { CaroOptions } from '../types';
import { idx, xy, inBounds } from '../board';

/**
 * Bảng điểm lượng giá các mẫu cờ (Pattern Recognition Scores) cho AI Cờ Caro.
 *
 * Chiến thuật cờ Caro có tính chất phân cấp theo cấp số nhân (exponential hierarchy):
 * - WIN / FIVE (100_000_000): Tạo đủ chuỗi thắng (>= winLength quân liên tiếp) -> Thắng tuyệt đối.
 * - OPEN_FOUR (10_000_000): 4 quân, 2 đầu mở -> Không thể cản phá ở lượt sau (chặn đầu này thì đầu kia thắng).
 * - BLOCKED_FOUR (100_000): 4 quân, 1 đầu mở -> Đe dọa thắng ngay ở lượt sau, đối thủ BẮT BUỘC phải đỡ.
 * - OPEN_THREE (10_000): 3 quân, 2 đầu mở -> Thế công mạnh, có thể phát triển thành Open Four hoặc bẫy đôi.
 * - BLOCKED_THREE (1_000): 3 quân, 1 đầu mở -> Có tiềm năng phát triển thành Four nếu đối thủ bỏ qua.
 * - OPEN_TWO (100): 2 quân, 2 đầu mở -> Định hình cấu trúc và hướng phát triển thế trận.
 * - BLOCKED_TWO (10): 2 quân, 1 đầu mở -> Giá trị chiến thuật phụ trợ.
 * - BLOCKED_ALL (0): Chuỗi bị chặn cả 2 đầu hoặc không thể mở rộng thành chuỗi thắng -> 0 điểm.
 *
 * Tỷ lệ bậc thang điểm bảo đảm không bao giờ có sự đánh đổi sai lầm:
 * - 1 OPEN_FOUR (10M) >> 100 OPEN_THREE (1M)
 * - 1 BLOCKED_FOUR (100k) > 2 OPEN_THREE (20k)
 * - 1 OPEN_THREE (10k) > 2 BLOCKED_THREE (2k)
 * - 1 BLOCKED_THREE (1k) > 2 OPEN_TWO (200)
 * - 1 OPEN_TWO (100) > 2 BLOCKED_TWO (20)
 */
export const PATTERN_SCORES = {
  WIN: 100_000_000,
  OPEN_FOUR: 10_000_000,
  BLOCKED_FOUR: 100_000,
  OPEN_THREE: 10_000,
  BLOCKED_THREE: 1_000,
  OPEN_TWO: 100,
  BLOCKED_TWO: 10,
  BLOCKED_ALL: 0,
} as const;

export type PatternType = keyof typeof PATTERN_SCORES;

/**
 * 4 Hướng phân tích trên bàn cờ vuông 2D:
 * 1. Ngang: [1, 0] (trái qua phải)
 * 2. Dọc: [0, 1] (trên xuống dưới)
 * 3. Chéo xuôi: [1, 1] (từ tây bắc xuống đông nam \)
 * 4. Chéo ngược: [1, -1] (từ tây nam lên đông bắc /)
 */
export const AI_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/**
 * Kết quả phân tích chuỗi quân đi qua một ô cờ theo một hướng xác định.
 */
export interface LineScanResult {
  /** Loại mẫu cờ nhận diện được */
  readonly pattern: PatternType;
  /** Điểm số lượng giá tương ứng theo bảng PATTERN_SCORES */
  readonly score: number;
  /** Độ dài chuỗi quân liên tiếp của người chơi */
  readonly consecutive: number;
  /** Số đầu bị chặn trong ngữ cảnh lượng giá (0: 2 đầu trống, 1: 1 đầu bị chặn, 2: 2 đầu bị chặn) */
  readonly blockedEnds: 0 | 1 | 2;
  /** Danh sách flat index của các ô cờ tạo thành chuỗi liên tiếp */
  readonly line: readonly number[];
}

/**
 * Phân tích chuỗi quân cờ của một người chơi đi qua ô `index` theo một hướng nhất định `[dx, dy]`.
 *
 * ⚠️ QUY TẮC MÃI BÀN (EDGE OF BOARD) TRONG NGỮ CẢNH LƯỢNG GIÁ:
 * - Trong `win-check.ts` (Luật thắng), mép bàn KHÔNG tính là bị chặn bởi đối thủ (chuỗi 5 quân
 *   sát mép bàn với 1 đầu mép và 1 đầu bị quân địch chặn vẫn THẮNG).
 * - Trong `patterns.ts` (Lượng giá tiềm năng), mép bàn ĐƯỢC TÍNH LÀ BỊ CHẶN vì người chơi
 *   không thể đặt thêm bất kỳ quân nào ra ngoài biên để mở rộng chuỗi (ví dụ: chuỗi 3 quân nằm
 *   sát biên chỉ có 1 đầu mở để phát triển tiếp -> tính là BLOCKED_THREE chứ không thể là OPEN_THREE).
 *
 * @param board Mảng 1D biểu diễn bàn cờ (-1: trống, 0: Player 0, 1: Player 1).
 * @param size Kích thước cạnh bàn cờ.
 * @param index Flat index của ô cờ trung tâm khảo sát.
 * @param direction Vector hướng khảo sát [dx, dy].
 * @param player Người chơi cần khảo sát chuỗi quân (0 hoặc 1).
 * @param options Cấu hình luật chơi Caro (winLength, blockedTwoEndsRule, allowOverline).
 * @returns Thông tin mẫu cờ và điểm số tương ứng.
 */
export function scanLineAt(
  board: readonly number[],
  size: number,
  index: number,
  direction: readonly [number, number],
  player: PlayerIndex,
  options: CaroOptions,
): LineScanResult {
  const [dx, dy] = direction;
  const origin = xy(index, size);
  const opponent: PlayerIndex = player === 0 ? 1 : 0;

  // Nếu ô khảo sát không chứa quân của player này, trả về kết quả rỗng
  if (board[index] !== player) {
    return {
      pattern: 'BLOCKED_ALL',
      score: 0,
      consecutive: 0,
      blockedEnds: 2,
      line: [],
    };
  }

  // 1. Quét theo hướng âm (-dx, -dy)
  const negIndices: number[] = [];
  let step = 1;
  while (true) {
    const curX = origin.x - step * dx;
    const curY = origin.y - step * dy;
    if (!inBounds(curX, curY, size)) break;
    const curIdx = idx(curX, curY, size);
    if (board[curIdx] !== player) break;
    negIndices.push(curIdx);
    step++;
  }

  // 2. Quét theo hướng dương (+dx, +dy)
  const posIndices: number[] = [];
  step = 1;
  while (true) {
    const curX = origin.x + step * dx;
    const curY = origin.y + step * dy;
    if (!inBounds(curX, curY, size)) break;
    const curIdx = idx(curX, curY, size);
    if (board[curIdx] !== player) break;
    posIndices.push(curIdx);
    step++;
  }

  // Chuỗi liên tục hoàn chỉnh: [âm_ngược, index, dương]
  const fullLine = [...negIndices.reverse(), index, ...posIndices];
  const consecutive = fullLine.length;

  const firstIdx = fullLine[0] as number;
  const lastIdx = fullLine[fullLine.length - 1] as number;
  const firstCoords = xy(firstIdx, size);
  const lastCoords = xy(lastIdx, size);

  // 3. Kiểm tra đầu mút phía âm
  const negBeyondX = firstCoords.x - dx;
  const negBeyondY = firstCoords.y - dy;
  let negBlocked = false;
  let negBlockedByOpponent = false;

  if (!inBounds(negBeyondX, negBeyondY, size)) {
    negBlocked = true; // Mép bàn tính là chặn trong lượng giá tiềm năng
  } else {
    const negBeyondIdx = idx(negBeyondX, negBeyondY, size);
    const cellVal = board[negBeyondIdx];
    if (cellVal !== -1) {
      negBlocked = true;
      if (cellVal === opponent) {
        negBlockedByOpponent = true;
      }
    }
  }

  // 4. Kiểm tra đầu mút phía dương
  const posBeyondX = lastCoords.x + dx;
  const posBeyondY = lastCoords.y + dy;
  let posBlocked = false;
  let posBlockedByOpponent = false;

  if (!inBounds(posBeyondX, posBeyondY, size)) {
    posBlocked = true; // Mép bàn tính là chặn trong lượng giá tiềm năng
  } else {
    const posBeyondIdx = idx(posBeyondX, posBeyondY, size);
    const cellVal = board[posBeyondIdx];
    if (cellVal !== -1) {
      posBlocked = true;
      if (cellVal === opponent) {
        posBlockedByOpponent = true;
      }
    }
  }

  const blockedEnds: 0 | 1 | 2 = ((negBlocked ? 1 : 0) + (posBlocked ? 1 : 0)) as 0 | 1 | 2;
  const winLen = options.winLength;

  // 5. Phân loại Pattern và gán điểm
  // A. Trường hợp đã đạt chuỗi thắng (>= winLength)
  if (consecutive >= winLen) {
    if (!options.allowOverline && consecutive > winLen) {
      // Overline không được phép tính thắng
      return {
        pattern: 'BLOCKED_ALL',
        score: 0,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }

    // Luật chặn 2 đầu cờ Caro Việt Nam: Chỉ vô hiệu khi CẢ HAI ĐẦU bị chặn bởi QUÂN ĐỐI THỦ
    if (options.blockedTwoEndsRule && negBlockedByOpponent && posBlockedByOpponent) {
      return {
        pattern: 'BLOCKED_ALL',
        score: 0,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }

    return {
      pattern: 'WIN',
      score: PATTERN_SCORES.WIN,
      consecutive,
      blockedEnds,
      line: fullLine,
    };
  }

  // B. Trường hợp 4 quân (khi winLength = 5)
  if (consecutive === winLen - 1) {
    if (blockedEnds === 0) {
      return {
        pattern: 'OPEN_FOUR',
        score: PATTERN_SCORES.OPEN_FOUR,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }
    if (blockedEnds === 1) {
      return {
        pattern: 'BLOCKED_FOUR',
        score: PATTERN_SCORES.BLOCKED_FOUR,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }
    return {
      pattern: 'BLOCKED_ALL',
      score: 0,
      consecutive,
      blockedEnds,
      line: fullLine,
    };
  }

  // C. Trường hợp 3 quân (khi winLength = 5)
  if (consecutive === winLen - 2) {
    if (blockedEnds === 0) {
      return {
        pattern: 'OPEN_THREE',
        score: PATTERN_SCORES.OPEN_THREE,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }
    if (blockedEnds === 1) {
      return {
        pattern: 'BLOCKED_THREE',
        score: PATTERN_SCORES.BLOCKED_THREE,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }
    return {
      pattern: 'BLOCKED_ALL',
      score: 0,
      consecutive,
      blockedEnds,
      line: fullLine,
    };
  }

  // D. Trường hợp 2 quân (khi winLength = 5)
  if (consecutive === winLen - 3) {
    if (blockedEnds === 0) {
      return {
        pattern: 'OPEN_TWO',
        score: PATTERN_SCORES.OPEN_TWO,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }
    if (blockedEnds === 1) {
      return {
        pattern: 'BLOCKED_TWO',
        score: PATTERN_SCORES.BLOCKED_TWO,
        consecutive,
        blockedEnds,
        line: fullLine,
      };
    }
    return {
      pattern: 'BLOCKED_ALL',
      score: 0,
      consecutive,
      blockedEnds,
      line: fullLine,
    };
  }

  // E. Chuỗi quá ngắn (< winLength - 3, ví dụ 1 quân đơn lẻ)
  return {
    pattern: 'BLOCKED_ALL',
    score: 0,
    consecutive,
    blockedEnds,
    line: fullLine,
  };
}

/**
 * Quét toàn bộ 4 hướng đi qua ô `index` và trả về danh sách kết quả phân tích từng hướng.
 *
 * @param board Mảng 1D biểu diễn bàn cờ.
 * @param size Kích thước cạnh bàn cờ.
 * @param index Flat index của ô cờ.
 * @param player Người chơi sở hữu quân cờ tại ô này.
 * @param options Cấu hình luật Caro.
 * @returns Mảng gồm 4 kết quả `LineScanResult` tương ứng 4 hướng.
 */
export function scanAllLinesAt(
  board: readonly number[],
  size: number,
  index: number,
  player: PlayerIndex,
  options: CaroOptions,
): readonly LineScanResult[] {
  return AI_DIRECTIONS.map((dir) => scanLineAt(board, size, index, dir, player, options));
}
