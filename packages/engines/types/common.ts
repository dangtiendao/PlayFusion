/**
 * ==============================================================================
 * CÁC KIỂU DỮ LIỆU NỀN TẢNG DÙNG CHUNG CHO TOÀN BỘ GAME ENGINE VÀ HỆ THỐNG
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Module này là TypeScript thuần túy (Pure TS, Zero DOM, Zero Framework).
 * - Được import bởi 3 môi trường: Client React View, Web Worker AI, và Supabase Edge Functions (Deno).
 * ==============================================================================
 */

/**
 * Các chế độ chơi được hỗ trợ trên toàn bộ nền tảng Web Game Hub.
 * - 'solo': Chơi giải đố đơn lẻ (Puzzles, Luyện thế cờ).
 * - 'vs_ai': Chơi với máy tính / bot AI chạy trên Web Worker.
 * - 'local_pvp': 2 người chơi đối kháng trực tiếp trên cùng 1 thiết bị (Pass & Play).
 * - 'online_1v1': Đối kháng trực tuyến 1 vs 1 có tính điểm Elo hoặc ghép phòng.
 * - 'online_ffa': Đấu tự do nhiều người (Free For All, ví dụ Cờ cá ngựa 4 người).
 * - 'online_team': Đấu đồng đội (2 vs 2).
 */
export type GameMode = 'solo' | 'vs_ai' | 'local_pvp' | 'online_1v1' | 'online_ffa' | 'online_team';

/**
 * Vị trí ghế ngồi của người chơi trong ván cờ (0-indexed).
 * - Người chơi 1: index 0 (ví dụ quân Trắng / Đỏ / Tiên).
 * - Người chơi 2: index 1 (ví dụ quân Đen / Hậu).
 * - Người chơi 3, 4: index 2, 3 (trong game 4 người).
 *
 * Ràng buộc: Khớp 1-1 với trường `seat_index` trong bảng `match_participants` của Supabase DB.
 */
export type PlayerIndex = number;

/**
 * Kết quả thi đấu của một người chơi cụ thể.
 * - 'win': Thắng trận.
 * - 'loss': Thua trận.
 * - 'draw': Hòa trận.
 */
export type MatchOutcome = 'win' | 'loss' | 'draw';

/**
 * Phương thức tính điểm và xác định thắng thua của trò chơi.
 * - 'win_loss': Thắng / Thua / Hòa nhị phân (Cờ tướng, Cờ vua, Cờ caro).
 * - 'score': Tính theo tổng điểm số tích lũy (Scrabble, Cờ cá ngựa đếm điểm).
 * - 'time': Tính theo thời gian hoàn thành (Game tốc độ, Xếp hình).
 */
export type ScoringType = 'win_loss' | 'score' | 'time';

/**
 * Hệ thống xếp hạng áp dụng cho trò chơi.
 * - 'elo': Hệ thống Elo chuẩn FIDE / USCF (Cờ tướng, Cờ vua, Caro).
 * - 'glicko2': Hệ thống Glicko-2 có tính độ lệch rating (RD) và độ biến thiên (volatility).
 * - 'leaderboard_only': Chỉ hiển thị bảng xếp hạng điểm cao / chuỗi thắng, không tính rating.
 */
export type RatingSystem = 'elo' | 'glicko2' | 'leaderboard_only';

/**
 * Cấp độ khó của thuật toán Bot AI chạy trong Web Worker.
 * - 'easy': Cấp độ Dễ (ngẫu nhiên có chọn lọc hoặc Minimax độ sâu thấp 1-2).
 * - 'medium': Cấp độ Trung bình (Minimax/Alpha-Beta độ sâu trung bình 3-4 kèm bảng đánh giá vị trí).
 * - 'hard': Cấp độ Khó (Alpha-Beta + Quiescence Search + Transposition Table độ sâu cao).
 */
export type AiLevel = 'easy' | 'medium' | 'hard';

/**
 * Kết quả chi tiết của từng người chơi khi ván đấu kết thúc.
 */
export interface PlayerOutcome {
  /** Chỉ số ghế ngồi của người chơi (0-based) */
  readonly playerIndex: PlayerIndex;
  /** Kết quả: Thắng / Thua / Hòa */
  readonly outcome: MatchOutcome;
  /** Thứ hạng xếp vị trong ván đấu nhiều người (1 là Nhất, 2 là Nhì... dùng cho mode FFA) */
  readonly placement?: number;
  /** Điểm số đạt được trong ván đấu (nếu trò chơi thuộc dạng scoringType = 'score') */
  readonly score?: number;
}

/**
 * Kết quả kiểm tra trạng thái kết thúc ván cờ từ hàm `engine.isTerminal(state)`.
 */
export interface TerminalResult {
  /** True nếu ván cờ đã kết thúc hoàn toàn (chiếu bí, hết nước đi, hòa cờ, hoặc đạt điều kiện thắng) */
  readonly over: boolean;
  /**
   * Danh sách kết quả chi tiết của tất cả người chơi trong ván.
   * RÀNG BUỘC: Mảng này BẮT BUỘC phải có dữ liệu khi `over === true`, và là `undefined` khi `over === false`.
   */
  readonly outcomes?: readonly PlayerOutcome[];
}

/**
 * Thông tin người chơi tham gia trong báo cáo kết quả trận đấu.
 */
export interface MatchResultParticipant {
  /** Vị trí ghế ngồi (0-based) */
  readonly playerIndex: PlayerIndex;
  /** Kết quả: 'win' | 'loss' | 'draw' */
  readonly outcome: MatchOutcome;
  /** Thứ hạng xếp vị (1, 2, 3...) cho chế độ FFA */
  readonly placement?: number;
  /** Điểm số tích lũy (nếu có) */
  readonly score?: number;
}

/**
 * Báo cáo kết quả kết thúc trận đấu chuẩn hóa (Match Result Report).
 *
 * HỢP ĐỒNG VẬN HÀNH:
 * - Được tạo ra khi ván đấu kết thúc và gửi lên Supabase Edge Function `settle_match` ở Phase P4.2.
 * - Server sẽ dùng báo cáo này cùng chuỗi `movesSerialized` để chạy lại `engine.applyMove` xác thực
 *   tính toàn vẹn trước khi cập nhật điểm Elo và trả thưởng ví xu.
 */
export interface MatchResultReport {
  /** Định danh duy nhất của trò chơi (ví dụ: 'caro', 'co_tuong', 'co_vua') */
  readonly gameId: string;
  /** Chế độ chơi của ván đấu */
  readonly mode: GameMode;
  /** Danh sách kết quả của các đấu thủ tham gia */
  readonly participants: readonly MatchResultParticipant[];
  /** Tổng thời gian diễn ra ván đấu tính theo mili-giây */
  readonly durationMs: number;
  /** Chuỗi nén ghi lại toàn bộ danh sách nước đi để lưu trữ và phục vụ tính năng Replay trận đấu */
  readonly movesSerialized?: string;
}
