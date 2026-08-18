// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCaroAi } from './useCaroAi';
import { caroEngine } from '../../../packages/engines/caro';
import { executeWorkerComputeMove } from './ai-worker-core';
import * as Comlink from 'comlink';

let mockComputeMove = vi.fn();

vi.mock('comlink', () => ({
  wrap: vi.fn(() => ({
    computeMove: (...args: unknown[]) => mockComputeMove(...args),
  })),
  expose: vi.fn(),
}));

// Mock Worker class toàn cục trong môi trường JSDOM
class MockWorker {
  terminate = vi.fn();
  postMessage = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

describe('useCaroAi React Hook (useCaroAi.ts - P1.2c)', () => {
  let originalWorker: typeof globalThis.Worker;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWorker = globalThis.Worker;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Worker = MockWorker as any;
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.Worker = MockWorker as any;
    }

    mockComputeMove = vi.fn(async (serializedState, config) => {
      return executeWorkerComputeMove(serializedState, config);
    });
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    if (typeof window !== 'undefined') {
      window.Worker = originalWorker;
    }
  });

  it('khởi tạo Worker theo cơ chế LAZY (không tạo Worker khi hook mount)', () => {
    const { result } = renderHook(() => useCaroAi());

    expect(result.current.isThinking).toBe(false);
    expect(Comlink.wrap).not.toHaveBeenCalled();
  });

  it('tính toán và trả về nước đi hợp lệ khi gọi requestMove', async () => {
    const { result } = renderHook(() => useCaroAi({ minDelayMs: 20 }));
    const state = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });

    let movePromise: Promise<number>;
    act(() => {
      movePromise = result.current.requestMove(state, { level: 'medium', seed: 'test-seed' });
    });

    expect(result.current.isThinking).toBe(true);

    let move: number | undefined;
    await act(async () => {
      move = await movePromise;
    });

    expect(move).toBe(112); // Ô trung tâm (7,7)
    expect(result.current.isThinking).toBe(false);
  });

  it('đảm bảo UX Min-Delay (trì hoãn đủ thời gian minDelayMs trước khi resolve)', async () => {
    const minDelay = 100;
    const { result } = renderHook(() => useCaroAi({ minDelayMs: minDelay }));
    const state = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });

    const startTime = Date.now();
    let movePromise: Promise<number>;

    act(() => {
      movePromise = result.current.requestMove(state, { level: 'easy', seed: 'delay-seed' });
    });

    await act(async () => {
      await movePromise;
    });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(minDelay - 20); // Sai số cho phép của timer
  });

  it('chống Race Condition: yêu cầu mới sẽ hủy bỏ (discard) kết quả của yêu cầu cũ', async () => {
    const { result } = renderHook(() => useCaroAi({ minDelayMs: 100 }));
    const state1 = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });
    const state2 = caroEngine.applyMove(state1, 112, 0);

    let promise1: Promise<number>;
    let promise2: Promise<number>;

    act(() => {
      promise1 = result.current.requestMove(state1, { level: 'hard', seed: 'race-1' });
    });

    // Ngay lập tức gửi request thứ 2 trước khi request 1 xong (mô phỏng người chơi undo/restart)
    act(() => {
      promise2 = result.current.requestMove(state2, { level: 'hard', seed: 'race-2' });
    });

    let err1: unknown;
    let res2: number | null = null;

    await act(async () => {
      try {
        await promise1;
      } catch (e) {
        err1 = e;
      }
      res2 = await promise2;
    });

    expect(err1).toBeDefined();
    expect((err1 as Error).message).toBe('CARO_AI_REQUEST_CANCELLED');
    expect(res2).toBeTypeOf('number');
    expect(result.current.isThinking).toBe(false);
  });

  it('cancel() hủy bỏ lượt tính toán đang chạy và terminate Worker', async () => {
    const { result } = renderHook(() => useCaroAi({ minDelayMs: 200 }));
    const state = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });

    let movePromise: Promise<number>;
    act(() => {
      movePromise = result.current.requestMove(state, { level: 'hard', seed: 'cancel-seed' });
    });

    expect(result.current.isThinking).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.isThinking).toBe(false);

    let err: unknown;
    await act(async () => {
      try {
        await movePromise;
      } catch (e) {
        err = e;
      }
    });

    expect((err as Error).message).toBe('CARO_AI_REQUEST_CANCELLED');
  });

  it('xử lý lỗi khi Worker trả về { ok: false }', async () => {
    mockComputeMove.mockResolvedValueOnce({
      ok: false,
      code: 'COMPUTATION_ERROR',
      message: 'Simulated worker internal failure',
    });

    const { result } = renderHook(() => useCaroAi({ minDelayMs: 10 }));
    const state = caroEngine.init({ playerCount: 2, options: { boardSize: 15 } });

    let err: unknown;
    await act(async () => {
      try {
        await result.current.requestMove(state, { level: 'hard' });
      } catch (e) {
        err = e;
      }
    });

    expect(err).toBeDefined();
    expect((err as Error).message).toContain('COMPUTATION_ERROR');
    expect(result.current.isThinking).toBe(false);
  });
});
