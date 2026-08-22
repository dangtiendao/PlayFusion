/**
 * ==============================================================================
 * CARO GAME WORKER, PLUGIN & UI STATE MACHINE TYPES
 * ==============================================================================
 *
 * Định nghĩa các kiểu dữ liệu cho giao thức giao tiếp Web Worker AI và State Machine giao diện Cờ Caro.
 */

import type { AiConfig, AiResult } from '../../../packages/engines/caro';
import type { AiLevel, PlayerIndex } from '@engines/types';

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

/**
 * Cấu hình tham số khởi tạo trận đấu Caro.
 */
export interface CaroMatchConfig {
  /** Chế độ chơi: Đấu máy ('vs_ai'), 2 người trên cùng máy ('local_pvp'), hoặc Đấu trực tuyến ('online_1v1') */
  readonly mode: 'vs_ai' | 'local_pvp' | 'online_1v1';
  /** Cấp độ khó của AI (bắt buộc khi mode = 'vs_ai') */
  readonly aiLevel?: AiLevel;
  /**
   * Vị trí ghế người chơi (chỉ áp dụng khi mode = 'vs_ai'):
   * - 0: Người chơi cầm quân X (đi trước, mặc định).
   * - 1: Người chơi cầm quân O (đi sau, máy đi trước).
   */
  readonly humanSeat?: PlayerIndex;
}

/**
 * Dữ liệu phụ đi kèm phiên đấu được lưu trong SavedMatch (P1.5b).
 */
export interface CaroSavedSessionExtra {
  /** Tỷ số phiên đấu hiện tại */
  readonly sessionScore?: {
    readonly player1Wins: number;
    readonly player2Wins: number;
    readonly draws: number;
    readonly matchNumber: number;
  };
  /** Seed ngẫu nhiên của ván đấu hiện tại */
  readonly matchSeed?: string;
}

/**
 * Trạng thái màn hình trong State Machine của Caro Game:
 * - 'setup': Màn hình cấu hình và lựa chọn chế độ chơi (`ModeSelect.tsx`).
 * - 'playing': Màn hình bàn cờ đang diễn ra trận đấu (`InteractiveBoard.tsx`).
 * - 'finished': Màn hình kết thúc trận đấu và điều hướng tiếp theo.
 * - 'online_lobby': Màn hình sảnh phòng đấu (Tạo phòng / Nhập mã 6 ký tự - P3.3b).
 * - 'online_waiting': Màn hình chờ đối thủ tham gia phòng (Mã phòng, Share link, Presence - P3.3b).
 */
export type CaroScreen = 'setup' | 'playing' | 'finished' | 'online_lobby' | 'online_waiting';
