/**
 * ==============================================================================
 * CARO AI WORKER CORE LOGIC (HÀM THUẦN TÚY)
 * ==============================================================================
 *
 * Tách biệt phần thân xử lý của Web Worker ra một hàm thuần túy để:
 * 1. Cho phép Unit Test trực tiếp trong môi trường Node.js mà không cần Worker thật.
 * 2. Giữ file `ai.worker.ts` chỉ còn vài dòng keo Comlink mỏng.
 *
 * ⚠️ QUY ƯỚC TRUYỀN DỮ LIỆU QUA WORKER:
 * Truyền trạng thái trận đấu dưới dạng chuỗi `caroEngine.serialize(state)`
 * (KHÔNG truyền object `CaroState` thô):
 * - Tận dụng bộ kiểm tra tính toàn vẹn (validate) trong `deserialize(serializedState)`.
 * - Tránh các vấn đề liên quan đến structured-clone của object/prototype qua ranh giới thread.
 * - Đây chính là định dạng payload thống nhất sẽ dùng với Edge Function trọng tài ở P3.2.
 *
 * ⚠️ TÍNH CHẤT STATELESS:
 * Worker hoàn toàn không lưu giữ state giữa 2 lần gọi. Mỗi lượt tính toán đều nhận
 * đầy đủ chuỗi state mới nhất để loại bỏ hoàn toàn các lỗi bất đồng bộ (Desync).
 */

import {
  caroEngine,
  findBestMove,
  type CaroState,
  type AiConfig,
} from '../../../packages/engines/caro';
import type { AiWorkerResponse } from './types';

/**
 * Xử lý yêu cầu tính toán nước đi AI từ chuỗi serialized state.
 *
 * @param serializedState Chuỗi JSON trạng thái ván cờ.
 * @param config Cấu hình cấp độ, seed, time budget.
 * @returns Phản hồi có cấu trúc `AiWorkerResponse`.
 */
export function executeWorkerComputeMove(
  serializedState: string,
  config: AiConfig,
): AiWorkerResponse {
  let state: CaroState;

  // 1. Khôi phục và kiểm chứng tính hợp lệ của trạng thái trận đấu
  try {
    state = caroEngine.deserialize(serializedState);
  } catch (deserError) {
    return {
      ok: false,
      code: 'DESERIALIZATION_ERROR',
      message:
        deserError instanceof Error
          ? deserError.message
          : 'Failed to deserialize game state in worker',
    };
  }

  // 2. Gọi thuật toán tìm kiếm nước đi tối ưu (Minimax + Alpha-Beta)
  try {
    const result = findBestMove(state, config);
    return {
      ok: true,
      result,
    };
  } catch (computeError) {
    return {
      ok: false,
      code: 'COMPUTATION_ERROR',
      message:
        computeError instanceof Error
          ? computeError.message
          : 'Unexpected error during move computation in worker',
    };
  }
}
