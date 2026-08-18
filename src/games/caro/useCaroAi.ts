/**
 * ==============================================================================
 * USE CARO AI REACT HOOK (QUẢN LÝ VÒNG ĐỜI WEB WORKER AI)
 * ==============================================================================
 *
 * Hook React chịu trách nhiệm:
 * 1. Khởi tạo Web Worker dạng LAZY (chỉ tạo khi có yêu cầu tính toán đầu tiên).
 * 2. Giao tiếp an toàn qua Comlink RPC.
 * 3. Chống Race Condition: Sử dụng requestId tăng dần để loại bỏ các kết quả cũ
 *    khi người chơi bấm Undo hoặc Restart trong lúc máy đang suy nghĩ.
 * 4. UX Min-Delay (500ms): Đảm bảo nước đi có độ trễ tự nhiên, tránh cảm giác
 *    "máy đánh giật cục không suy nghĩ" khi gặp nước đi quá nhanh.
 * 5. Cleanup an toàn: Terminate worker khi unmount, an toàn tuyệt đối với
 *    cơ chế double-mount của React 18 StrictMode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import * as Comlink from 'comlink';
import {
  caroEngine,
  type CaroState,
  type CaroMove,
  type AiConfig,
} from '../../../packages/engines/caro';
import type { CaroAiWorkerApi } from './types';

/**
 * Tùy chọn cấu hình cho hook `useCaroAi`.
 */
export interface UseCaroAiOptions {
  /**
   * Thời gian trì hoãn tối thiểu (mili-giây) trước khi trả về nước đi.
   * Mặc định là 500ms.
   */
  readonly minDelayMs?: number;
  /**
   * Factory khởi tạo Worker tùy biến (chủ yếu phục vụ Unit Test).
   */
  readonly workerFactory?: () => Worker;
}

/**
 * Kết quả trả về từ hook `useCaroAi`.
 */
export interface UseCaroAiReturn {
  /**
   * Gửi yêu cầu tính toán nước đi tốt nhất tới Web Worker.
   *
   * @param state Trạng thái trận đấu hiện tại.
   * @param config Cấu hình cấp độ, seed, timeBudget.
   * @returns Promise trả về flat index nước đi (0..size*size-1).
   */
  requestMove(state: CaroState, config: AiConfig): Promise<CaroMove>;
  /** Trạng thái máy đang suy nghĩ (true khi Worker đang tính toán) */
  isThinking: boolean;
  /** Hủy bỏ lượt tính toán hiện tại và đưa trạng thái về bình thường */
  cancel(): void;
}

/**
 * Hook quản lý vòng đời và giao tiếp với Web Worker AI Cờ Caro.
 */
export function useCaroAi(options: UseCaroAiOptions = {}): UseCaroAiReturn {
  const { minDelayMs = 500, workerFactory } = options;

  const [isThinking, setIsThinking] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<CaroAiWorkerApi> | null>(null);
  const requestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  /**
   * Khởi tạo Web Worker theo cơ chế Lazy (khi cần mới tạo).
   */
  const getOrCreateWorkerApi = useCallback((): Comlink.Remote<CaroAiWorkerApi> => {
    if (apiRef.current && workerRef.current) {
      return apiRef.current;
    }

    const worker = workerFactory
      ? workerFactory()
      : new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });

    const api = Comlink.wrap<CaroAiWorkerApi>(worker);
    workerRef.current = worker;
    apiRef.current = api;

    return api;
  }, [workerFactory]);

  /**
   * Hủy bỏ lượt tính toán hiện tại, terminate Worker và khởi tạo lại ở lần gọi sau.
   */
  const cancel = useCallback(() => {
    // 1. Tăng requestId để vô hiệu hóa mọi callback của request đang chạy
    requestIdRef.current++;

    // 2. Terminate Worker hiện tại để ngắt tính toán ngay lập tức
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      apiRef.current = null;
    }

    if (isMountedRef.current) {
      setIsThinking(false);
    }
  }, []);

  /**
   * Dọn dẹp Worker khi component bị unmount.
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Dọn dẹp tài nguyên Worker để tránh rò rỉ bộ nhớ
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        apiRef.current = null;
      }
    };
  }, []);

  /**
   * Gửi yêu cầu tính toán nước đi tới Web Worker.
   */
  const requestMove = useCallback(
    async (state: CaroState, config: AiConfig): Promise<CaroMove> => {
      // 1. Tăng requestId cho lượt tính toán mới (Chống Race Condition)
      const currentRequestId = ++requestIdRef.current;
      setIsThinking(true);

      const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

      try {
        // 2. Chuẩn bị dữ liệu: serialize state thành chuỗi JSON
        const serializedState = caroEngine.serialize(state);

        // 3. Lấy hoặc tạo mới kết nối Worker qua Comlink
        const api = getOrCreateWorkerApi();

        // 4. Gửi yêu cầu tính toán sang Worker luồng riêng
        const response = await api.computeMove(serializedState, config);

        // 5. KIỂM TRA CHỐNG RACE CONDITION:
        // Nếu requestId đã thay đổi (người chơi đã undo, restart hoặc cancel trong lúc AI đang nghĩ)
        // -> Hủy bỏ kết quả cũ, không giải quyết (reject một lỗi bị hủy hoặc không cập nhật).
        if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
          throw new Error('CARO_AI_REQUEST_CANCELLED');
        }

        // 6. Xử lý lỗi có cấu trúc từ Worker
        if (!response.ok) {
          throw new Error(`[${response.code}] ${response.message}`);
        }

        // 7. UX MIN-DELAY:
        // Nếu AI tính toán quá nhanh (ví dụ: nước mở đầu hoặc thắng ngay chỉ mất 1-2ms),
        // tạo độ trễ bổ sung để đủ `minDelayMs` (mặc định 500ms) giúp trải nghiệm tự nhiên.
        const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsed = endTime - startTime;
        const remainingDelay = Math.max(0, minDelayMs - elapsed);

        if (remainingDelay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, remainingDelay));
        }

        // Kiểm tra lại requestId sau khi delay
        if (currentRequestId !== requestIdRef.current || !isMountedRef.current) {
          throw new Error('CARO_AI_REQUEST_CANCELLED');
        }

        return response.result.move;
      } catch (error) {
        // Nếu Worker bị crash hoặc gặp lỗi nghiêm trọng, tái khởi động lại Worker cho lần sau
        if (
          error instanceof Error &&
          error.message !== 'CARO_AI_REQUEST_CANCELLED' &&
          workerRef.current
        ) {
          workerRef.current.terminate();
          workerRef.current = null;
          apiRef.current = null;
        }

        throw error;
      } finally {
        if (currentRequestId === requestIdRef.current && isMountedRef.current) {
          setIsThinking(false);
        }
      }
    },
    [getOrCreateWorkerApi, minDelayMs],
  );

  return {
    requestMove,
    isThinking,
    cancel,
  };
}
