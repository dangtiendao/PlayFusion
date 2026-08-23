import type { PlayerIndex, TerminalResult } from './common.ts';

/**
 * ==============================================================================
 * HỢP ĐỒNG VẬN HÀNH BẮT BUỘC CỦA MỌI GAME ENGINE (ENGINE INTERFACE)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & NGUYÊN TẮC BẤT BIẾN:
 *
 * 1. TÍNH THUẦN TÚY (PURE FUNCTIONS & DETERMINISM):
 *    - Toàn bộ các hàm trong Engine đều phải là Hàm thuần (Pure Functions).
 *    - Cùng một `state` và cùng một `move` BẮT BUỘC luôn tạo ra cùng một `state` đầu ra.
 *    - KHÔNG được sử dụng biến toàn cục, KHÔNG mutate trực tiếp `state` truyền vào (Immutable),
 *      và KHÔNG gọi `Math.random()` hoặc `Date.now()` bên trong hàm xử lý logic.
 *
 * 2. ĐA MÔI TRƯỜNG THỰC THI (CROSS-ENVIRONMENT RUNTIME):
 *    - Engine phải chạy được ở 3 nơi mà không thay đổi bất kỳ dòng code nào:
 *      a. Client React UI (trong Component View để hiển thị bàn cờ và gợi ý nước đi).
 *      b. Web Worker (trong thuật toán Bot AI để tính toán nước đi không làm đơ UI).
 *      c. Supabase Edge Functions / Deno (trong Server Arbitrator để xác thực nước đi chống gian lận).
 * ==============================================================================
 */

/**
 * Cấu hình tham số khởi tạo bàn cờ ban đầu cho hàm `engine.init(config)`.
 */
export interface EngineInitConfig {
  /** Số lượng người chơi tham gia ván đấu (mặc định là 2 đối với game đối kháng 1v1) */
  readonly playerCount: number;
  /**
   * Hạt giống số ngẫu nhiên (PRNG Seed) dành cho các game có yếu tố may rủi (đổ xúc xắc, xào bài).
   * RÀNG BUỘC KIẾN TRÚC: Server Edge Function là bên duy nhất sinh seed và cấp xuống client.
   * Client tuyệt đối không tự sinh seed ngẫu nhiên nhằm đảm bảo tính đồng bộ và chống hack.
   */
  readonly seed?: string;
  /**
   * Các tùy chọn mở rộng của bàn cờ (ví dụ: kích thước bàn 15x15 hay 19x19, luật chặn 2 đầu trong Caro, v.v.).
   */
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Interface chuẩn hóa toàn bộ Game Engine trong hệ thống PlayFusion.
 *
 * @template S Kiểu dữ liệu trạng thái bàn cờ (Game State), phải là cấu trúc dữ liệu thuần (POJO/Immutable).
 * @template M Kiểu dữ liệu một nước đi (Game Move).
 */
export interface Engine<S, M> {
  /**
   * Khởi tạo trạng thái bàn cờ ban đầu (Initial State).
   *
   * @param config Cấu hình khởi tạo bao gồm số người chơi, seed ngẫu nhiên và options.
   * @returns Trạng thái bàn cờ ban đầu (State S).
   */
  init(config: EngineInitConfig): S;

  /**
   * Liệt kê danh sách tất cả các nước đi hợp lệ của một người chơi tại trạng thái hiện tại.
   * Thường được Client UI dùng để highlight các ô cờ có thể đi, và Bot AI dùng để duyệt cây trò chơi.
   *
   * @param state Trạng thái bàn cờ hiện tại.
   * @param playerIndex Vị trí ghế của người chơi cần lấy danh sách nước đi (0-based).
   * @returns Mảng danh sách các nước đi hợp lệ.
   */
  legalMoves(state: S, playerIndex: PlayerIndex): M[];

  /**
   * Áp dụng một nước đi lên trạng thái hiện tại và sinh ra trạng thái bàn cờ mới.
   *
   * NGUYÊN TẮC:
   * 1. Phải là hàm thuần (Pure function), trả về một bản sao trạng thái MỚI, KHÔNG mutate state cũ.
   * 2. Nếu nước đi không hợp lệ hoặc sai lượt: BẮT BUỘC throw `EngineError` với mã thích hợp ('ILLEGAL_MOVE', 'WRONG_TURN').
   *
   * @param state Trạng thái bàn cờ hiện tại.
   * @param move Nước đi người chơi muốn thực hiện.
   * @param playerIndex Vị trí ghế của người chơi đang thực hiện nước đi.
   * @returns Trạng thái bàn cờ mới (State S).
   * @throws {EngineError} Khi nước đi không hợp lệ, sai lượt, hoặc ván cờ đã kết thúc.
   */
  applyMove(state: S, move: M, playerIndex: PlayerIndex): S;

  /**
   * Xác định vị trí ghế của người chơi đang có lượt đi tại trạng thái hiện tại.
   *
   * @param state Trạng thái bàn cờ hiện tại.
   * @returns Chỉ số ghế của người chơi đang đến lượt (0-based).
   */
  currentPlayer(state: S): PlayerIndex;

  /**
   * Kiểm tra xem ván cờ đã kết thúc hay chưa (Chiếu bí, hết nước đi, hòa cờ, đếm điểm).
   *
   * @param state Trạng thái bàn cờ hiện tại.
   * @returns Kết quả TerminalResult (over: boolean, outcomes?: PlayerOutcome[]).
   */
  isTerminal(state: S): TerminalResult;

  /**
   * Nén trạng thái bàn cờ thành chuỗi string ngắn gọn để lưu trữ vào Supabase Database
   * (phù hợp giới hạn 500MB Free Tier) hoặc phục vụ chức năng lưu trạng thái (Snapshot).
   *
   * @param state Trạng thái bàn cờ cần serialize.
   * @returns Chuỗi string nén đại diện cho state.
   */
  serialize(state: S): string;

  /**
   * Phục hồi lại đối tượng State bàn cờ từ chuỗi string nén đã lưu trữ.
   *
   * RÀNG BUỘC BẮT BUỘC: Tính bảo toàn Round-trip:
   * `deserialize(serialize(state))` phải tương đương hoàn toàn với `state`.
   *
   * @param data Chuỗi string nén.
   * @returns Trạng thái bàn cờ đã phục hồi (State S).
   * @throws {EngineError} Với mã 'INVALID_STATE' nếu chuỗi data bị hỏng hoặc sai định dạng.
   */
  deserialize(data: string): S;

  // ============================================================================
  // CÁC PHƯƠNG THỨC MỞ RỘNG TÙY CHỌN (OPTIONAL METHODS)
  // ============================================================================

  /**
   * Trích xuất góc nhìn trạng thái dành riêng cho một người chơi trong các trò chơi có thông tin ẩn
   * (Imperfect Information Games như Cờ úp, Ma sói, Bài Uno).
   *
   * SỬ DỤNG TẠI: Phase P3.x+ (Realtime Online Server).
   * - Supabase Edge Function sẽ gọi `viewFor(state, playerIndex)` để ẩn đi quân cờ úp / bài đối thủ
   *   trước khi gửi payload qua kênh Realtime Broadcast, ngăn chặn triệt để hành vi hack xem trộm thông tin phía client.
   *
   * @param state Trạng thái đầy đủ của bàn cờ (Full State trên Server).
   * @param playerIndex Vị trí ghế của người chơi cần lấy góc nhìn.
   * @returns Trạng thái đã được lọc bỏ thông tin ẩn dành riêng cho player đó.
   */
  viewFor?(state: S, playerIndex: PlayerIndex): unknown;

  /**
   * Nén một đối tượng Move thành chuỗi string ngắn gọn để truyền tải qua đường truyền mạng Realtime
   * hoặc gửi trong body request gọi Supabase Edge Function.
   *
   * SỬ DỤNG TẠI: Phase P3.2 (Giao thức truyền thông Realtime Move Transport).
   *
   * @param move Đối tượng nước đi.
   * @returns Chuỗi string biểu diễn nước đi (ví dụ: 'e2e4' trong cờ vua).
   */
  serializeMove?(move: M): string;

  /**
   * Giải mã chuỗi string nhận được từ mạng trở lại thành đối tượng Move.
   *
   * SỬ DỤNG TẠI: Phase P3.2 (Giao thức truyền thông Realtime Move Transport).
   *
   * @param data Chuỗi string biểu diễn nước đi.
   * @returns Đối tượng nước đi đã giải mã (Move M).
   */
  deserializeMove?(data: string): M;
}
