/**
 * ==============================================================================
 * CARO AI SEARCH ENGINE: MINIMAX + ALPHA-BETA PRUNING + ITERATIVE DEEPENING
 * ==============================================================================
 *
 * Trái tim tính toán của Bot AI Cờ Caro:
 * 1. Thứ tự quyết định bắt buộc:
 *    a. Kiểm tra Nước Thắng Ngay -> Đánh kết liễu trận đấu ngay lập tức.
 *    b. Kiểm tra Nước Chặn Đối Thủ Thắng Ngay -> Chặn tử huyệt (trừ khi Easy cố tình quên).
 *    c. Minimax + Alpha-Beta Pruning + Iterative Deepening.
 * 2. Cắt tỉa Alpha-Beta kết hợp Move Ordering từ `generateCandidates`.
 * 3. Điểm thưởng/phạt theo độ sâu (Depth-biased score) ưu tiên thắng sớm, trì hoãn thua.
 * 4. Hỗ trợ Time Budget và hàm đo thời gian tiêm được (Mockable now).
 *
 * Pure TypeScript — 100% Deterministic — Zero Dependencies.
 */

import type { PlayerIndex } from '../../types/index.ts';
import type { CaroState, CaroMove } from '../types.ts';
import { caroEngine } from '../engine.ts';
import { checkWinAt } from '../win-check.ts';
import { PATTERN_SCORES } from './patterns.ts';
import { evaluateBoard } from './evaluate.ts';
import { generateCandidates } from './candidates.ts';
import { createSeededPrng } from './random.ts';
import type { AiLevel } from './levels.ts';
import { getAiLevelConfig } from './levels.ts';

/**
 * Cấu hình đầu vào cho thuật toán tìm kiếm nước đi AI.
 */
export interface AiConfig {
  /** Cấp độ thông minh ('easy' | 'medium' | 'hard') */
  readonly level: AiLevel;
  /** Hạt giống ngẫu nhiên (string hoặc number) để đảm bảo 100% Deterministic */
  readonly seed?: string | number;
  /** Giới hạn thời gian tính toán tối đa (ms). Nếu không truyền, dùng mặc định của level */
  readonly timeBudgetMs?: number;
  /**
   * Hàm đo thời gian tiêm được (phục vụ Unit Test determinism & timeout simulation).
   * Mặc định sử dụng `globalThis.performance.now` hoặc `Date.now`.
   */
  readonly now?: () => number;
  /**
   * Cờ nội bộ cho phép tắt Alpha-Beta pruning trong unit test để chứng minh
   * hiệu quả cắt tỉa số lượng node duyệt.
   */
  readonly disablePruning?: boolean;
}

/**
 * Kết quả trả về sau khi AI hoàn tất tính toán nước đi.
 */
export interface AiResult {
  /** Nước đi tối ưu nhất được chọn (flat index 0..size*size-1) */
  readonly move: CaroMove;
  /** Điểm số lượng giá của nước đi */
  readonly score: number;
  /** Độ sâu tìm kiếm hoàn chỉnh cao nhất đạt được */
  readonly depth: number;
  /** Tổng số node trên cây trạng thái đã được duyệt qua */
  readonly nodes: number;
  /** Thời gian tính toán thực tế (mili-giây) */
  readonly elapsedMs: number;
}

/**
 * Hàm đo thời gian mặc định (Vị trí duy nhất trong engine bọc Date.now/performance.now).
 */
const defaultNow = (): number => {
  if (
    typeof globalThis.performance !== 'undefined' &&
    typeof globalThis.performance.now === 'function'
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
};

/**
 * Thuật toán tìm kiếm nước đi tối ưu nhất cho AI Cờ Caro.
 *
 * @param state Trạng thái trận đấu hiện tại.
 * @param config Cấu hình cấp độ, seed và ngân sách thời gian.
 * @returns Kết quả `AiResult` gồm nước đi và các thông số phân tích.
 */
export function findBestMove(state: CaroState, config: AiConfig): AiResult {
  const now = config.now ?? defaultNow;
  const startTime = now();

  const levelConfig = getAiLevelConfig(config.level);
  const timeBudgetMs = config.timeBudgetMs ?? levelConfig.timeBudgetMs;
  const prng = createSeededPrng(config.seed ?? 'caro-ai-match-seed');

  const rootPlayer: PlayerIndex = state.currentPlayer;
  const opponent: PlayerIndex = rootPlayer === 0 ? 1 : 0;
  const size = state.options.boardSize;

  let totalNodes = 0;

  // 0. Trường hợp bàn cờ trống hoàn toàn -> Đánh ngay ô trung tâm
  if (state.moveCount === 0) {
    const centerCoord = Math.floor(size / 2);
    const centerIdx = centerCoord * size + centerCoord;
    return {
      move: centerIdx,
      score: 0,
      depth: 0,
      nodes: 1,
      elapsedMs: now() - startTime,
    };
  }

  // Sinh danh sách nước đi ứng viên tại gốc
  const rootCandidates = generateCandidates(state, {
    radius: levelConfig.candidateRadius,
    maxCandidates: levelConfig.maxCandidates,
  });

  if (rootCandidates.length === 0) {
    return {
      move: 0,
      score: 0,
      depth: 0,
      nodes: 0,
      elapsedMs: now() - startTime,
    };
  }

  // ============================================================================
  // BƯỚC a: KIỂM TRA NƯỚC THẮNG NGAY CỦA MÌNH (IMMEDIATE WIN)
  // Nếu có bất kỳ nước đi nào tạo thành chuỗi >= winLength -> ĐÁNH NGAY LẬP TỨC!
  // ============================================================================
  for (const cand of rootCandidates) {
    totalNodes++;
    const tempBoard = [...state.board];
    tempBoard[cand] = rootPlayer;
    const win = checkWinAt(tempBoard, size, cand, state.options);

    if (win !== null && win.winner === rootPlayer) {
      return {
        move: cand,
        score: PATTERN_SCORES.WIN,
        depth: 1,
        nodes: totalNodes,
        elapsedMs: now() - startTime,
      };
    }
  }

  // ============================================================================
  // BƯỚC b: KIỂM TRA NƯỚC CHẶN ĐỐI THỦ THẮNG NGAY (IMMEDIATE BLOCK)
  // Nếu đối thủ có nước thắng ở lượt tiếp theo -> BẮT BUỘC PHẢI CHẶN.
  // (Ngoại lệ: Mức Dễ có xác suất `forgetBlockProbability` cố tình quên để người mới có cửa thắng).
  // ============================================================================
  const opponentWinningMoves: number[] = [];
  for (const cand of rootCandidates) {
    totalNodes++;
    const tempBoard = [...state.board];
    tempBoard[cand] = opponent;
    const win = checkWinAt(tempBoard, size, cand, state.options);

    if (win !== null && win.winner === opponent) {
      opponentWinningMoves.push(cand);
    }
  }

  if (opponentWinningMoves.length > 0) {
    // Kiểm tra xem mức Dễ có kích hoạt "cố tình quên chặn" hay không
    const shouldForget =
      levelConfig.forgetBlockProbability > 0 && prng() < levelConfig.forgetBlockProbability;

    if (!shouldForget) {
      // Nếu có nhiều ô chặn, chọn ô đầu tiên (đã được sort tối ưu theo evaluateMove)
      const bestBlockMove = opponentWinningMoves[0] as number;
      return {
        move: bestBlockMove,
        score: PATTERN_SCORES.BLOCKED_FOUR,
        depth: 1,
        nodes: totalNodes,
        elapsedMs: now() - startTime,
      };
    } else {
      // Mức Dễ cố tình quên chặn -> Chọn nước đi từ nonBlockCandidates để người mới có cửa thắng
      const nonBlockCandidates = rootCandidates.filter((c) => !opponentWinningMoves.includes(c));
      if (nonBlockCandidates.length > 0) {
        const topN = Math.min(5, nonBlockCandidates.length);
        const randIndex = Math.floor(prng() * topN);
        const move = nonBlockCandidates[randIndex] as number;
        return {
          move,
          score: 0,
          depth: 1,
          nodes: totalNodes,
          elapsedMs: now() - startTime,
        };
      }
    }
  }

  // ============================================================================
  // BƯỚC c: MINIMAX + ALPHA-BETA PRUNING + ITERATIVE DEEPENING
  // ============================================================================
  let timedOut = false;

  function checkTimeout(): boolean {
    if (timedOut) return true;
    if (now() - startTime >= timeBudgetMs) {
      timedOut = true;
      return true;
    }
    return false;
  }

  /**
   * Thuật toán Minimax đệ quy kết hợp Alpha-Beta Cutoff.
   */
  function minimax(
    currentState: CaroState,
    currentDepth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
  ): number {
    totalNodes++;

    if (checkTimeout()) {
      return 0; // Giá trị này sẽ bị hủy bỏ do timeout
    }

    // 1. Kiểm tra trạng thái kết thúc (Terminal Check)
    if (currentState.lastMove !== null) {
      const win = checkWinAt(
        currentState.board,
        currentState.options.boardSize,
        currentState.lastMove,
        currentState.options,
      );

      if (win !== null) {
        // KỸ THUẬT DEPTH-BIASED TERMINAL SCORE:
        // - Thắng sớm ở depth lớn -> Điểm cao hơn (thắng nhanh).
        // - Thua ở depth nhỏ -> Điểm ít âm hơn (trì hoãn thất bại càng lâu càng tốt).
        if (win.winner === rootPlayer) {
          return PATTERN_SCORES.WIN + currentDepth;
        } else {
          return -PATTERN_SCORES.WIN - currentDepth;
        }
      }
    }

    // 2. Bàn cờ đầy (Hòa cờ)
    if (currentState.moveCount >= currentState.options.boardSize * currentState.options.boardSize) {
      return 0;
    }

    // 3. Node lá: Chạm độ sâu tìm kiếm tối đa
    if (currentDepth === 0) {
      return evaluateBoard(currentState, rootPlayer);
    }

    // 4. Sinh nước ứng viên đã sắp xếp (Move Ordering)
    const candidates = generateCandidates(currentState, {
      radius: levelConfig.candidateRadius,
      maxCandidates: levelConfig.maxCandidates,
    });

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of candidates) {
        const nextState = caroEngine.applyMove(currentState, move, rootPlayer);
        const evalScore = minimax(nextState, currentDepth - 1, alpha, beta, false);

        if (timedOut) return 0;

        if (evalScore > maxEval) {
          maxEval = evalScore;
        }

        if (!config.disablePruning) {
          alpha = Math.max(alpha, evalScore);
          if (beta <= alpha) {
            break; // Cắt tỉa Alpha-Beta (Cutoff)
          }
        }
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of candidates) {
        const nextState = caroEngine.applyMove(currentState, move, opponent);
        const evalScore = minimax(nextState, currentDepth - 1, alpha, beta, true);

        if (timedOut) return 0;

        if (evalScore < minEval) {
          minEval = evalScore;
        }

        if (!config.disablePruning) {
          beta = Math.min(beta, evalScore);
          if (beta <= alpha) {
            break; // Cắt tỉa Alpha-Beta (Cutoff)
          }
        }
      }
      return minEval;
    }
  }

  // Iterative Deepening: Tìm kiếm tăng dần từ độ sâu 1 đến maxDepth
  let bestMove = rootCandidates[0] as number;
  let bestScore = -Infinity;
  let completedDepth = 0;

  for (let d = 1; d <= levelConfig.maxDepth; d++) {
    if (checkTimeout()) break;

    let currentDepthBestMove = rootCandidates[0] as number;
    let currentDepthBestScore = -Infinity;
    let depthAlpha = -Infinity;
    const depthBeta = Infinity;

    for (const move of rootCandidates) {
      if (checkTimeout()) break;

      const nextState = caroEngine.applyMove(state, move, rootPlayer);
      const score = minimax(nextState, d - 1, depthAlpha, depthBeta, false);

      if (timedOut) break;

      if (score > currentDepthBestScore) {
        currentDepthBestScore = score;
        currentDepthBestMove = move;
      }

      if (!config.disablePruning) {
        depthAlpha = Math.max(depthAlpha, score);
      }
    }

    // NGUYÊN TẮC BẢO TOÀN ITERATIVE DEEPENING:
    // Chỉ cập nhật bestMove & bestScore khi độ sâu `d` đã được duyệt HOÀN CHỈNH 100%.
    // Nếu bị timeout giữa chừng, tuyệt đối không dùng kết quả dở dang.
    if (!timedOut) {
      bestMove = currentDepthBestMove;
      bestScore = currentDepthBestScore;
      completedDepth = d;
    }
  }

  // 5. Áp dụng nhiễu ngẫu nhiên có kiểm soát cho mức Dễ (Easy Mode Noise)
  if (levelConfig.noiseProbability > 0 && prng() < levelConfig.noiseProbability) {
    const topN = Math.min(5, rootCandidates.length);
    const randIndex = Math.floor(prng() * topN);
    bestMove = rootCandidates[randIndex] as number;
  }

  return {
    move: bestMove,
    score: bestScore === -Infinity ? 0 : bestScore,
    depth: completedDepth === 0 ? 1 : completedDepth,
    nodes: totalNodes,
    elapsedMs: now() - startTime,
  };
}
