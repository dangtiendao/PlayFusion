import { describe, it, expect } from 'vitest';
import { EngineError } from '../types';
import { caroEngine } from './engine';
import { idx } from './board';
import type { CaroState } from './types';

describe('Caro Game Engine (P1.1a)', () => {
  describe('init', () => {
    it('khởi tạo thành công với cấu hình mặc định (15x15, win 5, blockedTwoEnds true, allowOverline true)', () => {
      const state = caroEngine.init({ playerCount: 2 });

      expect(state.currentPlayer).toBe(0);
      expect(state.moveCount).toBe(0);
      expect(state.lastMove).toBeNull();
      expect(state.board.length).toBe(225);
      expect(state.board.every((cell) => cell === -1)).toBe(true);

      expect(state.options).toEqual({
        boardSize: 15,
        winLength: 5,
        blockedTwoEndsRule: true,
        allowOverline: true,
      });
    });

    it('khởi tạo thành công với options tùy chỉnh', () => {
      const state = caroEngine.init({
        playerCount: 2,
        options: {
          boardSize: 19,
          winLength: 6,
          blockedTwoEndsRule: false,
          allowOverline: false,
        },
      });

      expect(state.board.length).toBe(19 * 19);
      expect(state.options).toEqual({
        boardSize: 19,
        winLength: 6,
        blockedTwoEndsRule: false,
        allowOverline: false,
      });
    });

    it('ném lỗi INVALID_STATE khi playerCount khác 2', () => {
      expect(() => caroEngine.init({ playerCount: 1 })).toThrowError(EngineError);
      expect(() => caroEngine.init({ playerCount: 3 })).toThrowError(EngineError);
      expect(() => caroEngine.init({ playerCount: 4 })).toThrowError(EngineError);

      try {
        caroEngine.init({ playerCount: 1 });
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('INVALID_STATE');
      }
    });

    it('ném lỗi INVALID_STATE khi options nằm ngoài phạm vi cho phép', () => {
      // boardSize < 5 hoặc > 25
      expect(() => caroEngine.init({ playerCount: 2, options: { boardSize: 4 } })).toThrowError(
        EngineError,
      );
      expect(() => caroEngine.init({ playerCount: 2, options: { boardSize: 26 } })).toThrowError(
        EngineError,
      );
      expect(() => caroEngine.init({ playerCount: 2, options: { boardSize: 15.5 } })).toThrowError(
        EngineError,
      );

      // winLength < 3 hoặc > boardSize
      expect(() =>
        caroEngine.init({ playerCount: 2, options: { boardSize: 15, winLength: 2 } }),
      ).toThrowError(EngineError);
      expect(() =>
        caroEngine.init({ playerCount: 2, options: { boardSize: 15, winLength: 16 } }),
      ).toThrowError(EngineError);
    });
  });

  describe('currentPlayer', () => {
    it('trả về đúng currentPlayer từ state', () => {
      const state = caroEngine.init({ playerCount: 2 });
      expect(caroEngine.currentPlayer(state)).toBe(0);

      const modifiedState: CaroState = {
        ...state,
        currentPlayer: 1,
      };
      expect(caroEngine.currentPlayer(modifiedState)).toBe(1);
    });
  });

  describe('Placeholder Methods (P1.1b & P1.1c)', () => {
    it('legalMoves ném INVALID_STATE thông báo chưa triển khai', () => {
      const state = caroEngine.init({ playerCount: 2 });
      expect(() => caroEngine.legalMoves(state, 0)).toThrowError(EngineError);
      try {
        caroEngine.legalMoves(state, 0);
      } catch (err) {
        expect((err as EngineError).code).toBe('INVALID_STATE');
        expect((err as EngineError).message).toContain('P1.1b');
      }
    });

    it('applyMove ném INVALID_STATE thông báo chưa triển khai', () => {
      const state = caroEngine.init({ playerCount: 2 });
      expect(() => caroEngine.applyMove(state, 0, 0)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, 0, 0);
      } catch (err) {
        expect((err as EngineError).code).toBe('INVALID_STATE');
        expect((err as EngineError).message).toContain('P1.1b');
      }
    });

    it('isTerminal ném INVALID_STATE thông báo chưa triển khai', () => {
      const state = caroEngine.init({ playerCount: 2 });
      expect(() => caroEngine.isTerminal(state)).toThrowError(EngineError);
      try {
        caroEngine.isTerminal(state);
      } catch (err) {
        expect((err as EngineError).code).toBe('INVALID_STATE');
        expect((err as EngineError).message).toContain('P1.1c');
      }
    });
  });

  describe('serialize & deserialize (Round-Trip)', () => {
    it('round-trip bảo toàn 100% với bàn cờ trống ban đầu', () => {
      const state = caroEngine.init({ playerCount: 2 });
      const serialized = caroEngine.serialize(state);

      expect(serialized).toBe('v1:15:5:1:1:0:0:-1:225.');
      expect(serialized.length).toBe(23);

      const deserialized = caroEngine.deserialize(serialized);
      expect(deserialized).toEqual(state);

      // Round-trip s -> d -> s
      expect(caroEngine.serialize(deserialized)).toBe(serialized);
    });

    it('round-trip bảo toàn 100% với bàn cờ có quân xen kẽ (chẵn nước)', () => {
      const baseState = caroEngine.init({ playerCount: 2 });
      const board = [...baseState.board];

      // Đánh 4 nước: X tại (7,7), O tại (7,8), X tại (8,7), O tại (8,8)
      const p1 = idx(7, 7, 15);
      const p2 = idx(7, 8, 15);
      const p3 = idx(8, 7, 15);
      const p4 = idx(8, 8, 15);

      board[p1] = 0; // X
      board[p2] = 1; // O
      board[p3] = 0; // X
      board[p4] = 1; // O

      const activeState: CaroState = {
        ...baseState,
        board,
        currentPlayer: 0,
        moveCount: 4,
        lastMove: p4,
      };

      const serialized = caroEngine.serialize(activeState);
      const deserialized = caroEngine.deserialize(serialized);

      expect(deserialized).toEqual(activeState);
      expect(caroEngine.serialize(deserialized)).toBe(serialized);
    });

    it('round-trip bảo toàn 100% với bàn cờ có số nước lẻ (X vừa đi, tới lượt O)', () => {
      const baseState = caroEngine.init({ playerCount: 2 });
      const board = [...baseState.board];

      // Đánh 3 nước: X (7,7), O (7,8), X (8,8) -> lastMove là p3 (X), currentPlayer là 1 (O)
      const p1 = idx(7, 7, 15);
      const p2 = idx(7, 8, 15);
      const p3 = idx(8, 8, 15);

      board[p1] = 0;
      board[p2] = 1;
      board[p3] = 0;

      const oddState: CaroState = {
        ...baseState,
        board,
        currentPlayer: 1,
        moveCount: 3,
        lastMove: p3,
      };

      const serialized = caroEngine.serialize(oddState);
      const deserialized = caroEngine.deserialize(serialized);

      expect(deserialized).toEqual(oddState);
      expect(caroEngine.serialize(deserialized)).toBe(serialized);
    });

    it('round-trip bảo toàn 100% với bàn cờ 60 nước đi và kích thước siêu tối ưu', () => {
      const baseState = caroEngine.init({ playerCount: 2 });
      const board = [...baseState.board];

      // Dựng thủ công 60 nước đi xung quanh trung tâm bàn cờ
      let lastMove = -1;
      for (let i = 0; i < 30; i++) {
        const xPos = idx(4 + (i % 8), 4 + Math.floor(i / 8) * 2, 15);
        const oPos = idx(4 + (i % 8), 5 + Math.floor(i / 8) * 2, 15);
        board[xPos] = 0;
        board[oPos] = 1;
        lastMove = oPos;
      }

      const matchState: CaroState = {
        ...baseState,
        board,
        currentPlayer: 0,
        moveCount: 60,
        lastMove,
      };

      const serialized = caroEngine.serialize(matchState);

      // Kiểm chứng kích thước nén nhỏ hơn 150 byte (vài trăm byte mục tiêu)
      expect(serialized.length).toBeLessThan(150);

      const deserialized = caroEngine.deserialize(serialized);
      expect(deserialized).toEqual(matchState);
      expect(caroEngine.serialize(deserialized)).toBe(serialized);
    });

    it('round-trip bảo toàn với cấu hình tùy biến (5x5, winLength 3, flags false)', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: {
          boardSize: 5,
          winLength: 3,
          blockedTwoEndsRule: false,
          allowOverline: false,
        },
      });

      const board = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, -1, -1, -1, -1];

      const customState: CaroState = {
        ...baseState,
        board,
        currentPlayer: 1,
        moveCount: 21,
        lastMove: 20,
      };

      const serialized = caroEngine.serialize(customState);
      expect(serialized.startsWith('v1:5:3:0:0:1:21:20:')).toBe(true);

      const deserialized = caroEngine.deserialize(serialized);
      expect(deserialized).toEqual(customState);
    });
  });

  describe('deserialize Validation & Error Handling (Bắt lỗi chuỗi serialization hỏng)', () => {
    it('ném INVALID_STATE khi dữ liệu rỗng hoặc sai cấu trúc header', () => {
      expect(() => caroEngine.deserialize('')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('   ')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:225.:extra')).toThrowError(
        EngineError,
      );
    });

    it('ném INVALID_STATE khi phiên bản không phải v1', () => {
      expect(() => caroEngine.deserialize('v2:15:5:1:1:0:0:-1:225.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi options ngoài biên hợp lệ', () => {
      // boardSize sai
      expect(() => caroEngine.deserialize('v1:4:5:1:1:0:0:-1:16.')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:26:5:1:1:0:0:-1:676.')).toThrowError(EngineError);

      // winLength sai
      expect(() => caroEngine.deserialize('v1:15:2:1:1:0:0:-1:225.')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:16:1:1:0:0:-1:225.')).toThrowError(EngineError);

      // boolean flags sai
      expect(() => caroEngine.deserialize('v1:15:5:2:1:0:0:-1:225.')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:9:0:0:-1:225.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi currentPlayer hoặc moveCount không hợp lệ', () => {
      // currentPlayer khác 0 và 1
      expect(() => caroEngine.deserialize('v1:15:5:1:1:2:0:-1:225.')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:1:-1:0:-1:225.')).toThrowError(EngineError);

      // moveCount âm hoặc không phải số nguyên
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:-5:-1:225.')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:abc:-1:225.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi lastMove ngoài biên', () => {
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-2:225.')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:225:225.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi chuỗi RLE chứa ký tự lạ hoặc lỗi cú pháp', () => {
      // Ký tự lạ
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:224.z')).toThrowError(EngineError);
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:224.X')).toThrowError(EngineError);

      // Kết thúc dở dang với chữ số
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:220.5')).toThrowError(EngineError);

      // Số lần lặp <= 0
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:0.225.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi số ô sau giải nén không khớp boardSize*boardSize', () => {
      // Thiếu ô (224 thay vì 225)
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:224.')).toThrowError(EngineError);
      // Thừa ô (226 thay vì 225)
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:226.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi số quân cờ trên bàn không khớp moveCount', () => {
      // moveCount = 1 nhưng bàn cờ trống (0 quân)
      expect(() => caroEngine.deserialize('v1:15:5:1:1:1:1:0:225.')).toThrowError(EngineError);

      // moveCount = 2 nhưng trên bàn có 1 quân
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:2:0:x224.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi tỷ lệ quân X và O không khớp với lượt đi', () => {
      // currentPlayer = 0 (lượt X) nhưng số quân X (1) lại nhiều hơn O (0)
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:1:0:x224.')).toThrowError(EngineError);

      // currentPlayer = 1 (lượt O) nhưng số quân X (1) và O (1) lại bằng nhau
      expect(() => caroEngine.deserialize('v1:15:5:1:1:1:2:1:xo223.')).toThrowError(EngineError);
    });

    it('ném INVALID_STATE khi lastMove không hợp lệ đối chiếu với quân cờ trên bàn', () => {
      // moveCount = 0 nhưng lastMove khác -1
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:5:225.')).toThrowError(EngineError);

      // lastMove trỏ vào ô trống
      expect(() => caroEngine.deserialize('v1:15:5:1:1:1:1:5:x224.')).toThrowError(EngineError);

      // currentPlayer = 0 (người vừa đi là 1/O) nhưng lastMove lại trỏ vào quân 0/X
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:2:0:xo223.')).toThrowError(EngineError);
    });
  });
});
