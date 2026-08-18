import { describe, it, expect } from 'vitest';
import { PATTERN_SCORES, scanLineAt, scanAllLinesAt } from './patterns';
import { DEFAULT_CARO_OPTIONS } from '../types';
import type { CaroOptions } from '../types';
import { idx } from '../board';
import { createBoardFromAscii } from '../test-utils';

describe('Caro AI Patterns Recognition & Scoring (P1.2a)', () => {
  const defaultOptions: CaroOptions = DEFAULT_CARO_OPTIONS; // boardSize 15, winLength 5, blockedTwoEnds true, allowOverline true

  describe('Đẳng cấp và thứ bậc điểm số PATTERN_SCORES', () => {
    it('thỏa mãn quan hệ lũy tiến tuyệt đối giữa các bậc đòn chiến thuật', () => {
      // 1. Thắng > Mở 4 > Chặn 4 > Mở 3 > Chặn 3 > Mở 2 > Chặn 2 > Chặn 2 đầu
      expect(PATTERN_SCORES.WIN).toBeGreaterThan(PATTERN_SCORES.OPEN_FOUR);
      expect(PATTERN_SCORES.OPEN_FOUR).toBeGreaterThan(PATTERN_SCORES.BLOCKED_FOUR);
      expect(PATTERN_SCORES.BLOCKED_FOUR).toBeGreaterThan(PATTERN_SCORES.OPEN_THREE);
      expect(PATTERN_SCORES.OPEN_THREE).toBeGreaterThan(PATTERN_SCORES.BLOCKED_THREE);
      expect(PATTERN_SCORES.BLOCKED_THREE).toBeGreaterThan(PATTERN_SCORES.OPEN_TWO);
      expect(PATTERN_SCORES.OPEN_TWO).toBeGreaterThan(PATTERN_SCORES.BLOCKED_TWO);
      expect(PATTERN_SCORES.BLOCKED_TWO).toBeGreaterThan(PATTERN_SCORES.BLOCKED_ALL);

      // 2. Không bao giờ đánh đổi sai lầm: 1 Mở 4 áp đảo hoàn toàn 100 Mở 3
      expect(PATTERN_SCORES.OPEN_FOUR).toBeGreaterThan(100 * PATTERN_SCORES.OPEN_THREE);

      // 3. Đòn đe dọa thắng ngay (Chặn 4) lớn hơn 2 đòn Mở 3 cộng lại
      expect(PATTERN_SCORES.BLOCKED_FOUR).toBeGreaterThan(2 * PATTERN_SCORES.OPEN_THREE);

      // 4. Mở 3 lớn hơn 2 đòn Chặn 3 cộng lại
      expect(PATTERN_SCORES.OPEN_THREE).toBeGreaterThan(2 * PATTERN_SCORES.BLOCKED_THREE);

      // 5. Chặn 3 lớn hơn 2 đòn Mở 2 cộng lại
      expect(PATTERN_SCORES.BLOCKED_THREE).toBeGreaterThan(2 * PATTERN_SCORES.OPEN_TWO);
    });
  });

  describe('Nhận diện Pattern theo từng hướng (scanLineAt)', () => {
    it('nhận diện đúng Mở 4 (OPEN_FOUR) và Chặn 4 (BLOCKED_FOUR) theo hướng ngang', () => {
      // Hàng: . x x x x . (Mở 4)
      const asciiOpenFour = ['. . . . . . .', '. x x x x . .', '. . . . . . .'];
      const boardOpen = createBoardFromAscii(asciiOpenFour, 7);
      const resOpen = scanLineAt(boardOpen, 7, idx(1, 1, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });

      expect(resOpen.pattern).toBe('OPEN_FOUR');
      expect(resOpen.consecutive).toBe(4);
      expect(resOpen.blockedEnds).toBe(0);
      expect(resOpen.score).toBe(PATTERN_SCORES.OPEN_FOUR);

      // Hàng: o x x x x . (Chặn 4 vì đầu trái bị o chặn)
      const asciiBlockedFour = ['. . . . . . .', 'o x x x x . .', '. . . . . . .'];
      const boardBlocked = createBoardFromAscii(asciiBlockedFour, 7);
      const resBlocked = scanLineAt(boardBlocked, 7, idx(1, 1, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });

      expect(resBlocked.pattern).toBe('BLOCKED_FOUR');
      expect(resBlocked.consecutive).toBe(4);
      expect(resBlocked.blockedEnds).toBe(1);
      expect(resBlocked.score).toBe(PATTERN_SCORES.BLOCKED_FOUR);
    });

    it('nhận diện đúng Mở 3 (OPEN_THREE) và Chặn 3 (BLOCKED_THREE) theo hướng dọc', () => {
      // Cột: . x x x . (Mở 3)
      const asciiOpen = ['. . . . .', '. x . . .', '. x . . .', '. x . . .', '. . . . .'];
      const boardOpen = createBoardFromAscii(asciiOpen, 5);
      const resOpen = scanLineAt(boardOpen, 5, idx(1, 2, 5), [0, 1], 0, {
        ...defaultOptions,
        boardSize: 5,
      });

      expect(resOpen.pattern).toBe('OPEN_THREE');
      expect(resOpen.consecutive).toBe(3);
      expect(resOpen.blockedEnds).toBe(0);
      expect(resOpen.score).toBe(PATTERN_SCORES.OPEN_THREE);

      // Cột: o x x x . (Chặn 3 vì đầu trên có quân o)
      const asciiBlocked = ['. o . . .', '. x . . .', '. x . . .', '. x . . .', '. . . . .'];
      const boardBlocked = createBoardFromAscii(asciiBlocked, 5);
      const resBlocked = scanLineAt(boardBlocked, 5, idx(1, 2, 5), [0, 1], 0, {
        ...defaultOptions,
        boardSize: 5,
      });

      expect(resBlocked.pattern).toBe('BLOCKED_THREE');
      expect(resBlocked.consecutive).toBe(3);
      expect(resBlocked.blockedEnds).toBe(1);
      expect(resBlocked.score).toBe(PATTERN_SCORES.BLOCKED_THREE);
    });

    it('nhận diện đúng Mở 2 (OPEN_TWO) và Chặn 2 (BLOCKED_TWO) theo hướng chéo xuôi', () => {
      // Chéo xuôi \: (1,1) và (2,2)
      const asciiOpen = ['. . . . .', '. x . . .', '. . x . .', '. . . . .', '. . . . .'];
      const boardOpen = createBoardFromAscii(asciiOpen, 5);
      const resOpen = scanLineAt(boardOpen, 5, idx(1, 1, 5), [1, 1], 0, {
        ...defaultOptions,
        boardSize: 5,
      });

      expect(resOpen.pattern).toBe('OPEN_TWO');
      expect(resOpen.consecutive).toBe(2);
      expect(resOpen.blockedEnds).toBe(0);
      expect(resOpen.score).toBe(PATTERN_SCORES.OPEN_TWO);
    });

    it('nhận diện đúng chuỗi bị chặn 2 đầu (BLOCKED_ALL) với điểm số = 0', () => {
      // Hàng: o x x x o (Chặn 2 đầu bởi quân đối thủ)
      const ascii = ['o x x x o . .'];
      const board = createBoardFromAscii(ascii, 7);
      const res = scanLineAt(board, 7, idx(2, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });

      expect(res.pattern).toBe('BLOCKED_ALL');
      expect(res.score).toBe(0);
      expect(res.blockedEnds).toBe(2);
    });

    it('mép bàn cờ tính là bị chặn trong ngữ cảnh lượng giá tiềm năng phát triển', () => {
      // 3 quân x sát mép trái: x x x . . (đầu trái là mép x=-1)
      const asciiEdge = ['x x x . . . .'];
      const board = createBoardFromAscii(asciiEdge, 7);
      const res = scanLineAt(board, 7, idx(1, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });

      // Mặc dù không có quân đối thủ ở bên trái, nhưng là mép bàn -> tính là 1 đầu bị chặn (BLOCKED_THREE)
      expect(res.pattern).toBe('BLOCKED_THREE');
      expect(res.blockedEnds).toBe(1);
      expect(res.score).toBe(PATTERN_SCORES.BLOCKED_THREE);
    });

    it('nhận diện chuỗi 5 quân đạt chiến thắng (WIN)', () => {
      const ascii = ['. x x x x x .'];
      const board = createBoardFromAscii(ascii, 7);
      const res = scanLineAt(board, 7, idx(3, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });

      expect(res.pattern).toBe('WIN');
      expect(res.score).toBe(PATTERN_SCORES.WIN);
      expect(res.consecutive).toBe(5);
    });

    it('tôn trọng tùy chọn allowOverline (false -> 0 điểm; true -> WIN)', () => {
      const ascii = ['. x x x x x x .'];
      const board = createBoardFromAscii(ascii, 8);

      // allowOverline = true
      const resAllow = scanLineAt(board, 8, idx(2, 0, 8), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 8,
        allowOverline: true,
      });
      expect(resAllow.pattern).toBe('WIN');
      expect(resAllow.score).toBe(PATTERN_SCORES.WIN);

      // allowOverline = false
      const resDisallow = scanLineAt(board, 8, idx(2, 0, 8), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 8,
        allowOverline: false,
      });
      expect(resDisallow.pattern).toBe('BLOCKED_ALL');
      expect(resDisallow.score).toBe(0);
    });

    it('nhận diện đúng 4 quân và 2 quân bị chặn 2 đầu (BLOCKED_ALL)', () => {
      // 4 quân bị chặn 2 đầu: o x x x x o
      const ascii4 = ['o x x x x o .'];
      const board4 = createBoardFromAscii(ascii4, 7);
      const res4 = scanLineAt(board4, 7, idx(2, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });
      expect(res4.pattern).toBe('BLOCKED_ALL');
      expect(res4.score).toBe(0);
      expect(res4.blockedEnds).toBe(2);

      // 2 quân bị chặn 2 đầu: o x x o
      const ascii2 = ['o x x o . . .'];
      const board2 = createBoardFromAscii(ascii2, 7);
      const res2 = scanLineAt(board2, 7, idx(1, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });
      expect(res2.pattern).toBe('BLOCKED_ALL');
      expect(res2.score).toBe(0);
      expect(res2.blockedEnds).toBe(2);

      // 1 quân đơn lẻ: . x .
      const ascii1 = ['. x . . . . .'];
      const board1 = createBoardFromAscii(ascii1, 7);
      const res1 = scanLineAt(board1, 7, idx(1, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
      });
      expect(res1.pattern).toBe('BLOCKED_ALL');
      expect(res1.score).toBe(0);
    });

    it('chuỗi 5 quân bị chặn 2 đầu bởi quân đối phương khi bật blockedTwoEndsRule trả về BLOCKED_ALL', () => {
      // 5 quân bị chặn 2 đầu: o x x x x x o
      const ascii = ['o x x x x x o'];
      const board = createBoardFromAscii(ascii, 7);
      const res = scanLineAt(board, 7, idx(3, 0, 7), [1, 0], 0, {
        ...defaultOptions,
        boardSize: 7,
        blockedTwoEndsRule: true,
      });

      expect(res.pattern).toBe('BLOCKED_ALL');
      expect(res.score).toBe(0);
    });

    it('trả về BLOCKED_ALL khi ô khảo sát không chứa quân của player', () => {
      const board = new Array(225).fill(-1);
      const res = scanLineAt(board, 15, 112, [1, 0], 0, defaultOptions);
      expect(res.pattern).toBe('BLOCKED_ALL');
      expect(res.score).toBe(0);
      expect(res.consecutive).toBe(0);
    });
  });

  describe('Quét toàn bộ 4 hướng qua một ô (scanAllLinesAt)', () => {
    it('quét chính xác cả 4 hướng tại tâm giao nhau hình chữ thập & 2 đường chéo', () => {
      // Ô (3,3) có quân x, xung quanh có các chuỗi khác nhau
      const ascii = [
        '. . . . . . .',
        '. x . . . x .',
        '. . x . x . .',
        'x x x x . . .', // Ngang: 4 quân x (0,3) đến (3,3)
        '. . x . x . .',
        '. x . . . x .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const allLines = scanAllLinesAt(board, 7, idx(3, 3, 7), 0, {
        ...defaultOptions,
        boardSize: 7,
      });

      expect(allLines.length).toBe(4);
      // Hướng ngang (1,0) phải nhận diện được chuỗi 4 quân
      expect(allLines[0]?.consecutive).toBe(4);
    });
  });
});
