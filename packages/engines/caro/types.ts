import type { PlayerIndex } from '../types/index.ts';

/**
 * ==============================================================================
 * CARO GAME TYPES DEFINITION (KHAI BÁO KIỂU DỮ LIỆU CỜ CARO)
 * ==============================================================================
 */

/**
 * Các tùy chọn cấu hình của bàn cờ Caro.
 */
export interface CaroOptions {
  /**
   * Kích thước cạnh bàn cờ vuông (mặc định là 15, tương ứng bàn 15x15 = 225 ô).
   * Giới hạn hợp lệ: từ 5 đến 25.
   */
  readonly boardSize: number;

  /**
   * Số lượng quân cờ liên tiếp trên cùng một hàng/cột/đường chéo để giành chiến thắng (mặc định là 5).
   * Giới hạn hợp lệ: từ 3 đến boardSize.
   */
  readonly winLength: number;

  /**
   * Luật chặn 2 đầu (luật truyền thống Việt Nam):
   * - `true`: Dãy 5 quân liên tiếp nếu bị quân đối phương (hoặc mép bàn cờ) chặn CẢ 2 đầu thì KHÔNG tính là thắng.
   * - `false`: Đủ 5 quân liên tiếp là thắng ngay, không quan tâm có bị chặn 2 đầu hay không (luật quốc tế Gomoku tự do / Freestyle).
   * Mặc định là `true`.
   */
  readonly blockedTwoEndsRule: boolean;

  /**
   * Luật hàng dài (Overline rule):
   * - `true`: Tạo thành dãy từ 6 quân liên tiếp trở lên vẫn tính là thắng (luật tự do).
   * - `false`: Chỉ đúng 5 quân liên tiếp mới tính thắng, 6+ quân không tính thắng (hoặc phạm quy tùy biến thể Renju).
   * Mặc định là `true`.
   */
  readonly allowOverline: boolean;
}

/**
 * Cấu hình tùy chọn mặc định của cờ Caro (Bàn 15x15, ăn 5, luật chặn 2 đầu VN, cho phép hàng 6+).
 */
export const DEFAULT_CARO_OPTIONS: Readonly<CaroOptions> = {
  boardSize: 15,
  winLength: 5,
  blockedTwoEndsRule: true,
  allowOverline: true,
};

/**
 * Trạng thái bàn cờ Caro (Immutable & JSON-serializable).
 */
export interface CaroState {
  /**
   * Mảng 1 chiều biểu diễn bàn cờ vuông phẳng độ dài `boardSize * boardSize`.
   * Giá trị từng ô:
   * - `-1`: Ô trống.
   * - `0`: Quân của người chơi Seat 0 (Quân X, đi trước).
   * - `1`: Quân của người chơi Seat 1 (Quân O, đi sau).
   *
   * Lý do thiết kế:
   * - Mảng 1 chiều thay vì 2 chiều giúp serialize cực kỳ ngắn gọn, giảm footprint bộ nhớ và tăng tốc độ duyệt cache CPU.
   * - Truy cập tọa độ `(x, y)` thông qua index phẳng: `index = y * boardSize + x`.
   */
  readonly board: readonly number[];

  /**
   * Ghế của người chơi đang đến lượt (0: Seat 0 / X, 1: Seat 1 / O).
   */
  readonly currentPlayer: PlayerIndex;

  /**
   * Tổng số nước đi hợp lệ đã thực hiện từ đầu ván đấu.
   */
  readonly moveCount: number;

  /**
   * Chỉ số phẳng (flat index 0..size*size-1) của nước đi gần nhất vừa được thực hiện.
   * Là `null` khi bắt đầu ván mới chưa có nước đi nào.
   *
   * Công dụng:
   * - P1.1c: Dùng để tối ưu thuật toán kiểm tra thắng thua cục bộ xung quanh `lastMove` thay vì quét cả bàn cờ.
   * - P1.3 (View): Dùng để render hiệu ứng highlight đánh dấu nước đi vừa đánh cho người chơi dễ quan sát.
   */
  readonly lastMove: number | null;

  /**
   * Các tùy chọn cấu hình của bàn cờ (Bất biến sau khi khởi tạo).
   */
  readonly options: CaroOptions;

  // LƯU Ý KIẾN TRÚC: CHƯA thêm trường kết quả (winner/outcomes) vào CaroState.
  // Hàm `isTerminal(state)` tại Phase P1.1c sẽ tính toán trực tiếp từ `board` mà không lưu cache,
  // nhằm giữ State tối giản nhất có thể, ưu tiên tính đúng đắn trước, tối ưu sau nếu cần.
}

/**
 * Kiểu dữ liệu biểu diễn một nước đi trong cờ Caro.
 * Là một số nguyên index phẳng (0 .. boardSize*boardSize - 1) biểu thị vị trí ô cờ được đánh.
 *
 * Lý do thiết kế:
 * - Dùng `number` thay vì object `{ x, y }` để serialize nước đi siêu gọn nhẹ (chỉ tốn 1-3 byte),
 *   tối ưu hóa băng thông truyền nhận cho Supabase Realtime và Server Edge Function ở Phase P3.2.
 */
export type CaroMove = number;
