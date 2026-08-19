/**
 * ==============================================================================
 * DOMAIN TYPES CHO TẦNG REPOSITORIES (CỔNG THOÁT HIỂM BACKEND)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. TÍNH ĐỘC LẬP & TÁCH RỜI SUPABASE:
 *    - Toàn bộ các interface trong file này là kiểu dữ liệu Domain sạch (Clean Domain Types).
 *    - Không bao giờ chứa cấu trúc row snake_case hay metadata nội bộ của Supabase/PostgreSQL.
 *    - Tầng UI (React View) và Tầng Store (Zustand) CHỈ ĐƯỢC PHÉP nhìn thấy các types này.
 * 2. CHUẨN ĐẶT TÊN:
 *    - Toàn bộ thuộc tính tuân thủ quy ước camelCase của TypeScript/JavaScript.
 *    - Mappers trong từng repository chịu trách nhiệm chuyển đổi snake_case <-> camelCase.
 * ==============================================================================
 */

/**
 * Thông tin chi tiết một trò chơi trong danh mục hệ thống (bảng `games`).
 */
export interface GameCatalogItem {
  /** Mã định danh duy nhất của trò chơi (ví dụ: 'caro', 'co_tuong') */
  readonly id: string;
  /** Tên hiển thị tiếng Việt của trò chơi (ví dụ: 'Cờ Caro') */
  readonly name: string;
  /** Thể loại trò chơi (ví dụ: 'board', 'puzzle', 'card') */
  readonly category: string;
  /** Trò chơi có hỗ trợ chế độ thi đấu tính điểm hay không */
  readonly ranked: boolean;
  /** Hệ thống xếp hạng áp dụng ('elo' | 'glicko2' | 'leaderboard_only') */
  readonly ratingSystem: string;
  /** Phương thức tính điểm ('win_loss' | 'score' | 'time') */
  readonly scoring: string;
  /** Số lượng người chơi tối thiểu trong 1 ván đấu */
  readonly minPlayers: number;
  /** Số lượng người chơi tối đa trong 1 ván đấu */
  readonly maxPlayers: number;
  /** Trạng thái kích hoạt trò chơi trên toàn hệ thống */
  readonly isEnabled: boolean;
  /** Trạng thái mở tính năng leo rank cho trò chơi này */
  readonly rankedEnabled: boolean;
}

/**
 * Thông tin mùa giải thi đấu xếp hạng (bảng `seasons`).
 */
export interface Season {
  /** Mã định danh số của mùa giải (ví dụ: 1, 2, 3) */
  readonly id: number;
  /** Tên gọi mùa giải (ví dụ: 'Mùa 1 - Khởi Nguyên') */
  readonly name: string;
  /** Thời điểm bắt đầu mùa giải (ISO 8601 string) */
  readonly startedAt: string;
  /** Thời điểm kết thúc mùa giải (ISO 8601 string hoặc null nếu đang diễn ra) */
  readonly endedAt: string | null;
  /** Cờ báo mùa giải đang hoạt động */
  readonly isActive: boolean;
}

/**
 * Tóm tắt kết quả của một người chơi tham gia trong ván đấu (bảng `match_participants`).
 */
export interface MatchParticipantSummary {
  /** Chỉ số vị trí ghế ngồi của người chơi trong ván đấu (0-based) */
  readonly seatIndex: number;
  /** ID người dùng (null nếu là Bot AI) */
  readonly userId: string | null;
  /** Cờ báo đấu thủ là Bot AI */
  readonly isBot: boolean;
  /** Cấp độ khó của Bot nếu là bot ('easy' | 'medium' | 'hard' | null) */
  readonly botLevel: string | null;
  /** Kết quả thi đấu ('win' | 'loss' | 'draw' | null) */
  readonly result: 'win' | 'loss' | 'draw' | null;
  /** Thứ hạng xếp vị trong ván đấu (1, 2, 3... cho FFA) */
  readonly placement: number | null;
  /** Điểm số đạt được trong ván đấu */
  readonly score: number | null;
  /** Biến động điểm xếp hạng sau ván đấu (+15, -12...) */
  readonly ratingDelta: number | null;
  /** Tên hiển thị lấy từ bảng `profiles` (nếu có join) */
  readonly displayName?: string;
}

/**
 * Tóm tắt thông tin ván đấu phục vụ hiển thị lịch sử và danh sách trận gần đây (bảng `matches`).
 */
export interface MatchSummary {
  /** Mã định danh duy nhất (UUID) của ván đấu */
  readonly id: string;
  /** Mã trò chơi (ví dụ: 'caro') */
  readonly gameId: string;
  /** Chế độ chơi ('solo' | 'vs_ai' | 'local_pvp' | 'online_1v1' | ...) */
  readonly mode: string;
  /** Cờ báo ván đấu có tính điểm leo rank hay không */
  readonly isRanked: boolean;
  /** Thời điểm bắt đầu ván đấu (ISO 8601 string) */
  readonly startedAt: string;
  /** Thời điểm kết thúc ván đấu (ISO 8601 string hoặc null nếu đang chơi) */
  readonly endedAt: string | null;
  /** Tổng thời lượng thi đấu tính bằng mili-giây */
  readonly durationMs: number | null;
  /** Lý do kết thúc ván đấu ('checkmate' | 'resigned' | 'timeout' | 'disconnect' | ...) */
  readonly endReason: string | null;
  /** Danh sách chi tiết các đấu thủ tham gia ván đấu */
  readonly participants: readonly MatchParticipantSummary[];
}

/**
 * Hồ sơ điểm xếp hạng và thành tích của người chơi (bảng `player_ratings`).
 */
export interface PlayerRating {
  /** ID của người chơi */
  readonly userId: string;
  /** Mã trò chơi */
  readonly gameId: string;
  /** ID mùa giải */
  readonly seasonId: number;
  /** Điểm xếp hạng hiện tại (Elo mặc định 1200) */
  readonly rating: number;
  /** Tổng số ván đã thi đấu */
  readonly gamesPlayed: number;
  /** Tổng số ván thắng */
  readonly wins: number;
  /** Tổng số ván thua */
  readonly losses: number;
  /** Tổng số ván hòa */
  readonly draws: number;
  /** Chuỗi thắng/thua hiện tại (+3 là 3 thắng liên tiếp, -2 là 2 thua liên tiếp) */
  readonly streak: number;
  /** Điểm xếp hạng cao nhất từng đạt được trong mùa giải */
  readonly bestRating: number;
  /** Cờ báo người chơi đã hoàn thành các ván phân hạng (placement matches) */
  readonly placementDone: boolean;
  /** Thời điểm thi đấu ván gần nhất (ISO 8601 string hoặc null) */
  readonly lastPlayedAt: string | null;
}
