import { describe, expect, it } from 'vitest';
import {
  applyDummyMove,
  createDummyInitialState,
  getDummyWinner,
  isDummyTerminal,
  type DummyMove,
} from './engine';

describe('packages/engines/dummy/engine (Node Environment Test)', () => {
  it('1. Khởi tạo state ban đầu chuẩn xác', () => {
    const state = createDummyInitialState(4);

    expect(state.turn).toBe(1);
    expect(state.maxTurns).toBe(4);
    expect(state.currentPlayer).toBe('player1');
    expect(state.scores).toEqual({ player1: 0, player2: 0 });
    expect(state.isTerminal).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.moveHistory).toHaveLength(0);
  });

  it('2. Luân phiên lượt người chơi và tích lũy điểm chính xác', () => {
    const s0 = createDummyInitialState(4);

    const move1: DummyMove = { player: 'player1', points: 5 };
    const s1 = applyDummyMove(s0, move1);

    expect(s1.turn).toBe(2);
    expect(s1.currentPlayer).toBe('player2');
    expect(s1.scores.player1).toBe(5);
    expect(s1.scores.player2).toBe(0);
    expect(s1.isTerminal).toBe(false);

    const move2: DummyMove = { player: 'player2', points: 8 };
    const s2 = applyDummyMove(s1, move2);

    expect(s2.turn).toBe(3);
    expect(s2.currentPlayer).toBe('player1');
    expect(s2.scores.player1).toBe(5);
    expect(s2.scores.player2).toBe(8);
  });

  it('3. Bắt lỗi khi người chơi đánh sai lượt', () => {
    const state = createDummyInitialState(4); // player1 đi trước

    const invalidMove: DummyMove = { player: 'player2', points: 3 };
    expect(() => applyDummyMove(state, invalidMove)).toThrowError(/Không đúng lượt/);
  });

  it('4. Kết thúc ván khi chạm maxTurns và xác định đúng người thắng', () => {
    let state = createDummyInitialState(2);

    // Turn 1: Player 1 ghi 10 điểm
    state = applyDummyMove(state, { player: 'player1', points: 10 });
    expect(isDummyTerminal(state)).toBe(false);

    // Turn 2: Player 2 ghi 3 điểm -> Đạt maxTurns (2) -> Terminal
    state = applyDummyMove(state, { player: 'player2', points: 3 });

    expect(isDummyTerminal(state)).toBe(true);
    expect(getDummyWinner(state)).toBe('player1');
    expect(state.scores).toEqual({ player1: 10, player2: 3 });
  });

  it('5. Đảm bảo tính bất biến (Immutability): Không làm biến dạng state cũ', () => {
    const s0 = Object.freeze(createDummyInitialState(2));
    const s1 = applyDummyMove(s0, { player: 'player1', points: 7 });

    expect(s0.turn).toBe(1);
    expect(s0.scores.player1).toBe(0);
    expect(s1.turn).toBe(2);
    expect(s1.scores.player1).toBe(7);
    expect(s1).not.toBe(s0);
  });
});
