import { describe, it, expect } from 'vitest';
import {
  evaluateBoard,
  evaluateMove,
  calculatePlayerPatternScore,
  DEFAULT_DEFENSE_WEIGHT,
} from './evaluate';
import { PATTERN_SCORES } from './patterns';
import { caroEngine } from '../engine';
import { idx } from '../board';
import { createBoardFromAscii } from '../test-utils';
import type { CaroState } from '../types';

describe('Caro AI Evaluation Functions (evaluate.ts - P1.2a)', () => {
  describe('calculatePlayerPatternScore (Tính tổng điểm không trùng lặp)', () => {
    it('khử trùng lặp chuẩn xác: 1 chuỗi 4 quân chỉ tính điểm 1 lần', () => {
      // 1 chuỗi 4 quân ngang mở 2 đầu của X
      const ascii = ['. . . . . . .', '. x x x x . .', '. . . . . . .'];
      const board = createBoardFromAscii(ascii, 7);
      const scoreX = calculatePlayerPatternScore(board, 7, 0, {
        boardSize: 7,
        winLength: 5,
        blockedTwoEndsRule: true,
        allowOverline: true,
      });

      // Chỉ được tính đúng 1 lần điểm OPEN_FOUR (10_000_000)
      expect(scoreX).toBe(PATTERN_SCORES.OPEN_FOUR);
    });

    it('tính đúng tổng điểm khi có nhiều chuỗi ở các hướng khác nhau', () => {
      // X có: 1 chuỗi ngang 3 quân mở (10k) + 1 chuỗi dọc 2 quân mở (100)
      const ascii = ['. . . . .', '. x x x .', '. . . . .', '. x . . .', '. x . . .'];
      const board = createBoardFromAscii(ascii, 5);
      const scoreX = calculatePlayerPatternScore(board, 5, 0, {
        boardSize: 5,
        winLength: 5,
        blockedTwoEndsRule: true,
        allowOverline: true,
      });

      expect(scoreX).toBe(PATTERN_SCORES.OPEN_THREE + PATTERN_SCORES.BLOCKED_TWO);
    });
  });

  describe('evaluateBoard (Lượng giá toàn cục bàn cờ)', () => {
    it('bàn cờ trống có điểm lượng giá bằng 0 cho cả 2 người chơi', () => {
      const state = caroEngine.init({ playerCount: 2 });
      expect(evaluateBoard(state, 0)).toBe(0);
      expect(evaluateBoard(state, 1)).toBe(0);
    });

    it('thế cờ có lợi cho X -> điểm dương với X, điểm âm với O', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // X có Mở 4, O chỉ có Mở 2
      const ascii = [
        '. . . . . . .',
        '. x x x x . .',
        '. . . . . . .',
        '. o o . . . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
      };

      const scoreX = evaluateBoard(state, 0);
      const scoreO = evaluateBoard(state, 1);

      expect(scoreX).toBeGreaterThan(0);
      expect(scoreO).toBeLessThan(0);

      // Điểm X: Score(X) - 1.1 * Score(O) = 10_000_000 - 1.1 * 100 = 9_999_890
      expect(scoreX).toBe(
        PATTERN_SCORES.OPEN_FOUR - DEFAULT_DEFENSE_WEIGHT * PATTERN_SCORES.OPEN_TWO,
      );
    });

    it('bàn cờ đối xứng thế lực -> điểm lượng giá xấp xỉ 0', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // Cả X và O đều có 1 Mở 3
      const ascii = [
        '. . . . . . .',
        '. x x x . . .',
        '. . . . . . .',
        '. o o o . . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
      };

      const scoreX = evaluateBoard(state, 0);
      // Score(X) = 10_000 - 1.1 * 10_000 = -1_000 (do hệ số thủ 1.1)
      expect(scoreX).toBe(
        PATTERN_SCORES.OPEN_THREE - DEFAULT_DEFENSE_WEIGHT * PATTERN_SCORES.OPEN_THREE,
      );
    });

    it('đảm bảo tính bất biến (Immutability) không làm thay đổi state.board', () => {
      const state = caroEngine.init({ playerCount: 2 });
      const boardSnapshot = [...state.board];

      evaluateBoard(state, 0);
      expect(state.board).toEqual(boardSnapshot);
    });
  });

  describe('evaluateMove (Lượng giá nhanh nước đi phục vụ Move Ordering)', () => {
    it('nước đi tạo thành Mở 4 có điểm vượt trội so với nước tạo Mở 3', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // X đang có 3 quân: (1,1), (2,1), (3,1). Ô (4,1) sẽ tạo thành Mở 4!
      // X cũng có 2 quân: (1,3), (2,3). Ô (3,3) sẽ tạo thành Mở 3!
      const ascii = [
        '. . . . . . .',
        '. x x x . . .', // Đánh vào (4,1) -> Mở 4
        '. . . . . . .',
        '. x x . . . .', // Đánh vào (3,3) -> Mở 3
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
      };

      const moveOpen4 = idx(4, 1, 7);
      const moveOpen3 = idx(3, 3, 7);

      const scoreMove4 = evaluateMove(state, moveOpen4, 0);
      const scoreMove3 = evaluateMove(state, moveOpen3, 0);

      expect(scoreMove4).toBeGreaterThan(scoreMove3);
      expect(scoreMove4).toBeGreaterThanOrEqual(PATTERN_SCORES.OPEN_FOUR);
    });

    it('nước đi chặn đòn Mở 4 của đối phương được gán điểm phòng thủ rất cao', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // O (đối thủ) đang có 3 quân: (1,1), (2,1), (3,1). Ô (4,1) là ô O chuẩn bị đánh thành Mở 4!
      const ascii = ['. . . . . . .', '. o o o . . .', '. . . . . . .'];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
      };

      const blockMove = idx(4, 1, 7);
      const neutralMove = idx(5, 5, 7);

      const scoreBlock = evaluateMove(state, blockMove, 0);
      const scoreNeutral = evaluateMove(state, neutralMove, 0);

      expect(scoreBlock).toBeGreaterThan(scoreNeutral);
      expect(scoreBlock).toBeGreaterThanOrEqual(PATTERN_SCORES.OPEN_FOUR);
    });

    it('nước đi thắng ngay (tạo 5 quân) có điểm số cao nhất', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // X đã có 4 quân: (1,1), (2,1), (3,1), (4,1). Đánh vào (5,1) -> THẮNG!
      const ascii = ['. . . . . . .', '. x x x x . .', '. . . . . . .'];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
      };

      const winningMove = idx(5, 1, 7);
      const normalMove = idx(0, 0, 7);

      const scoreWin = evaluateMove(state, winningMove, 0);
      const scoreNormal = evaluateMove(state, normalMove, 0);

      expect(scoreWin).toBeGreaterThanOrEqual(PATTERN_SCORES.WIN);
      expect(scoreWin).toBeGreaterThan(scoreNormal);
    });
  });
});
