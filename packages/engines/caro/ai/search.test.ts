import { describe, it, expect } from 'vitest';
import { findBestMove } from './search';
import { caroEngine } from '../engine';
import { idx } from '../board';
import { createBoardFromAscii } from '../test-utils';
import type { CaroState } from '../types';

describe('Caro AI Search Engine (search.ts - P1.2b)', () => {
  describe('Bàn cờ trống ban đầu', () => {
    it('bàn cờ trống ban đầu luôn đánh vào ô chính giữa bàn cờ', () => {
      const state = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });
      const res = findBestMove(state, { level: 'hard', seed: 'init-seed' });

      expect(res.move).toBe(idx(7, 7, 15));
      expect(res.depth).toBe(0);
    });

    it('bàn cờ đầy không còn ô trống trả về nước đi mặc định 0 mà không ném lỗi', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 5, winLength: 5 },
      });
      const fullBoard = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
      const fullState: CaroState = {
        ...baseState,
        board: fullBoard,
        moveCount: 25,
      };

      const res = findBestMove(fullState, { level: 'hard', seed: 'full-board-test' });
      expect(res.move).toBe(0);
      expect(res.depth).toBe(0);
    });

    it('bàn cờ gần đầy (24/25 ô) tìm kiếm sâu 2 tầng chạm hòa cờ trả về kết quả hợp lệ', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 5, winLength: 5 },
      });
      const nearFullBoard = [
        0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, -1,
      ];
      const state: CaroState = {
        ...baseState,
        board: nearFullBoard,
        moveCount: 24,
        currentPlayer: 0,
      };

      const res = findBestMove(state, { level: 'hard', seed: 'near-full-test' });
      expect(res.move).toBe(24);
    });
  });

  describe('Bước (a): Kiểm tra nước Thắng Ngay (Immediate Win)', () => {
    it('cả 3 mức easy, medium, hard đều đánh ngay nước kết liễu 5 quân', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // X đang có 4 quân: (1,1), (2,1), (3,1), (4,1). Đánh vào (5,1) -> THẮNG!
      const ascii = [
        '. . . . . . .',
        '. x x x x . .',
        '. . . . . . .',
        '. . . o o . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 6,
        currentPlayer: 0,
      };

      const winningMove1 = idx(5, 1, 7);
      const winningMove2 = idx(0, 1, 7);

      for (const level of ['easy', 'medium', 'hard'] as const) {
        const res = findBestMove(state, { level, seed: 'win-seed' });
        expect([winningMove1, winningMove2]).toContain(res.move);
        expect(res.score).toBeGreaterThanOrEqual(100_000_000);
      }
    });
  });

  describe('Bước (b): Kiểm tra nước Chặn Đối Thủ Thắng Ngay (Immediate Block)', () => {
    it('mức medium và hard LUÔN chặn đứng nước thắng ngay của đối phương', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      // Đối thủ (O) đang có 4 quân: (1,1), (2,1), (3,1), (4,1). Đến lượt X đi!
      const ascii = [
        '. . . . . . .',
        '. o o o o . .',
        '. . . . . . .',
        '. . . x x . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 6,
        currentPlayer: 0,
      };

      const blockMove1 = idx(5, 1, 7);
      const blockMove2 = idx(0, 1, 7);

      const resMedium = findBestMove(state, { level: 'medium', seed: 'block-seed' });
      expect([blockMove1, blockMove2]).toContain(resMedium.move);

      const resHard = findBestMove(state, { level: 'hard', seed: 'block-seed' });
      expect([blockMove1, blockMove2]).toContain(resHard.move);
    });

    it('mức easy với seed phù hợp có thể quên chặn (xác suất 30%)', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      const ascii = [
        '. . . . . . .',
        '. o o o o . .',
        '. . . . . . .',
        '. . . x x . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 6,
        currentPlayer: 0,
      };

      // Thử 10 seed khác nhau để xác nhận có cả trường hợp chặn và trường hợp quên chặn
      let forgotAtLeastOnce = false;
      let blockedAtLeastOnce = false;
      const blockMoves = [idx(0, 1, 7), idx(5, 1, 7)];

      for (let i = 0; i < 20; i++) {
        const res = findBestMove(state, { level: 'easy', seed: `seed-test-${i}` });
        if (blockMoves.includes(res.move)) {
          blockedAtLeastOnce = true;
        } else {
          forgotAtLeastOnce = true;
        }
      }

      expect(blockedAtLeastOnce).toBe(true);
      expect(forgotAtLeastOnce).toBe(true);
    });
  });

  describe('Tình huống chiến thuật: Bẫy Đôi (Double Threat)', () => {
    it('AI Hard lựa chọn nước tạo bẫy đôi (Double Threat) áp đảo đối thủ', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 9, winLength: 5 },
      });
      // X đã có:
      // Chuỗi 1 (ngang): (2,3), (3,3)
      // Chuỗi 2 (dọc):   (4,1), (4,2)
      // Nước đi tại giao điểm (4,3) sẽ đồng thời tạo ra 1 Mở 3 ngang và 1 Mở 3 dọc -> Bẫy đôi không thể đỡ!
      // O đặt 2 quân ở xa không tạo thế đe dọa: (0,0) và (8,8)
      const ascii = [
        'o . . . . . . . .', // (0,0)
        '. . . . x . . . .', // (4,1)
        '. . . . x . . . .', // (4,2)
        '. . x x . . . . .', // (2,3), (3,3) -> Đánh vào (4,3) tạo đòn đôi!
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . o', // (8,8)
      ];
      const board = createBoardFromAscii(ascii, 9);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 6,
        currentPlayer: 0,
      };

      const doubleThreatMove = idx(4, 3, 9);
      const res = findBestMove(state, { level: 'hard', seed: 'double-threat-seed' });

      expect(res.move).toBe(doubleThreatMove);
    });
  });

  describe('Hiệu quả Cắt tỉa Alpha-Beta (Alpha-Beta Cutoff Verification)', () => {
    it('số lượng node duyệt khi bật Alpha-Beta nhỏ hơn 30% so với Minimax thô không cắt tỉa', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      const ascii = [
        '. . . . . . .',
        '. . x o . . .',
        '. . x o . . .',
        '. . . . . . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 4,
        currentPlayer: 0,
      };

      // 1. Chạy với Alpha-Beta Pruning (Mặc định)
      const resPruned = findBestMove(state, {
        level: 'hard',
        seed: 'pruning-test',
        disablePruning: false,
      });

      // 2. Chạy với Minimax thô (Tắt Alpha-Beta Pruning)
      const resUnpruned = findBestMove(state, {
        level: 'hard',
        seed: 'pruning-test',
        disablePruning: true,
      });

      // Alpha-Beta cắt tỉa giảm tối thiểu 70% số lượng node duyệt
      expect(resPruned.nodes).toBeGreaterThan(0);
      expect(resPruned.nodes).toBeLessThan(resUnpruned.nodes * 0.3);
    });
  });

  describe('Iterative Deepening & Quản lý Ngân sách Thời gian (timeBudgetMs)', () => {
    it('khi hết ngân sách thời gian giữa chừng, trả về kết quả của độ sâu hoàn chỉnh gần nhất mà không ném lỗi', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 7, winLength: 5 },
      });
      const ascii = [
        '. . . . . . .',
        '. . x o . . .',
        '. . x o . . .',
        '. . . . . . .',
        '. . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 7);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 4,
        currentPlayer: 0,
      };

      // Mock hàm now() giả lập: 30 lần gọi đầu trả về 0, sau đó nhảy vọt lên 2000ms (quá 500ms budget)
      let callCount = 0;
      const mockedNow = () => {
        callCount++;
        return callCount < 40 ? 0 : 2000;
      };

      const res = findBestMove(state, {
        level: 'hard',
        timeBudgetMs: 500,
        now: mockedNow,
        seed: 'mocked-timeout',
      });

      expect(res.move).toBeGreaterThanOrEqual(0);
      expect(res.depth).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Tính Xác Định (100% Deterministic)', () => {
    it('cùng state + cùng seed + cùng level sinh ra nước đi giống hệt nhau qua 2 lần chạy', () => {
      const state = caroEngine.init({ playerCount: 2 });
      const nextState = caroEngine.applyMove(state, 112, 0);

      const res1 = findBestMove(nextState, { level: 'hard', seed: 'fixed-seed-abc' });
      const res2 = findBestMove(nextState, { level: 'hard', seed: 'fixed-seed-abc' });

      expect(res1.move).toBe(res2.move);
      expect(res1.score).toBe(res2.score);
    });
  });

  describe('AI vs AI: Hard đấu Easy (10 Ván Kiểm Thử Năng Lực)', () => {
    it('AI Hard thắng ít nhất 8/10 ván trước AI Easy', () => {
      let hardWins = 0;
      let easyWins = 0;
      let draws = 0;

      const totalGames = 10;
      const options = { boardSize: 9, winLength: 5, blockedTwoEndsRule: true, allowOverline: true };

      const matchStart = Date.now();

      for (let g = 0; g < totalGames; g++) {
        let state = caroEngine.init({ playerCount: 2, options });
        const hardPlayer = (g % 2) as 0 | 1; // Luân phiên bên đi trước

        const maxMoves = 50;
        let movesPlayed = 0;

        while (movesPlayed < maxMoves) {
          const isHardTurn = state.currentPlayer === hardPlayer;
          const level = isHardTurn ? 'hard' : 'easy';
          const seed = `game-${g}-turn-${movesPlayed}`;

          const aiRes = findBestMove(state, { level, seed, timeBudgetMs: 500 });
          state = caroEngine.applyMove(state, aiRes.move, state.currentPlayer);
          movesPlayed++;

          const terminal = caroEngine.isTerminal(state);
          if (terminal.over) {
            if (terminal.outcomes) {
              const winnerOutcome = terminal.outcomes.find((o) => o.outcome === 'win');
              if (winnerOutcome) {
                if (winnerOutcome.playerIndex === hardPlayer) {
                  hardWins++;
                } else {
                  easyWins++;
                }
              } else {
                draws++;
              }
            }
            break;
          }
        }
      }

      const elapsedSec = (Date.now() - matchStart) / 1000;
      // In kết quả thống kê
      console.log(
        `[AI vs AI] Hard Wins: ${hardWins}/${totalGames} | Easy Wins: ${easyWins}/${totalGames} | Draws: ${draws} | Tổng thời gian: ${elapsedSec.toFixed(2)}s`,
      );

      expect(hardWins).toBeGreaterThanOrEqual(8);
    }, 60000); // 60s timeout
  });
});
