/**
 * ==============================================================================
 * CARO GAME WORKER & PLUGIN TYPES
 * ==============================================================================
 *
 * Định nghĩa các kiểu dữ liệu cho giao thức giao tiếp Web Worker AI Cờ Caro.
 */

import type { AiConfig, AiResult } from '../../../packages/engines/caro';

/**
 * Phản hồi có cấu trúc từ Web Worker.
 */
export type AiWorkerResponse =
  | {
      readonly ok: true;
      readonly result: AiResult;
    }
  | {
      readonly ok: false;
      readonly code: 'DESERIALIZATION_ERROR' | 'COMPUTATION_ERROR' | 'UNKNOWN_ERROR';
      readonly message: string;
    };

/**
 * Giao diện RPC được expose qua Comlink từ Worker.
 */
export interface CaroAiWorkerApi {
  /**
   * Tính toán nước đi tốt nhất từ chuỗi trạng thái serialize.
   *
   * @param serializedState Chuỗi trạng thái bàn cờ đã serialize từ caroEngine.serialize().
   * @param config Cấu hình độ khó và hạt giống.
   */
  computeMove(serializedState: string, config: AiConfig): Promise<AiWorkerResponse>;
}
