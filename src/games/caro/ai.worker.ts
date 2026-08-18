/**
 * ==============================================================================
 * CARO AI DEDICATED WEB WORKER (COMLINK GLUE)
 * ==============================================================================
 *
 * File entry cho Web Worker chạy trên luồng riêng biệt (Background Thread).
 * Khởi tạo qua Vite bằng: `new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })`
 */

import * as Comlink from 'comlink';
import { executeWorkerComputeMove } from './ai-worker-core';
import type { CaroAiWorkerApi } from './types';

const workerApi: CaroAiWorkerApi = {
  computeMove: async (serializedState, config) => {
    return executeWorkerComputeMove(serializedState, config);
  },
};

Comlink.expose(workerApi);
