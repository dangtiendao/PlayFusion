import type { GameMode, ScoringType, RatingSystem, AiLevel } from './common';
import type { Engine } from './engine';

/**
 * ==============================================================================
 * TỜ KHAI NĂNG LỰC TRÒ CHƠI (GAME DEFINITION / MANIFEST)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & NGUYÊN TẮC BẤT BIẾN:
 *
 * 1. NGUYÊN TẮC PLUGIN ĐỘC LẬP (OPEN-CLOSED PRINCIPLE):
 *    - Toàn bộ các tầng hệ thống (Sảnh Sân chơi, Ghép phòng, Xếp hạng, Thống kê, Shop Skin)
 *      hoạt động hoàn toàn dựa trên việc đọc tờ khai `GameDefinition` này.
 *    - TUYỆT ĐỐI CẤM viết câu lệnh `if (gameId === ...)` ở bất kỳ tầng nào ngoài thư mục của chính game đó.
 *    - Mọi thuộc tính đặc thù của game phải được khai báo tường minh trong `GameDefinition`.
 *
 * 2. MÔ HÌNH DỮ LIỆU ĐA CHIỀU (MULTI-DIMENSIONAL DATA):
 *    - `id` là chiều dữ liệu trong mọi bảng cơ sở dữ liệu Supabase.
 *    - `scoring` quyết định định dạng hiển thị kết quả (Tỷ lệ thắng vs Điểm cao vs Thời gian).
 *    - `ratingSystem` quyết định thuật toán tính điểm và phân hạng (Elo vs Glicko-2 vs Leaderboard).
 * ==============================================================================
 */

/**
 * Phân loại thể loại trò chơi trên nền tảng PlayFusion:
 * - 'board': Cờ truyền thống & Board games chiến thuật (Caro, Cờ tướng, Cờ vua, Cờ vây).
 * - 'arcade': Game giải trí nhanh, hành động nhẹ nhàng, phản xạ.
 * - 'puzzle': Game giải đố, trí tuệ, suy luận logic (Sudoku, Xếp hình).
 * - 'skill': Game đòi hỏi kỹ năng tính toán, ghi nhớ hoặc khéo léo.
 * - 'party': Game nhiều người chơi, tương tác nhóm vui nhộn (Cờ cá ngựa, Uno).
 */
export type GameCategory = 'board' | 'arcade' | 'puzzle' | 'skill' | 'party';

/**
 * Chiều sắp xếp của điểm số trên Bảng xếp hạng (Leaderboard):
 * - 'desc': Điểm cao hơn xếp trên (dành cho game ghi điểm số tích lũy: Flappy, Rắn săn mồi).
 * - 'asc': Thời gian ít hơn xếp trên (dành cho game giải tốc độ: Xếp hình, Puzzles, Speedrun).
 */
export type ScoreDirection = 'asc' | 'desc';

/**
 * Cấu hình giới hạn số lượng người chơi trong một ván đấu.
 */
export interface PlayerCountConfig {
  /** Số người chơi tối thiểu để bắt đầu ván (ví dụ: 1 cho Solo, 2 cho Đối kháng 1v1) */
  readonly min: number;
  /** Số người chơi tối đa trong một phòng đấu (ví dụ: 2 cho Cờ tướng, 4 cho Cờ cá ngựa) */
  readonly max: number;
}

/**
 * Cấu hình đồng hồ kiểm soát thời gian (Time Control) trong ván đấu.
 * SỬ DỤNG TẠI: Phase P3.4 (Hệ thống Đồng hồ thi đấu ván cờ).
 */
export interface TimeControlConfig {
  /** Thời gian cơ bản của mỗi người chơi tính bằng giây (ví dụ: 300s = 5 phút) */
  readonly baseSeconds: number;
  /** Thời gian cộng thêm sau mỗi nước đi tính bằng giây (ví dụ: 3s theo luật Fischer) */
  readonly incrementSeconds?: number;
}

/**
 * Định nghĩa một vị trí trang bị ngoại trang (Cosmetic Slot) cho trò chơi trong Cửa hàng Shop.
 * SỬ DỤNG TẠI: Phase P6.x (Hệ thống Ngoại trang & Shop).
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Khóa định danh slot trong Database sẽ có quy tắc: `game:{gameId}:{slotId}`
 *   (ví dụ: `game:caro:board_skin`, `game:co_tuong:piece_set`).
 */
export interface CosmeticSlotDefinition {
  /** Định danh duy nhất của slot trong phạm vi game (ví dụ: 'board', 'piece', 'card_back') */
  readonly id: string;
  /** Tên hiển thị thân thiện trong giao diện Shop (ví dụ: 'Bàn cờ gỗ mun', 'Bộ quân cờ ngọc bích') */
  readonly name: string;
}

/**
 * INTERFACE TỜ KHAI NĂNG LỰC TRÒ CHƠI (GAME DEFINITION)
 *
 * Mọi trò chơi tích hợp vào Web Game Hub BẮT BUỘC phải export một đối tượng tuân thủ interface này
 * tại file `manifest.ts` trong thư mục của game đó (ví dụ: `src/games/caro/manifest.ts`).
 */
export interface GameDefinition {
  // ============================================================================
  // 1. CÁC THUỘC TÍNH BẮT BUỘC (REQUIRED METADATA)
  // ============================================================================

  /**
   * Mã định danh duy nhất của trò chơi, định dạng kebab-case (ví dụ: 'caro', 'co-tuong', 'co-vua').
   *
   * RÀNG BUỘC SỐNG CÒN (INVARIANT):
   * - Bất biến vĩnh viễn vì là khóa dữ liệu (game_id) xuyên suốt trong mọi bảng DB Supabase.
   * - Tuyệt đối không được thay đổi sau khi đã release (đổi id đồng nghĩa với mất sạch lịch sử/rank).
   */
  readonly id: string;

  /** Tên tiếng Việt hiển thị chính thức của trò chơi trên giao diện (ví dụ: 'Cờ Caro', 'Cờ Tướng') */
  readonly name: string;

  /** Mô tả ngắn gọn về trò chơi và luật thi đấu cơ bản (hiển thị trên Sảnh Sân chơi và thẻ xem trước) */
  readonly description: string;

  /** Phân loại thể loại trò chơi phục vụ bộ lọc danh mục trên trang chủ */
  readonly category: GameCategory;

  /** Giới hạn số lượng người chơi của ván đấu */
  readonly players: PlayerCountConfig;

  /**
   * Danh sách tất cả các chế độ chơi mà game hỗ trợ.
   * Sảnh game sẽ tự động render các nút bấm chế độ chơi (Chơi với máy, 2 người chung máy, Đấu Online)
   * hoàn toàn dựa trên mảng này.
   */
  readonly modes: readonly GameMode[];

  /**
   * Cơ chế lượt chơi:
   * - `true`: Game theo lượt (Turn-based: Cờ tướng, Cờ vua, Caro). Netcode đi qua Supabase Edge Function từng nước đi.
   * - `false`: Game thời gian thực (Realtime: Hành động, Đua tốc độ). Netcode sử dụng kênh WebRTC / Supabase Realtime State Sync (Phase P7.x).
   */
  readonly turnBased: boolean;

  /** Cho phép ghép trận đấu xếp hạng và tính điểm trên hệ thống hay không */
  readonly ranked: boolean;

  /**
   * Phương thức ghi nhận kết quả và tính điểm:
   * - 'win_loss': Thắng/Thua/Hòa (Game đối kháng).
   * - 'score': Điểm số tích lũy (Game tính điểm).
   * - 'time': Thời gian hoàn thành (Game giải đố).
   */
  readonly scoring: ScoringType;

  /**
   * Hệ thống tính điểm xếp hạng áp dụng:
   * - 'elo': Hệ thống Elo chuẩn FIDE.
   * - 'glicko2': Hệ thống Glicko-2.
   * - 'leaderboard_only': Chỉ hiển thị Highscore / Bảng thành tích.
   */
  readonly ratingSystem: RatingSystem;

  /** Cho phép có kết quả Hòa cờ hay không (Cờ tướng/Cờ vua: true, Caro chặn 2 đầu: true, một số game solo: false) */
  readonly hasDraw: boolean;

  /**
   * Ước tính thời lượng trung bình của một ván đấu tính bằng giây (ví dụ: 300s = 5 phút cho Caro).
   * SỬ DỤNG TẠI: Tính toán thời gian chờ Timeout của hệ thống Matchmaking và hiển thị ước lượng cho người chơi.
   */
  readonly avgMatchSeconds: number;

  /**
   * Hàm nạp động (Dynamic Import) module Engine của game.
   *
   * GHI CHÚ KIẾN TRÚC:
   * - Cho phép Vite thực hiện Code-Splitting: Trình duyệt chỉ tải mã nguồn Engine của game khi người dùng thực sự bấm vào chơi.
   * - Kiểu dữ liệu sử dụng `Engine<unknown, unknown>` ở tầng hệ thống để hệ sinh thái không bị phụ thuộc vào State/Move cụ thể của từng game.
   */
  readonly loadEngine: () => Promise<Engine<unknown, unknown>>;

  // ============================================================================
  // 2. CÁC THUỘC TÍNH MỞ RỘNG TÙY CHỌN (OPTIONAL FOR FUTURE PHASES)
  // ============================================================================

  /**
   * Đường dẫn hoặc khóa định danh icon đại diện của game được phục vụ từ Cloudflare Pages assets
   * (ví dụ: '/assets/games/caro/icon.svg').
   */
  readonly icon?: string;

  /** Mã màu sắc chủ đạo của game dạng hex (ví dụ: '#2563eb' cho Caro, '#dc2626' cho Cờ tướng) */
  readonly themeColor?: string;

  /**
   * Danh sách các cấp độ Bot AI được hỗ trợ (chỉ khai báo khi `modes` có chứa `'vs_ai'`).
   * SỬ DỤNG TẠI: Phase P1.x (Bot AI chạy trong Web Worker).
   */
  readonly aiLevels?: readonly AiLevel[];

  /**
   * Đánh dấu game có yếu tố ngẫu nhiên (may rủi) cần Server Edge Function sinh PRNG Seed ban đầu.
   * SỬ DỤNG TẠI: Phase P3.x (Server Realtime Matchmaking).
   */
  readonly seeded?: boolean;

  /**
   * Đánh dấu game có thông tin ẩn (như bài đối thủ, quân cờ úp) cần Server lọc thông tin qua `Engine.viewFor`.
   * SỬ DỤNG TẠI: Phase P3.x (Che giấu dữ liệu chống hack client).
   */
  readonly hiddenInfo?: boolean;

  /**
   * Cấu hình đồng hồ đếm ngược ván đấu mặc định.
   * SỬ DỤNG TẠI: Phase P3.4.
   */
  readonly timeControl?: TimeControlConfig;

  /**
   * Danh sách các vị trí trang bị Skin ngoại trang mà game hỗ trợ trong Cửa hàng.
   * SỬ DỤNG TẠI: Phase P6.x (Hệ thống Skin & Shop).
   */
  readonly cosmeticSlots?: readonly CosmeticSlotDefinition[];

  /** Phiên bản App tối thiểu yêu cầu để có thể nạp và chơi được game này (dùng cho công tác vận hành nâng cấp app) */
  readonly minAppVersion?: string;

  /**
   * Chiều sắp xếp của bảng xếp hạng điểm số (BẮT BUỘC về mặt logic khi `scoring` là `'score'` hoặc `'time'`).
   * - 'desc': Điểm cao nhất đứng đầu (Highscore).
   * - 'asc': Thời gian ngắn nhất đứng đầu (Best Time).
   */
  readonly scoreDirection?: ScoreDirection;
}

/**
 * Type Helper: Định nghĩa một Game đã được đăng ký bất biến trong hệ thống.
 */
export type RegisteredGame = Readonly<GameDefinition>;
