import { describe, it, expect } from 'vitest';
import { dummyEngine } from './engine';
import { EngineError } from '../types';

describe('Dummy Engine Unit Tests (Official Interface Contract)', () => {
  it('1. init: Phải khởi tạo đúng trạng thái ban đầu', () => {
    const state = dummyEngine.init({ playerCount: 2, options: { maxTurns: 6 } });
    expect(state.turn).toBe(1);
    expect(state.maxTurns).toBe(6);
    expect(state.currentPlayer).toBe(0);
    expect(state.scores).toEqual([0, 0]);
    expect(state.moveHistory).toHaveLength(0);
  });

  it('2. legalMoves: Sinh đúng các nước đi hợp lệ cho người chơi đang tới lượt', () => {
    const state = dummyEngine.init({ playerCount: 2 });
    const movesP0 = dummyEngine.legalMoves(state, 0);
    expect(movesP0).toEqual([
      { playerIndex: 0, points: 3 },
      { playerIndex: 0, points: 5 },
    ]);

    const movesP1 = dummyEngine.legalMoves(state, 1);
    expect(movesP1).toHaveLength(0);
  });

  it('3. applyMove: Phải là hàm thuần và Immutable (state cũ không bị thay đổi)', () => {
    const state1 = dummyEngine.init({ playerCount: 2, options: { maxTurns: 6 } });
    const state2 = dummyEngine.applyMove(state1, { playerIndex: 0, points: 3 }, 0);

    // State cũ giữ nguyên vẹn
    expect(state1.turn).toBe(1);
    expect(state1.currentPlayer).toBe(0);
    expect(state1.scores).toEqual([0, 0]);
    expect(state1.moveHistory).toHaveLength(0);

    // State mới cập nhật chính xác
    expect(state2.turn).toBe(2);
    expect(state2.currentPlayer).toBe(1);
    expect(state2.scores).toEqual([3, 0]);
    expect(state2.moveHistory).toHaveLength(1);
  });

  it("4. Error Handling: Ném lỗi EngineError với mã 'WRONG_TURN' khi đi sai lượt", () => {
    const state = dummyEngine.init({ playerCount: 2 });
    expect(() => {
      dummyEngine.applyMove(state, { playerIndex: 1, points: 3 }, 1);
    }).toThrowError(EngineError);

    try {
      dummyEngine.applyMove(state, { playerIndex: 1, points: 3 }, 1);
    } catch (err) {
      expect(err instanceof EngineError).toBe(true);
      expect((err as EngineError).code).toBe('WRONG_TURN');
    }
  });

  it("5. Error Handling: Ném lỗi EngineError với mã 'ILLEGAL_MOVE' khi nước đi phạm luật", () => {
    const state = dummyEngine.init({ playerCount: 2 });
    try {
      dummyEngine.applyMove(state, { playerIndex: 0, points: 4 }, 0);
    } catch (err) {
      expect(err instanceof EngineError).toBe(true);
      expect((err as EngineError).code).toBe('ILLEGAL_MOVE');
    }
  });

  it('6. isTerminal & GAME_OVER: Nhận diện kết thúc trận và chặn nước đi sau khi kết thúc', () => {
    let state = dummyEngine.init({ playerCount: 2, options: { maxTurns: 2 } });
    expect(dummyEngine.isTerminal(state).over).toBe(false);

    // Lượt 1: Player 0 đánh 5 điểm
    state = dummyEngine.applyMove(state, { playerIndex: 0, points: 5 }, 0);
    expect(dummyEngine.isTerminal(state).over).toBe(false);

    // Lượt 2: Player 1 đánh 3 điểm
    state = dummyEngine.applyMove(state, { playerIndex: 1, points: 3 }, 1);

    // Sau 2 lượt: Ván kết thúc
    const terminal = dummyEngine.isTerminal(state);
    expect(terminal.over).toBe(true);
    expect(terminal.outcomes).toBeDefined();
    expect(terminal.outcomes).toEqual([
      { playerIndex: 0, outcome: 'win', score: 5 },
      { playerIndex: 1, outcome: 'loss', score: 3 },
    ]);

    // Thử đi tiếp -> Báo lỗi GAME_OVER
    try {
      dummyEngine.applyMove(state, { playerIndex: 0, points: 3 }, 0);
    } catch (err) {
      expect(err instanceof EngineError).toBe(true);
      expect((err as EngineError).code).toBe('GAME_OVER');
    }
  });

  it('7. serialize & deserialize: Phải bảo toàn dữ liệu Round-trip 100%', () => {
    let state = dummyEngine.init({ playerCount: 2 });
    state = dummyEngine.applyMove(state, { playerIndex: 0, points: 5 }, 0);

    const serialized = dummyEngine.serialize(state);
    expect(typeof serialized).toBe('string');

    const deserialized = dummyEngine.deserialize(serialized);
    expect(deserialized).toEqual(state);

    // Round-trip 2 chiều
    const reSerialized = dummyEngine.serialize(deserialized);
    expect(reSerialized).toBe(serialized);
  });

  it("8. Error Handling: deserialize ném lỗi 'INVALID_STATE' khi chuỗi data bị hỏng", () => {
    try {
      dummyEngine.deserialize('invalid-json-data-###');
    } catch (err) {
      expect(err instanceof EngineError).toBe(true);
      expect((err as EngineError).code).toBe('INVALID_STATE');
    }
  });
});
