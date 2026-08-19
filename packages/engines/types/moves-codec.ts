/**
 * ==============================================================================
 * MOVES CODEC INTERFACE (HỢP ĐỒNG NÉN VÀ GIẢI MÃ NƯỚC ĐI CỜ)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Module này là TypeScript thuần túy (Pure TS, Zero DOM, Zero Framework).
 * - Được sử dụng để chuẩn hóa cách thức nén danh sách nước đi thành chuỗi
 *   lưu trữ trong cột `matches.moves` (DB) và giải mã để phục vụ tính năng Replay (P8.1).
 * ==============================================================================
 */

export interface MovesCodec<M> {
  /**
   * Mã hóa mảng danh sách nước đi tuần tự thành chuỗi nén văn bản.
   * @param moves Mảng nước đi của ván cờ theo thứ tự thời gian.
   * @returns Chuỗi nén biểu diễn toàn bộ ván đấu (ván 0 nước đi trả về chuỗi rỗng '').
   */
  encodeMoves(moves: readonly M[]): string;

  /**
   * Giải mã chuỗi nén văn bản thành danh sách nước đi tuần tự.
   * @param data Chuỗi nén cần giải mã.
   * @returns Mảng danh sách nước đi tuần tự (chuỗi rỗng trả về mảng rỗng []).
   * @throws EngineError('INVALID_STATE') nếu chuỗi chứa định dạng không hợp lệ.
   */
  decodeMoves(data: string): M[];
}
