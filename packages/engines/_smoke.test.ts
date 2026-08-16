import { describe, expect, it } from 'vitest';
import { applySmokeScore, createInitialSmokeState } from './_smoke';

describe('packages/engines/_smoke', () => {
  it('khởi tạo state mặc định với score = 0 và multiplier = 1', () => {
    const initialState = createInitialSmokeState();
    expect(initialState).toEqual({
      score: 0,
      multiplier: 1,
    });
  });

  it('cộng điểm chính xác khi multiplier = 1', () => {
    const state = createInitialSmokeState();
    const nextState = applySmokeScore(state, 10);

    expect(nextState.score).toBe(10);
    expect(nextState.multiplier).toBe(1);
  });

  it('nhân hệ số multiplier khi tính điểm', () => {
    const customState = { score: 10, multiplier: 3 };
    const nextState = applySmokeScore(customState, 5);

    expect(nextState.score).toBe(25); // 10 + (5 * 3)
    expect(nextState.multiplier).toBe(3);
  });

  it('đảm bảo tính bất biến (immutability) không làm thay đổi state gốc', () => {
    const originalState = Object.freeze(createInitialSmokeState());
    const nextState = applySmokeScore(originalState, 20);

    expect(originalState.score).toBe(0);
    expect(nextState.score).toBe(20);
    expect(nextState).not.toBe(originalState);
  });

  it('xử lý đúng khi cộng 0 điểm hoặc điểm âm', () => {
    const state = { score: 50, multiplier: 2 };
    const stateZero = applySmokeScore(state, 0);
    const stateNegative = applySmokeScore(state, -10);

    expect(stateZero.score).toBe(50);
    expect(stateNegative.score).toBe(30); // 50 + (-10 * 2)
  });
});
