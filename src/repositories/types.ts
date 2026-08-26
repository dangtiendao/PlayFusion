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

/**
 * Mã phân loại lỗi tầng Repository phục vụ cơ chế Retry & Outbox Sync (P2.5c).
 * - 'RETRYABLE': Lỗi mạng, mất kết nối, timeout (có thể thử lại an toàn).
 * - 'FATAL': Lỗi dữ liệu không hợp lệ, vi phạm ràng buộc schema/policy (không được retry).
 */
export type RepoErrorCode = 'RETRYABLE' | 'FATAL';

/**
 * Lớp lỗi chuẩn hóa của tầng Repository.
 */
export class RepoError extends Error {
  readonly code: RepoErrorCode;
  readonly isRetryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, code: RepoErrorCode, cause?: unknown) {
    super(message);
    this.name = 'RepoError';
    this.code = code;
    this.isRetryable = code === 'RETRYABLE';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Thông tin đấu thủ trong yêu cầu ghi nhận ván đấu offline.
 */
export interface RecordOfflineParticipantParam {
  readonly seatIndex: number;
  readonly isBot: boolean;
  readonly botLevel?: 'easy' | 'medium' | 'hard' | null;
  readonly result?: 'win' | 'loss' | 'draw' | null;
  readonly placement?: number | null;
  readonly score?: number | null;
}

/**
 * Tham số đầu vào để ghi nhận ván đấu offline lên máy chủ qua RPC `record_offline_match`.
 */
export interface RecordOfflineMatchParams {
  /** Định danh duy nhất của ván đấu (UUID do client sinh khi ván bắt đầu) */
  readonly matchId: string;
  /** Mã trò chơi (ví dụ: 'caro') */
  readonly gameId: string;
  /** Chế độ chơi offline ('solo' | 'vs_ai' | 'local_pvp') */
  readonly mode: 'solo' | 'vs_ai' | 'local_pvp';
  /** Thời điểm bắt đầu ván đấu (Date object hoặc ISO 8601 string) */
  readonly startedAt: Date | string;
  /** Tổng thời lượng thi đấu tính bằng mili-giây */
  readonly durationMs: number;
  /** Lý do kết thúc ván đấu ('checkmate' | 'resigned' | 'timeout' | ...) */
  readonly endReason?: string | null;
  /** Tùy chọn cấu hình ván cờ (JSON string) */
  readonly engineOptions?: string | null;
  /** Trạng thái bàn cờ khi kết thúc (JSON string) */
  readonly finalState?: string | null;
  /** Chuỗi nén toàn bộ danh sách nước đi */
  readonly moves?: string | null;
  /** Danh sách đấu thủ tham gia */
  readonly participants: readonly RecordOfflineParticipantParam[];
}

/**
 * Thống kê thành tích thi đấu theo một chế độ chơi cụ thể.
 */
export interface ModeStats {
  /** Tổng số ván đã đấu */
  readonly matches: number;
  /** Số ván thắng */
  readonly wins: number;
  /** Số ván thua */
  readonly losses: number;
  /** Số ván hòa */
  readonly draws: number;
}

/**
 * Thống kê tổng hợp toàn diện của một người chơi cho một trò chơi cụ thể (bảng `matches` & `match_participants`).
 *
 * GHI CHÚ KIẾN TRÚC:
 * - `byModeKey` được sinh động từ dữ liệu thật (ví dụ: 'vs_ai:easy', 'vs_ai:medium', 'vs_ai:hard', 'local_pvp', 'online_1v1'...).
 * - Khi có game mode mới xuất hiện trong DB, cấu trúc tự động bổ sung key tương ứng mà không cần sửa type.
 */
export interface PlayerGameStats {
  /** Mã định danh của trò chơi (ví dụ: 'caro', 'co_tuong') */
  readonly gameId: string;
  /** Tổng số ván đấu người chơi đã tham gia trong game này */
  readonly totalMatches: number;
  /** Phân rã số liệu theo từng modeKey */
  readonly byModeKey: Record<string, ModeStats>;
}

/**
 * Một dòng thông tin người chơi trên bảng xếp hạng (Leaderboard Entry).
 */
export interface LeaderboardEntry {
  /**
   * Thứ hạng 1-based của người chơi trên bảng xếp hạng.
   *
   * GHI CHÚ QUAN TRỌNG:
   * - Rank được tính ở client từ vị trí bắt đầu của trang (`startRank + index`).
   * - Rank chỉ bảo đảm đúng tuyệt đối khi người dùng tải liên tục từ trang 1.
   *   Nếu dữ liệu trên server thay đổi giữa 2 lần tải trang, rank có thể lệch nhẹ (chấp nhận được).
   */
  readonly rank: number;
  /** Mã định danh UUID của người chơi */
  readonly userId: string;
  /** Tên hiển thị công khai */
  readonly displayName: string;
  /** Đường dẫn ảnh đại diện (avatar) hoặc null nếu dùng avatar mặc định */
  readonly avatarUrl: string | null;
  /** Điểm xếp hạng Elo hiện tại */
  readonly rating: number;
  /** Tổng số ván xếp hạng đã đấu trong mùa */
  readonly gamesPlayed: number;
  /** Số ván thắng */
  readonly wins: number;
  /** Số ván thua */
  readonly losses: number;
  /** Điểm xếp hạng cao nhất từng đạt được trong mùa */
  readonly bestRating: number;
}

/**
 * Con trỏ kép (Dual Cursor) cho phân trang Keyset Pagination.
 *
 * GHI CHÚ QUAN TRỌNG:
 * - Sử dụng cả `rating` và `userId` để chống kẹt / trôi con trỏ khi có nhiều người chơi cùng điểm số (đồng hạng).
 */
export interface LeaderboardCursor {
  /** Điểm Elo của bản ghi cuối trang */
  readonly rating: number;
  /** UUID của người chơi cuối trang làm điểm neo tie-break */
  readonly userId: string;
}

/**
 * Kết quả phân trang một trang bảng xếp hạng (Leaderboard Page).
 */
export interface LeaderboardPage {
  /** Danh sách các kỳ thủ trên trang hiện tại */
  readonly entries: readonly LeaderboardEntry[];
  /** Con trỏ kép để tải trang tiếp theo, hoặc null nếu đã đến trang cuối */
  readonly nextCursor: LeaderboardCursor | null;
}

/**
 * Thông tin thứ hạng cá nhân của người chơi hiện tại trên bảng xếp hạng.
 */
export interface MyLeaderboardRank {
  /**
   * Vị trí thứ hạng chính xác trong mùa (1-based).
   * Giá trị là `null` nếu người chơi chưa đủ số trận tối thiểu (chưa lên bảng).
   */
  readonly rank: number | null;
  /** Điểm Elo hiện tại */
  readonly rating: number;
  /** Tổng số ván xếp hạng đã thi đấu */
  readonly gamesPlayed: number;
  /**
   * Cờ báo người chơi đã đủ điều kiện lên bảng xếp hạng hay chưa (gamesPlayed >= 10).
   */
  readonly eligible: boolean;
}

/**
 * Huy hiệu vĩnh viễn ghi nhận thành tích mùa giải của người chơi (bảng `user_season_badges` - P4.6a/d).
 */
export interface SeasonBadge {
  /** ID định danh duy nhất (UUID) của huy hiệu */
  readonly id: string;
  /** Mã số mùa giải (ví dụ: 1, 2) */
  readonly seasonId: number;
  /** Tên hiển thị của mùa giải (ví dụ: 'Mùa 1 - Khởi Nguyên') */
  readonly seasonName: string;
  /** Mã trò chơi (ví dụ: 'caro') */
  readonly gameId: string;
  /** Điểm Elo tại thời điểm đóng mùa */
  readonly finalRating: number;
  /** Bậc xếp hạng chốt mùa ('bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master') */
  readonly finalTier: string;
  /** Thứ hạng trên Bảng Vàng (null nếu < 10 trận) */
  readonly finalRank: number | null;
  /** Tổng số ván đã thi đấu trong mùa */
  readonly gamesPlayed: number;
  /** Số ván thắng */
  readonly wins: number;
  /** Số ván thua */
  readonly losses: number;
  /** Số ván hòa */
  readonly draws: number;
  /** Thời điểm cấp huy hiệu (ISO 8601 string) */
  readonly createdAt: string;
}

/**
 * Thông tin đợt trừ điểm bỏ đấu (Rating Decay) gần nhất của người chơi (bảng `rating_decay_log` - P4.6c/d).
 */
export interface RecentDecayLog {
  /** Số điểm đã bị trừ trong tuần */
  readonly points: number;
  /** Khóa tuần ISO (ví dụ: '2026-35') */
  readonly weekKey: string;
  /** Điểm số trước khi decay */
  readonly ratingBefore: number;
  /** Điểm số sau khi decay */
  readonly ratingAfter: number;
  /** Thời điểm trừ điểm (ISO 8601 string) */
  readonly createdAt: string;
}

/**
 * Bản ghi kỳ thủ trên Bảng Cao Thủ Toàn Hệ Thống (Matview `mv_leaderboard_masters` - P4.7b).
 */
export interface MasterEntry {
  /** Thứ hạng trên bảng xếp hạng (1..100) */
  readonly rank: number;
  /** UUID của người chơi */
  readonly userId: string;
  /** Tên hiển thị */
  readonly displayName: string;
  /** Đường dẫn ảnh đại diện */
  readonly avatarUrl: string | null;
  /** Điểm Elo trung bình có trọng số theo số ván: ROUND(SUM(rating * games_played) / SUM(games_played)) */
  readonly weightedRating: number;
  /** Số lượng trò chơi đã hoàn thành định hạng (>= 10 ván) */
  readonly gamesCount: number;
  /** Tổng số ván đã chơi trong các trò chơi đã định hạng */
  readonly totalGames: number;
  /** Điểm Elo cao nhất trong các game của người chơi */
  readonly bestTierRating?: number;
}

/**
 * Bản ghi người chơi trên Bảng Chăm Chỉ Toàn Hệ Thống (Matview `mv_leaderboard_grinders` - P4.7b).
 */
export interface GrinderEntry {
  /** Thứ hạng trên bảng xếp hạng (1..100) */
  readonly rank: number;
  /** UUID của người chơi */
  readonly userId: string;
  /** Tên hiển thị */
  readonly displayName: string;
  /** Đường dẫn ảnh đại diện */
  readonly avatarUrl: string | null;
  /** Tổng số xu kiếm được từ thi đấu trong mùa giải active */
  readonly earnedCoins: number;
  /** Tổng số ván đấu nhận thưởng trong mùa giải active */
  readonly totalMatches: number;
}

/**
 * Thứ hạng cá nhân của người dùng trên Bảng Xếp Hạng Toàn Hệ Thống (P4.7b).
 * - `rank`: Thứ hạng (1..n) hoặc `null` nếu người dùng chưa có mặt trên bảng (ví dụ: chưa định hạng game nào ở bảng Cao Thủ hoặc chưa kiếm xu nào ở bảng Chăm Chỉ).
 * - `value`: Giá trị điểm xếp hạng tương ứng (`weightedRating` ở bảng Cao Thủ, `earnedCoins` ở bảng Chăm Chỉ) hoặc `null` nếu không có mặt.
 */
export interface MyGlobalRank {
  readonly rank: number | null;
  readonly value: number | null;
}
