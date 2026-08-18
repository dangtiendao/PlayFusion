import { describe, it, expect } from 'vitest';
import { checkWinAt, checkWinFullScan } from './win-check';
import { idx } from './board';
import type { CaroOptions } from './types';
import { DEFAULT_CARO_OPTIONS } from './types';

import { createBoardFromAscii, createPrng } from './test-utils';

describe('Caro Win Check Logic (P1.1c)', () => {
  const defaultOptions: CaroOptions = DEFAULT_CARO_OPTIONS; // boardSize 15, winLength 5, blockedTwoEnds true, allowOverline true

  describe('Kiểm tra 4 hướng thắng cơ bản (Horizontal, Vertical, Diagonal \\, Anti-Diagonal /)', () => {
    it('thắng theo hàng ngang (Horizontal) ở giữa bàn cờ', () => {
      const size = 15;
      const rows = [
        // row 7: 5 quân X liên tiếp từ cột 3 đến 7
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...xxxxx.......',
      ];
      const board = createBoardFromAscii(rows, size);

      // Kiểm tra tại ô cuối vừa đánh (7, 7) -> index = 7*15 + 7 = 112
      const lastMove = idx(7, 7, size);
      const win = checkWinAt(board, size, lastMove, defaultOptions);

      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
      expect(win?.line).toEqual([
        idx(3, 7, size),
        idx(4, 7, size),
        idx(5, 7, size),
        idx(6, 7, size),
        idx(7, 7, size),
      ]);
    });

    it('thắng theo cột dọc (Vertical) ở giữa bàn cờ', () => {
      const size = 15;
      const rows = [
        '.....o.........',
        '.....o.........',
        '.....o.........',
        '.....o.........',
        '.....o.........',
      ];
      const board = createBoardFromAscii(rows, size);

      // Kiểm tra tại ô (5, 2)
      const testMove = idx(5, 2, size);
      const win = checkWinAt(board, size, testMove, defaultOptions);

      expect(win).not.toBeNull();
      expect(win?.winner).toBe(1);
      expect(win?.line).toEqual([
        idx(5, 0, size),
        idx(5, 1, size),
        idx(5, 2, size),
        idx(5, 3, size),
        idx(5, 4, size),
      ]);
    });

    it('thắng theo đường chéo xuôi (Main Diagonal \\)', () => {
      const size = 15;
      const rows = [
        '..x............',
        '...x...........',
        '....x..........',
        '.....x.........',
        '......x........',
      ];
      const board = createBoardFromAscii(rows, size);

      const centerMove = idx(4, 2, size);
      const win = checkWinAt(board, size, centerMove, defaultOptions);

      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
      expect(win?.line).toEqual([
        idx(2, 0, size),
        idx(3, 1, size),
        idx(4, 2, size),
        idx(5, 3, size),
        idx(6, 4, size),
      ]);
    });

    it('thắng theo đường chéo ngược (Anti-Diagonal /)', () => {
      const size = 15;
      const rows = [
        '......o........',
        '.....o.........',
        '....o..........',
        '...o...........',
        '..o............',
      ];
      const board = createBoardFromAscii(rows, size);

      const centerMove = idx(4, 2, size);
      const win = checkWinAt(board, size, centerMove, defaultOptions);

      expect(win).not.toBeNull();
      expect(win?.winner).toBe(1);
      expect(win?.line).toEqual([
        idx(2, 4, size),
        idx(3, 3, size),
        idx(4, 2, size),
        idx(5, 1, size),
        idx(6, 0, size),
      ]);
    });
  });

  describe('Kiểm tra chuỗi chưa thắng (Incomplete & Broken Lines)', () => {
    it('chuỗi 4 quân chưa đủ winLength 5 -> không thắng', () => {
      const size = 15;
      const rows = ['...xxxx........'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(3, 0, size), defaultOptions);
      expect(win).toBeNull();
    });

    it('chuỗi 5 quân bị đứt quãng ở giữa (x x . x x x) -> không thắng', () => {
      const size = 15;
      const rows = ['..xx.xxx.......'];
      const board = createBoardFromAscii(rows, size);

      expect(checkWinAt(board, size, idx(2, 0, size), defaultOptions)).toBeNull();
      expect(checkWinAt(board, size, idx(5, 0, size), defaultOptions)).toBeNull();
    });

    it('checkWinAt trả về null khi kiểm tra ô trống hoặc ô không hợp lệ', () => {
      const size = 15;
      const board = new Array<number>(size * size).fill(-1);
      expect(checkWinAt(board, size, 0, defaultOptions)).toBeNull();
    });
  });

  describe('Luật Chặn 2 Đầu (blockedTwoEndsRule = true - Luật Caro Việt Nam)', () => {
    it('5 quân bị chặn CẢ 2 ĐẦU bởi quân đối phương (o x x x x x o) -> KHÔNG THẮNG', () => {
      const size = 15;
      const rows = ['..oxxxxxo......'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(4, 0, size), defaultOptions);
      expect(win).toBeNull();
    });

    it('5 quân chỉ bị chặn 1 ĐẦU bởi đối phương (. x x x x x o) -> VẪN THẮNG', () => {
      const size = 15;
      const rows = ['.xxxxxo........'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(3, 0, size), defaultOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
    });

    it('5 quân chỉ bị chặn 1 đầu phía trước (o x x x x x .) -> VẪN THẮNG', () => {
      const size = 15;
      const rows = ['oxxxxx.........'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(3, 0, size), defaultOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
    });

    it('5 quân sát mép biên + 1 đầu bị chặn đối phương (Mép bàn KHÔNG tính là chặn) -> VẪN THẮNG', () => {
      const size = 15;
      // Đầu trái là mép bàn (x = 0), đầu phải bị quân o chặn (x = 5)
      const rows = ['xxxxxo.........'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(2, 0, size), defaultOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
    });

    it('5 quân với cả 2 đầu đều là mép biên (trên bàn 5x5 winLength 5) -> VẪN THẮNG', () => {
      const size = 5;
      const rows = ['xxxxx'];
      const options5: CaroOptions = {
        boardSize: 5,
        winLength: 5,
        blockedTwoEndsRule: true,
        allowOverline: true,
      };
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(2, 0, size), options5);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
    });

    it('khi blockedTwoEndsRule = false: 5 quân bị chặn 2 đầu (o x x x x x o) -> VẪN THẮNG (Luật quốc tế Gomoku)', () => {
      const size = 15;
      const rows = ['..oxxxxxo......'];
      const board = createBoardFromAscii(rows, size);

      const freestyleOptions: CaroOptions = {
        ...defaultOptions,
        blockedTwoEndsRule: false,
      };

      const win = checkWinAt(board, size, idx(4, 0, size), freestyleOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
    });
  });

  describe('Luật Hàng Dài (Overline Rule)', () => {
    it('6 quân liên tiếp với allowOverline = true -> THẮNG', () => {
      const size = 15;
      const rows = ['...xxxxxx......'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(5, 0, size), defaultOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
      expect(win?.line.length).toBe(6);
    });

    it('6 quân liên tiếp với allowOverline = false -> KHÔNG THẮNG', () => {
      const size = 15;
      const rows = ['...xxxxxx......'];
      const board = createBoardFromAscii(rows, size);

      const exactFiveOptions: CaroOptions = {
        ...defaultOptions,
        allowOverline: false,
      };

      const win = checkWinAt(board, size, idx(5, 0, size), exactFiveOptions);
      expect(win).toBeNull();
    });

    it('6 quân liên tiếp bị chặn CẢ 2 ĐẦU (o xxxxxx o) với allowOverline = true, blockedTwoEnds = true -> KHÔNG THẮNG', () => {
      const size = 15;
      const rows = ['..oxxxxxxo.....'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(5, 0, size), defaultOptions);
      expect(win).toBeNull();
    });

    it('6 quân liên tiếp chỉ bị chặn 1 đầu (. xxxxxx o) -> THẮNG', () => {
      const size = 15;
      const rows = ['..xxxxxxo......'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinAt(board, size, idx(5, 0, size), defaultOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(0);
      expect(win?.line.length).toBe(6);
    });
  });

  describe('checkWinFullScan', () => {
    it('tìm ra chiến thắng bất kể vị trí trên toàn bàn cờ', () => {
      const size = 15;
      const rows = [
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '...............',
        '.........ooooo.',
      ];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinFullScan(board, size, defaultOptions);
      expect(win).not.toBeNull();
      expect(win?.winner).toBe(1);
    });

    it('trả về null khi bàn cờ chưa có ai thắng', () => {
      const size = 15;
      const rows = ['...xoxox.......', '...oxoxo.......'];
      const board = createBoardFromAscii(rows, size);

      const win = checkWinFullScan(board, size, defaultOptions);
      expect(win).toBeNull();
    });
  });

  describe('Đối Chứng Tính Đồng Nhất (Deterministic Cross-Validation: checkWinAt vs checkWinFullScan)', () => {
    it('20 bàn cờ ngẫu nhiên có hạt giống cố định (Mulberry32) cho kết quả checkWinAt(lastMove) đồng nhất 100% với checkWinFullScan', () => {
      const size = 15;
      const random = createPrng(424242);

      for (let gameIdx = 0; gameIdx < 20; gameIdx++) {
        const board = new Array<number>(size * size).fill(-1);
        const availableMoves: number[] = [];
        for (let i = 0; i < size * size; i++) availableMoves.push(i);

        let lastMove = -1;
        const totalMoves = 10 + Math.floor(random() * 40); // 10..50 nước

        for (let step = 0; step < totalMoves && availableMoves.length > 0; step++) {
          const randIndex = Math.floor(random() * availableMoves.length);
          const chosenMove = availableMoves.splice(randIndex, 1)[0] ?? 0;

          const player = (step % 2) as 0 | 1;
          board[chosenMove] = player;
          lastMove = chosenMove;

          // Kiểm tra xem nước đi này có thắng không
          const atWin = checkWinAt(board, size, lastMove, defaultOptions);
          if (atWin !== null) {
            const fullWin = checkWinFullScan(board, size, defaultOptions);
            expect(fullWin).not.toBeNull();
            expect(fullWin?.winner).toBe(atWin.winner);
            break;
          }
        }

        // Kiểm tra đối chứng kết quả cuối cùng
        const finalAtWin =
          lastMove !== -1 ? checkWinAt(board, size, lastMove, defaultOptions) : null;
        const finalFullWin = checkWinFullScan(board, size, defaultOptions);

        if (finalAtWin !== null) {
          expect(finalFullWin).not.toBeNull();
          expect(finalFullWin?.winner).toBe(finalAtWin.winner);
        }
      }
    });
  });
});
