import { describe, it, expect } from 'vitest';
import { executeWorkerComputeMove } from './ai-worker-core';
import { caroEngine } from '../../../packages/engines/caro';

describe('Caro AI Worker Core Logic (ai-worker-core.ts - P1.2c)', () => {
  it('xử lý chuỗi serialized hợp lệ và trả về phản hồi thành công { ok: true, result }', () => {
    const state = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });
    const serialized = caroEngine.serialize(state);

    const response = executeWorkerComputeMove(serialized, {
      level: 'medium',
      seed: 'core-test-seed',
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.move).toBe(112); // Ô trung tâm (7,7)
      expect(response.result.depth).toBe(0);
      expect(response.result.nodes).toBe(1);
    }
  });

  it('xử lý chuỗi serialized hỏng/không hợp lệ và trả về mã lỗi DESERIALIZATION_ERROR', () => {
    const invalidSerialized = '{"invalid": "json format structure"}';

    const response = executeWorkerComputeMove(invalidSerialized, {
      level: 'hard',
      seed: 'invalid-test-seed',
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe('DESERIALIZATION_ERROR');
      expect(response.message).toBeDefined();
    }
  });

  it('xử lý tính toán cho bàn cờ đang chơi và trả về nước đi hợp lệ', () => {
    let state = caroEngine.init({ playerCount: 2, options: { boardSize: 9, winLength: 5 } });
    state = caroEngine.applyMove(state, 40, 0); // X đánh ô 40
    const serialized = caroEngine.serialize(state);

    const response = executeWorkerComputeMove(serialized, {
      level: 'hard',
      seed: 'mid-test-seed',
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result.move).toBeGreaterThanOrEqual(0);
      expect(response.result.move).toBeLessThan(81);
      expect(response.result.move).not.toBe(40);
    }
  });
});
