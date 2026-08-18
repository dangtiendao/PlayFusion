/**
 * ==============================================================================
 * CARO AI BOARD & MOVE EVALUATION (HÀM LƯỢNG GIÁ THẾ CỜ VÀ NƯỚC ĐI)
 * ==============================================================================
 *
 * Cung cấp:
 * 1. `evaluateBoard`: Lượng giá toàn diện thế cờ hiện tại cho một người chơi.
 * 2. `evaluateMove`: Lượng giá nhanh giá trị chiến thuật (công + thủ) của một nước đi
 *    ứng viên phục vụ thuật toán Move Ordering trong Minimax / Alpha-Beta Pruning.
 *
 * Pure TypeScript — 100% Deterministic — Không Mutate State.
 */

import type { PlayerIndex } from '../../types';
import type { CaroState, CaroMove } from '../types';
import { idx, xy, inBounds } from '../board';
import { scanLineAt, scanAllLinesAt, AI_DIRECTIONS } from './patterns';

/**
 * Hệ số trọng số phòng thủ mặc định (Default Defense Weight).
 *
 * Trong cờ Caro, người đi trước có lợi thế chủ động rất lớn và trò chơi thiên về
 * tấn công tạo đòn đe dọa liên tiếp. Tuy nhiên, việc bỏ qua một mối đe dọa của đối thủ
 * (ví dụ đối thủ có 4 quân hoặc 3 quân mở) sẽ dẫn đến thua ngay lập tức.
 *
 * Trọng số 1.1 giúp AI:
 * - Đánh giá cao hơn 10% các thế cờ/nước đi phá vỡ đòn công của đối thủ.
 * - Ưu tiên chặn đứng nguy cơ thất bại trước khi triển khai các đợt tấn công thứ yếu.
 * - Có thể tinh chỉnh hoặc cấu hình thêm theo độ khó tại Phase P1.2b.
 */
export const DEFAULT_DEFENSE_WEIGHT = 1.1;

/**
 * Tính tổng điểm của tất cả các chuỗi quân cờ độc lập của một người chơi trên bàn cờ.
 *
 * Cơ chế khử trùng lặp (Deduplication):
 * Mỗi chuỗi quân liên tục theo hướng [dx, dy] chỉ được chấm điểm 1 lần duy nhất tại
 * ô đầu tiên của chuỗi (ô mà ô liền trước nó theo hướng ngược lại không chứa quân của player).
 *
 * @param board Mảng 1D biểu diễn bàn cờ.
 * @param size Kích thước cạnh bàn cờ.
 * @param player Người chơi cần tính tổng điểm.
 * @param options Cấu hình luật Caro.
 * @returns Tổng điểm pattern của người chơi trên toàn bộ bàn cờ.
 */
export function calculatePlayerPatternScore(
  board: readonly number[],
  size: number,
  player: PlayerIndex,
  options: CaroState['options'],
): number {
  let totalScore = 0;
  const totalCells = size * size;

  for (let cellIdx = 0; cellIdx < totalCells; cellIdx++) {
    if (board[cellIdx] !== player) continue;

    const coords = xy(cellIdx, size);

    for (const [dx, dy] of AI_DIRECTIONS) {
      const prevX = coords.x - dx;
      const prevY = coords.y - dy;

      // Chỉ chấm điểm chuỗi nếu đây là ô bắt đầu của chuỗi theo hướng [dx, dy]
      const isStartOfLine =
        !inBounds(prevX, prevY, size) || board[idx(prevX, prevY, size)] !== player;

      if (isStartOfLine) {
        const lineResult = scanLineAt(board, size, cellIdx, [dx, dy], player, options);
        totalScore += lineResult.score;
      }
    }
  }

  return totalScore;
}

/**
 * Lượng giá toàn diện trạng thái bàn cờ hiện tại từ góc nhìn của `forPlayer`.
 *
 * Công thức: `Score(forPlayer) - defenseWeight * Score(opponent)`
 * - Điểm dương lớn: `forPlayer` đang có ưu thế tấn công vượt trội.
 * - Điểm âm lớn: `opponent` đang chiếm ưu thế nguy hiểm.
 * - Điểm xấp xỉ 0: Thế cờ cân bằng.
 *
 * @param state Trạng thái trận đấu CaroState.
 * @param forPlayer Người chơi cần lượng giá (0 hoặc 1).
 * @param defenseWeight Hệ số ưu tiên phòng thủ (mặc định 1.1).
 * @returns Điểm số lượng giá thế cờ (số thực hoặc nguyên).
 */
export function evaluateBoard(
  state: CaroState,
  forPlayer: PlayerIndex,
  defenseWeight: number = DEFAULT_DEFENSE_WEIGHT,
): number {
  const opponent: PlayerIndex = forPlayer === 0 ? 1 : 0;
  const { board, options } = state;
  const size = options.boardSize;

  const myScore = calculatePlayerPatternScore(board, size, forPlayer, options);
  const opponentScore = calculatePlayerPatternScore(board, size, opponent, options);

  return myScore - defenseWeight * opponentScore;
}

/**
 * Lượng giá nhanh giá trị chiến thuật của một nước đi ứng viên `move` cho `forPlayer`.
 *
 * Hàm này dùng cho bước sắp xếp nước đi (Move Ordering) trong Minimax / Alpha-Beta Pruning:
 * - Điểm tấn công (Attack Score): Giá trị các chuỗi cờ mà `forPlayer` tạo ra khi đặt quân tại `move`.
 * - Điểm phòng thủ (Defense Score): Giá trị các chuỗi cờ mà `opponent` sẽ tạo ra nếu họ đi vào `move`.
 * - Tổng điểm: `attackScore + defenseWeight * defenseScore`.
 *
 * @param state Trạng thái trận đấu hiện tại.
 * @param move Nước đi cần đánh giá (flat index ô trống).
 * @param forPlayer Người chơi dự kiến thực hiện nước đi.
 * @param defenseWeight Hệ số trọng số phòng thủ (mặc định 1.1).
 * @returns Điểm số heuristic của nước đi (càng cao càng nên duyệt trước).
 */
export function evaluateMove(
  state: CaroState,
  move: CaroMove,
  forPlayer: PlayerIndex,
  defenseWeight: number = DEFAULT_DEFENSE_WEIGHT,
): number {
  const opponent: PlayerIndex = forPlayer === 0 ? 1 : 0;
  const { board, options } = state;
  const size = options.boardSize;

  // Tạo bản sao bàn cờ tạm để giả lập đặt quân
  const tempBoard = [...board];

  // 1. Giả lập forPlayer đi vào ô `move` -> Tính điểm tấn công
  tempBoard[move] = forPlayer;
  const attackLines = scanAllLinesAt(tempBoard, size, move, forPlayer, options);
  let attackScore = 0;
  for (const line of attackLines) {
    attackScore += line.score;
  }

  // 2. Giả lập opponent đi vào ô `move` -> Tính điểm phòng thủ (chặn đối phương)
  tempBoard[move] = opponent;
  const defenseLines = scanAllLinesAt(tempBoard, size, move, opponent, options);
  let defenseScore = 0;
  for (const line of defenseLines) {
    defenseScore += line.score;
  }

  return attackScore + defenseWeight * defenseScore;
}
