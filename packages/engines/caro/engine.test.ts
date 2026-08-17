import { describe, it, expect } from 'vitest';
import { EngineError } from '../types';
import { caroEngine } from './engine';
import { idx } from './board';
import type { CaroState } from './types';

describe('Caro Game Engine (P1.1a & P1.1b)', () => {
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

  describe('legalMoves (P1.1b)', () => {
    it('trả về toàn bộ 225 ô cờ theo thứ tự tăng dần trên bàn cờ trống', () => {
      const state = caroEngine.init({ playerCount: 2 });
      const moves = caroEngine.legalMoves(state, 0);

      expect(moves.length).toBe(225);
      expect(moves[0]).toBe(0);
      expect(moves[224]).toBe(224);

      // Kiểm tra tính thứ tự tăng dần nghiêm ngặt (deterministic)
      for (let i = 0; i < moves.length - 1; i++) {
        expect((moves[i] ?? 0) < (moves[i + 1] ?? 0)).toBe(true);
      }
    });

    it('trả về mảng rỗng [] khi gọi legalMoves với người chơi không phải lượt', () => {
      const state = caroEngine.init({ playerCount: 2 });
      // Lượt hiện tại là Seat 0, nhưng gọi cho Seat 1
      const moves = caroEngine.legalMoves(state, 1);
      expect(moves).toEqual([]);
    });

    it('trả về chính xác các ô trống còn lại sau khi đã đánh một số nước', () => {
      let state = caroEngine.init({ playerCount: 2 });
      const playedMoves = [112, 113, 127, 128];

      // Đánh 4 nước
      state = caroEngine.applyMove(state, 112, 0);
      state = caroEngine.applyMove(state, 113, 1);
      state = caroEngine.applyMove(state, 127, 0);
      state = caroEngine.applyMove(state, 128, 1);

      // Lượt hiện tại là Seat 0
      const moves = caroEngine.legalMoves(state, 0);
      expect(moves.length).toBe(225 - 4);

      // Không chứa bất kỳ ô nào đã đánh
      for (const move of playedMoves) {
        expect(moves.includes(move)).toBe(false);
      }
    });

    it('trả về mảng rỗng [] khi bàn cờ đã đầy', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 5, winLength: 5 },
      });

      // Tạo bàn 5x5 đầy 25 ô
      const fullBoard = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];

      const fullState: CaroState = {
        ...baseState,
        board: fullBoard,
        currentPlayer: 1,
        moveCount: 25,
        lastMove: 24,
      };

      expect(caroEngine.legalMoves(fullState, 1)).toEqual([]);
    });
  });

  describe('applyMove (P1.1b)', () => {
    it('thực hiện nước đi hợp lệ: cập nhật quân, đổi lượt, tăng moveCount, gán lastMove', () => {
      const state0 = caroEngine.init({ playerCount: 2 });

      // 1. Seat 0 đánh vào ô 112
      const state1 = caroEngine.applyMove(state0, 112, 0);
      expect(state1.board[112]).toBe(0);
      expect(state1.currentPlayer).toBe(1);
      expect(state1.moveCount).toBe(1);
      expect(state1.lastMove).toBe(112);

      // 2. Seat 1 đánh vào ô 113
      const state2 = caroEngine.applyMove(state1, 113, 1);
      expect(state2.board[113]).toBe(1);
      expect(state2.currentPlayer).toBe(0);
      expect(state2.moveCount).toBe(2);
      expect(state2.lastMove).toBe(113);
    });

    it('bảo toàn tính bất biến (Immutability): state cũ không bị mutate khi gọi applyMove', () => {
      const state0 = caroEngine.init({ playerCount: 2 });
      const snapshotBeforeMove = structuredClone(state0);

      const state1 = caroEngine.applyMove(state0, 112, 0);

      // State gốc phải hoàn toàn bằng với snapshot trước khi đi
      expect(state0).toEqual(snapshotBeforeMove);
      expect(state0.board[112]).toBe(-1);
      expect(state0.moveCount).toBe(0);
      expect(state0.lastMove).toBeNull();
      expect(state0.currentPlayer).toBe(0);

      // State mới là một đối tượng và mảng hoàn toàn độc lập
      expect(state1).not.toBe(state0);
      expect(state1.board).not.toBe(state0.board);
    });

    it('ném lỗi WRONG_TURN khi người chơi đi không đúng lượt', () => {
      const state = caroEngine.init({ playerCount: 2 }); // currentPlayer = 0

      expect(() => caroEngine.applyMove(state, 112, 1)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, 112, 1);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('WRONG_TURN');
      }
    });

    it('ném lỗi ILLEGAL_MOVE khi tọa độ nước đi nằm ngoài phạm vi bàn cờ (bao gồm ca biên 224 vs 225)', () => {
      const state = caroEngine.init({ playerCount: 2 });

      // Ca biên hợp lệ: ô cuối cùng 224 trên bàn 15x15
      const validLastCellState = caroEngine.applyMove(state, 224, 0);
      expect(validLastCellState.board[224]).toBe(0);

      // Ca biên không hợp lệ: ô 225 (vượt quá 225 ô: 0..224)
      expect(() => caroEngine.applyMove(state, 225, 0)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, 225, 0);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('ILLEGAL_MOVE');
      }

      // Tọa độ âm
      expect(() => caroEngine.applyMove(state, -1, 0)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, -1, 0);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('ILLEGAL_MOVE');
      }

      // Tọa độ không phải số nguyên
      expect(() => caroEngine.applyMove(state, 10.5, 0)).toThrowError(EngineError);
      expect(() => caroEngine.applyMove(state, NaN, 0)).toThrowError(EngineError);
    });

    it('ném lỗi ILLEGAL_MOVE khi đánh vào ô cờ đã có quân (quân X hoặc quân O)', () => {
      let state = caroEngine.init({ playerCount: 2 });
      state = caroEngine.applyMove(state, 112, 0); // Player 0 đánh vào 112 (X)

      // Player 1 cố tình đánh lại vào 112 (ô có X)
      expect(() => caroEngine.applyMove(state, 112, 1)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, 112, 1);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('ILLEGAL_MOVE');
        expect((err as EngineError).message).toContain('X');
      }

      // Player 1 đánh vào 113 (O)
      state = caroEngine.applyMove(state, 113, 1);

      // Player 0 cố tình đánh vào 113 (ô có O)
      expect(() => caroEngine.applyMove(state, 113, 0)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, 113, 0);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('ILLEGAL_MOVE');
        expect((err as EngineError).message).toContain('O');
      }
    });

    it('ném lỗi GAME_OVER khi bàn cờ đã đầy không thể đi tiếp', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 5, winLength: 5 },
      });

      const fullBoard = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];

      const fullState: CaroState = {
        ...baseState,
        board: fullBoard,
        currentPlayer: 1,
        moveCount: 25,
        lastMove: 24,
      };

      expect(() => caroEngine.applyMove(fullState, 0, 1)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(fullState, 0, 1);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('GAME_OVER');
      }
    });
  });

  describe('Chuỗi Tích Hợp & Determinism (P1.1b)', () => {
    it('chuỗi tích hợp: đi 10 nước -> serialize -> deserialize -> đi tiếp nước thứ 11 thành công', () => {
      let state = caroEngine.init({ playerCount: 2 });
      const moves = [
        idx(0, 0, 15),
        idx(0, 1, 15),
        idx(2, 0, 15),
        idx(2, 1, 15),
        idx(4, 0, 15),
        idx(4, 1, 15),
        idx(6, 0, 15),
        idx(6, 1, 15),
        idx(8, 0, 15),
        idx(8, 1, 15),
      ];

      for (const [i, move] of moves.entries()) {
        const player = (i % 2) as 0 | 1;
        state = caroEngine.applyMove(state, move, player);
      }

      expect(state.moveCount).toBe(10);
      expect(state.currentPlayer).toBe(0);

      // Serialize và Deserialize
      const serialized = caroEngine.serialize(state);
      const restoredState = caroEngine.deserialize(serialized);

      expect(restoredState).toEqual(state);

      // Đi tiếp nước thứ 11 trên restoredState (Player 0 đánh vào ô (10, 0))
      const move11 = idx(10, 0, 15);
      const nextState = caroEngine.applyMove(restoredState, move11, 0);
      expect(nextState.moveCount).toBe(11);
      expect(nextState.currentPlayer).toBe(1);
      expect(nextState.board[move11]).toBe(0);
      expect(nextState.lastMove).toBe(move11);
    });

    it('tính deterministic 100%: 2 chuỗi nước đi giống nhau sinh ra serialize giống hệt nhau', () => {
      const moveSequence = [112, 113, 127, 128, 97, 98];

      let stateA = caroEngine.init({ playerCount: 2 });
      let stateB = caroEngine.init({ playerCount: 2 });

      for (const [i, move] of moveSequence.entries()) {
        const player = (i % 2) as 0 | 1;
        stateA = caroEngine.applyMove(stateA, move, player);
        stateB = caroEngine.applyMove(stateB, move, player);
      }

      expect(stateA).toEqual(stateB);
      expect(caroEngine.serialize(stateA)).toBe(caroEngine.serialize(stateB));
    });
  });

  describe('isTerminal (P1.1c)', () => {
    it('trả về over: false khi ván đấu mới bắt đầu hoặc đang diễn ra', () => {
      const state = caroEngine.init({ playerCount: 2 });
      expect(caroEngine.isTerminal(state)).toEqual({ over: false });

      // Đánh 2 nước
      const state2 = caroEngine.applyMove(state, 112, 0);
      expect(caroEngine.isTerminal(state2)).toEqual({ over: false });
    });

    it('trả về over: true và outcomes chính xác khi Player 0 thắng', () => {
      let state = caroEngine.init({ playerCount: 2 });
      // Player 0 đánh 5 quân liên tiếp: (0,0), (1,0), (2,0), (3,0), (4,0)
      // Player 1 đánh xen kẽ: (0,1), (1,1), (2,1), (3,1)
      state = caroEngine.applyMove(state, idx(0, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(0, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(1, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(1, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(2, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(2, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(3, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(3, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(4, 0, 15), 0); // Nước quyết định

      const terminal = caroEngine.isTerminal(state);
      expect(terminal.over).toBe(true);
      expect(terminal.outcomes).toEqual([
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ]);
    });

    it('trả về over: true và outcomes chính xác khi Player 1 thắng', () => {
      let state = caroEngine.init({ playerCount: 2 });
      // Player 0 đánh phân tán
      // Player 1 đánh 5 quân dọc: (5,0), (5,1), (5,2), (5,3), (5,4)
      state = caroEngine.applyMove(state, idx(0, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(5, 0, 15), 1);
      state = caroEngine.applyMove(state, idx(1, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(5, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(2, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(5, 2, 15), 1);
      state = caroEngine.applyMove(state, idx(3, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(5, 3, 15), 1);
      state = caroEngine.applyMove(state, idx(0, 5, 15), 0);
      state = caroEngine.applyMove(state, idx(5, 4, 15), 1); // Nước thắng của Player 1

      const terminal = caroEngine.isTerminal(state);
      expect(terminal.over).toBe(true);
      expect(terminal.outcomes).toEqual([
        { playerIndex: 1, outcome: 'win' },
        { playerIndex: 0, outcome: 'loss' },
      ]);
    });

    it('trả về over: true và outcomes hòa (draw) khi bàn cờ đầy không ai thắng', () => {
      const baseState = caroEngine.init({
        playerCount: 2,
        options: { boardSize: 5, winLength: 5 },
      });

      // Bàn cờ 5x5 hòa: không có 5 quân cùng loại trên hàng/cột/chéo
      const drawBoard = [0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0];

      const drawState: CaroState = {
        ...baseState,
        board: drawBoard,
        currentPlayer: 1,
        moveCount: 25,
        lastMove: 24,
      };

      const terminal = caroEngine.isTerminal(drawState);
      expect(terminal.over).toBe(true);
      expect(terminal.outcomes).toEqual([
        { playerIndex: 0, outcome: 'draw' },
        { playerIndex: 1, outcome: 'draw' },
      ]);
    });

    it('isTerminal phát hiện thắng qua checkWinFullScan khi lastMove là null', () => {
      const baseState = caroEngine.init({ playerCount: 2 });
      const board = [...baseState.board];

      // Đặt 5 quân X liên tiếp
      for (let i = 0; i < 5; i++) {
        board[idx(i, 0, 15)] = 0;
      }

      const stateWithoutLastMove: CaroState = {
        ...baseState,
        board,
        lastMove: null,
      };

      const terminal = caroEngine.isTerminal(stateWithoutLastMove);
      expect(terminal.over).toBe(true);
      expect(terminal.outcomes).toEqual([
        { playerIndex: 0, outcome: 'win' },
        { playerIndex: 1, outcome: 'loss' },
      ]);
    });

    it('cố tình applyMove sau khi ván đấu đã kết thúc ném lỗi GAME_OVER', () => {
      let state = caroEngine.init({ playerCount: 2 });
      state = caroEngine.applyMove(state, idx(0, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(0, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(1, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(1, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(2, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(2, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(3, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(3, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(4, 0, 15), 0); // Player 0 thắng

      // Cố tình đánh thêm 1 nước
      expect(() => caroEngine.applyMove(state, idx(5, 5, 15), 1)).toThrowError(EngineError);
      try {
        caroEngine.applyMove(state, idx(5, 5, 15), 1);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('GAME_OVER');
      }
    });

    it('legalMoves trả về [] khi ván đấu đã có người thắng', () => {
      let state = caroEngine.init({ playerCount: 2 });
      state = caroEngine.applyMove(state, idx(0, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(0, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(1, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(1, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(2, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(2, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(3, 0, 15), 0);
      state = caroEngine.applyMove(state, idx(3, 1, 15), 1);
      state = caroEngine.applyMove(state, idx(4, 0, 15), 0); // Player 0 thắng

      expect(caroEngine.legalMoves(state, 1)).toEqual([]);
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

    it('round-trip bảo toàn với bàn cờ có quân đơn lẻ ở ô cuối cùng (index 224)', () => {
      const baseState = caroEngine.init({ playerCount: 2 });
      const board = [...baseState.board];
      board[224] = 0; // X tại ô cuối cùng

      const singleEndState: CaroState = {
        ...baseState,
        board,
        currentPlayer: 1,
        moveCount: 1,
        lastMove: 224,
      };

      const serialized = caroEngine.serialize(singleEndState);
      expect(serialized.endsWith(':224.x')).toBe(true);

      const deserialized = caroEngine.deserialize(serialized);
      expect(deserialized).toEqual(singleEndState);
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
      // RLE rỗng
      expect(() => caroEngine.deserialize('v1:15:5:1:1:0:0:-1:')).toThrowError(EngineError);

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
