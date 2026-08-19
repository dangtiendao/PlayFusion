/**
 * ==============================================================================
 * CARO MOVES CODEC (MÃ HÓA & GIẢI MÃ NƯỚC ĐI CỜ CARO)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & RANH GIỚI TRÁCH NHIỆM:
 * 1. ĐỊNH DẠNG NÉN:
 *    - Danh sách nước đi được nén thành chuỗi CSV các chỉ số phẳng: "112,97,113,..."
 *    - Ván 0 nước đi trả về chuỗi rỗng: "".
 * 2. RANH GIỚI VALIDATE:
 *    - Hàm `decodeMoves(data)` chỉ xác thực tính hợp lệ của cú pháp chuỗi (mỗi phần tử
 *      bắt buộc phải là chuỗi số nguyên không âm dạng /^\d+$/).
 *    - Việc kiểm tra giới hạn kích thước bàn cờ (0 <= index < boardSize * boardSize) và
 *      tính hợp lệ của luật đi cờ thuộc về Game Engine (`applyMove`) trong quá trình Replay.
 * 3. TỐI ƯU HÓA FREE TIER:
 *    - Một ván cờ trung bình 60 nước chỉ tốn ~180-240 bytes (dưới 0.3 KB), tiết kiệm
 *      tối đa dung lượng 500MB database PostgreSQL của Supabase.
 * ==============================================================================
 */

import { EngineError, type MovesCodec } from '../types';
import type { CaroMove } from './types';

export class CaroMovesCodec implements MovesCodec<CaroMove> {
  /**
   * Mã hóa mảng nước đi cờ Caro thành chuỗi CSV phẳng.
   * @param moves Mảng nước đi phẳng (index từ 0 đến boardSize^2 - 1).
   * @returns Chuỗi CSV các số nguyên cách nhau bởi dấu phẩy.
   */
  encodeMoves(moves: readonly CaroMove[]): string {
    if (!moves || moves.length === 0) {
      return '';
    }
    return moves.join(',');
  }

  /**
   * Giải mã chuỗi CSV thành mảng nước đi cờ Caro.
   * @param data Chuỗi CSV cần giải mã.
   * @returns Mảng các chỉ số phẳng của nước đi.
   * @throws EngineError('INVALID_STATE') nếu chuỗi chứa ký tự không hợp lệ.
   */
  decodeMoves(data: string): CaroMove[] {
    if (!data || data.trim() === '') {
      return [];
    }

    const tokens = data.split(',');
    const moves: CaroMove[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const rawToken = tokens[i];
      const token = rawToken ? rawToken.trim() : '';

      // Kiểm tra chuỗi số nguyên không âm hợp lệ
      if (!/^\d+$/.test(token)) {
        throw new EngineError(
          'INVALID_STATE',
          `Chuỗi nước đi cờ Caro không hợp lệ tại vị trí ${i}: "${token}". Yêu cầu số nguyên không âm.`,
        );
      }

      const move = parseInt(token, 10);
      if (Number.isNaN(move) || move < 0 || !Number.isSafeInteger(move)) {
        throw new EngineError(
          'INVALID_STATE',
          `Giá trị nước đi cờ Caro vượt quá giới hạn an toàn tại vị trí ${i}: "${token}".`,
        );
      }

      moves.push(move);
    }

    return moves;
  }
}

/**
 * Instance mặc định dùng chung của CaroMovesCodec.
 */
export const caroMovesCodec = new CaroMovesCodec();
