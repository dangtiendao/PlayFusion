import { describe, it, expect } from 'vitest';
import { generateCandidates } from './candidates';
import { caroEngine } from '../engine';
import { idx, xy } from '../board';
import { createBoardFromAscii } from '../test-utils';
import type { CaroState } from '../types';

describe('Caro AI Candidates Generation & Move Ordering (candidates.ts - P1.2a)', () => {
  describe('Khởi đầu ván cờ (Bàn cờ trống)', () => {
    it('bàn cờ trống hoàn toàn trả về đúng 1 ô trung tâm bàn cờ', () => {
      // Bàn 15x15: Tâm là (7, 7) -> index = 7*15 + 7 = 112
      const state15 = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });
      const candidates15 = generateCandidates(state15);
      expect(candidates15).toEqual([idx(7, 7, 15)]);

      // Bàn 7x7: Tâm là (3, 3) -> index = 3*7 + 3 = 24
      const state7 = caroEngine.init({ playerCount: 2, options: { boardSize: 7 } });
      const candidates7 = generateCandidates(state7);
      expect(candidates7).toEqual([idx(3, 3, 7)]);
    });
  });

  describe('Bán kính lân cận (Radius)', () => {
    it('chỉ sinh các ô trống trong bán kính radius quanh các quân cờ đã đánh', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 9, winLength: 5 },
      });
      // Đặt 1 quân duy nhất tại tâm (4, 4)
      const ascii = [
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . x . . . .', // (4, 4)
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 9);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 1,
        currentPlayer: 1,
      };

      // Bán kính radius = 1 (vùng 3x3 quanh (4,4) trừ đi ô (4,4) -> đúng 8 ô)
      const candidatesR1 = generateCandidates(state, { radius: 1, maxCandidates: 50 });
      expect(candidatesR1.length).toBe(8);

      for (const move of candidatesR1) {
        const { x, y } = xy(move, 9);
        const dist = Math.max(Math.abs(x - 4), Math.abs(y - 4));
        expect(dist).toBeLessThanOrEqual(1);
      }

      // Các ô cách xa > 2 (ví dụ góc (0,0)) không bao giờ xuất hiện
      const candidatesR2 = generateCandidates(state, { radius: 2, maxCandidates: 50 });
      expect(candidatesR2.includes(idx(0, 0, 9))).toBe(false);
      expect(candidatesR2.includes(idx(8, 8, 9))).toBe(false);
    });
  });

  describe('Giới hạn maxCandidates', () => {
    it('tôn trọng maxCandidates cắt gọn danh sách', () => {
      let state = caroEngine.init({ playerCount: 2 });
      state = caroEngine.applyMove(state, 112, 0);
      state = caroEngine.applyMove(state, 113, 1);
      state = caroEngine.applyMove(state, 97, 0);

      const top5 = generateCandidates(state, { maxCandidates: 5 });
      expect(top5.length).toBe(5);

      const top10 = generateCandidates(state, { maxCandidates: 10 });
      expect(top10.length).toBe(10);
    });
  });

  describe('Move Ordering (Sắp xếp nước đi thông minh)', () => {
    it('nước đi tạo chuỗi thắng ngay lập tức PHẢI đứng ở vị trí đầu tiên [0]', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 9, winLength: 5 },
      });
      // X đang có 4 quân: (1,1), (2,1), (3,1), (4,1). Đánh vào (5,1) -> THẮNG NGAY!
      const ascii = [
        '. . . . . . . . .',
        '. x x x x . . . .',
        '. . . . . . . . .',
        '. . . o o . . . .',
        '. . . . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 9);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 6,
        currentPlayer: 0,
      };

      const candidates = generateCandidates(state);
      const winningMove1 = idx(5, 1, 9);
      const winningMove2 = idx(0, 1, 9);

      // Nước thắng ngay (5,1) hoặc (0,1) phải nằm ở TOP đầu (vị trí số 0 hoặc 1)
      expect([winningMove1, winningMove2]).toContain(candidates[0]);
    });

    it('nước đi chặn đối thủ thắng ngay PHẢI được ưu tiên lên TOP đầu', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 9, winLength: 5 },
      });
      // Đối thủ (O) đang có 4 quân: (1,1), (2,1), (3,1), (4,1). Đến lượt X đi!
      const ascii = [
        '. . . . . . . . .',
        '. o o o o . . . .',
        '. . . . . . . . .',
        '. . . x x . . . .',
        '. . . . . . . . .',
      ];
      const board = createBoardFromAscii(ascii, 9);
      const state: CaroState = {
        ...baseState,
        board,
        moveCount: 6,
        currentPlayer: 0,
      };

      const candidates = generateCandidates(state);
      const criticalBlock1 = idx(5, 1, 9);
      const criticalBlock2 = idx(0, 1, 9);

      // Nước chặn tử huyệt phải đứng ngay vị trí đầu tiên
      expect([criticalBlock1, criticalBlock2]).toContain(candidates[0]);
    });
  });

  describe('Tính Xác Định (100% Deterministic)', () => {
    it('gọi 2 lần với cùng một trạng thái đầu vào trả về danh sách kết quả giống hệt nhau', () => {
      let state = caroEngine.init({ playerCount: 2 });
      state = caroEngine.applyMove(state, 112, 0);
      state = caroEngine.applyMove(state, 113, 1);
      state = caroEngine.applyMove(state, 127, 0);
      state = caroEngine.applyMove(state, 128, 1);

      const run1 = generateCandidates(state);
      const run2 = generateCandidates(state);

      expect(run1).toEqual(run2);
    });

    it('trả về mảng rỗng [] khi bàn cờ đã đầy không còn ô trống', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 5, winLength: 5 },
      });
      const fullBoard = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
      const state: CaroState = {
        ...baseState,
        board: fullBoard,
        moveCount: 25,
      };

      const candidates = generateCandidates(state);
      expect(candidates).toEqual([]);
    });
  });
});
