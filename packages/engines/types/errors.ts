/**
 * ==============================================================================
 * CÁC MÃ LỖI VÀ CLASS ENGINE ERROR CHUẨN HÓA CHO GAME ENGINE
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Khi `applyMove` gặp nước đi không hợp lệ hoặc sai lượt, Engine sẽ throw `EngineError`.
 * - Supabase Edge Function (trọng tài server) sẽ bắt `EngineError` để từ chối nước đi (HTTP 400).
 * - Client UI sẽ bắt `EngineError` để hiển thị hiệu ứng rung cờ / cảnh báo nước đi không hợp lệ.
 * ==============================================================================
 */

/**
 * Các mã lỗi chuẩn hóa phát sinh từ logic Game Engine:
 * - 'ILLEGAL_MOVE': Nước đi sai luật cờ (ví dụ: Mã đi thẳng, Tượng qua sông trong cờ tướng).
 * - 'INVALID_STATE': Trạng thái bàn cờ bị hỏng hoặc không thể giải mã (deserialization error).
 * - 'WRONG_TURN': Người chơi thực hiện nước đi khi chưa tới lượt của mình.
 * - 'GAME_OVER': Cố gắng thực hiện nước đi khi ván cờ đã kết thúc.
 */
export type EngineErrorCode = 'ILLEGAL_MOVE' | 'INVALID_STATE' | 'WRONG_TURN' | 'GAME_OVER';

/**
 * Class lỗi chuẩn mực phát sinh từ mọi Game Engine trong `packages/engines`.
 */
export class EngineError extends Error {
  /** Mã định danh lỗi chuẩn */
  public readonly code: EngineErrorCode;
  /** Dữ liệu bổ sung đi kèm lỗi (tùy chọn) */
  public readonly details?: unknown;

  constructor(code: EngineErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.details = details;

    // Giữ nguyên prototype chain khi kế thừa class Error tích hợp sẵn
    Object.setPrototypeOf(this, EngineError.prototype);
  }
}
