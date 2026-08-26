/**
 * ==============================================================================
 * QUY TẮC BẬC XẾP HẠNG & TIẾN ĐỘ ELO (PACKAGES/RATING/TIERS.TS)
 * ==============================================================================
 *
 * MỤC TIÊU & NGUYÊN TẮC KIẾN TRÚC:
 * 1. NGUỒN CHÂN LÝ HIỂN THỊ DUY NHẤT (SINGLE SOURCE OF TRUTH):
 *    - Bảng ánh xạ `TIER_TABLE` là "Hiến pháp hiển thị" của toàn hệ sinh thái Web Game Hub.
 *    - Mọi nơi (Profile, MatchEndOverlay, Leaderboard, Admin) ĐỀU PHẢI đọc từ đây,
 *      TUYỆT ĐỐI KHÔNG có bảng ánh xạ thứ hai chép tay ở tầng UI.
 * 2. ĐỘC LẬP & DETERMINISTIC 100%:
 *    - TypeScript thuần túy, Zero DOM, Zero Framework, Zero DB.
 * 3. RANH GIỚI BẬC CHỐT CỨNG (INCLUSIVE MINRATING):
 *    - `minRating` là ngưỡng bắt đầu (bao gồm cả mốc min).
 *    - 999 = Đồng, 1000 = Bạc, 1199 = Bạc, 1200 = Vàng (mặc định), 1800+ = Cao Thủ.
 * 4. CƠ CHẾ BẢO VỆ RỚT BẬC (DEMOTION PROTECTION SHIELD):
 *    - Suy diễn trung thực từ trận đấu gần nhất (`lastMatch`), không cần thêm cột DB.
 * ==============================================================================
 */

/**
 * Định danh các bậc xếp hạng trong hệ thống.
 */
export type TierId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

/**
 * Định nghĩa chi tiết của một bậc rank.
 */
export interface TierDef {
  /**
   * Mã định danh bậc rank (toàn bộ chữ thường, chuẩn enum).
   */
  readonly id: TierId;

  /**
   * Tên tiếng Việt hiển thị chính thức trên giao diện.
   */
  readonly name: string;

  /**
   * Ngưỡng điểm Elo tối thiểu để đạt bậc (INCLUSIVE: rating >= minRating).
   */
  readonly minRating: number;

  /**
   * Ngưỡng điểm Elo tối đa của bậc (INCLUSIVE: rating <= maxRating).
   * Riêng bậc cao nhất ('master' - Cao Thủ), maxRating là `null` (không giới hạn trần).
   */
  readonly maxRating: number | null;
}

/**
 * ==============================================================================
 * BẢNG ÁNH XẠ BẬC RANK CHUẨN (NGUỒN CHÂN LÝ BẤT BIẾN)
 * ==============================================================================
 *
 * QUY TẮC THIẾT KẾ:
 * - 🟤 Đồng (Bronze): 0 - 999 (Sàn DB là 100)
 * - ⚪ Bạc (Silver): 1000 - 1199
 * - 🟡 Vàng (Gold): 1200 - 1399 (Điểm xuất phát mặc định của tài khoản mới)
 * - 🔵 Bạch Kim (Platinum): 1400 - 1599
 * - 💎 Kim Cương (Diamond): 1600 - 1799
 * - 👑 Cao Thủ (Master): >= 1800 (Không có trần)
 *
 * LƯU Ý: Đây là cấu hình "Hiến pháp". Đổi số là đổi toàn bộ logic hiển thị của hệ thống.
 */
export const TIER_TABLE: readonly TierDef[] = [
  { id: 'bronze', name: 'Đồng', minRating: 0, maxRating: 999 },
  { id: 'silver', name: 'Bạc', minRating: 1000, maxRating: 1199 },
  { id: 'gold', name: 'Vàng', minRating: 1200, maxRating: 1399 },
  { id: 'platinum', name: 'Bạch Kim', minRating: 1400, maxRating: 1599 },
  { id: 'diamond', name: 'Kim Cương', minRating: 1600, maxRating: 1799 },
  { id: 'master', name: 'Cao Thủ', minRating: 1800, maxRating: null },
] as const;

/**
 * Tra cứu thông tin Bậc Rank theo mức điểm Elo hiện tại.
 *
 * @param rating Điểm xếp hạng Elo (phải là số hữu hạn >= 0)
 * @returns Định nghĩa bậc rank (`TierDef`) tương ứng
 * @throws RangeError nếu rating âm hoặc không phải số hữu hạn
 */
export function getTierByRating(rating: number): TierDef {
  if (!Number.isFinite(rating) || rating < 0) {
    throw new RangeError(`Rating phải là số hữu hạn không âm (>= 0). Nhận được: ${rating}`);
  }

  // Duyệt từ bậc cao nhất xuống bậc thấp nhất
  for (let i = TIER_TABLE.length - 1; i > 0; i--) {
    const item = TIER_TABLE[i];
    if (item && rating >= item.minRating) {
      return item;
    }
  }

  const defaultTier = TIER_TABLE[0];
  if (!defaultTier) {
    throw new Error('TIER_TABLE không được rỗng.');
  }
  return defaultTier;
}

/**
 * Thông tin tiến độ điểm số trong bậc rank hiện tại để hiển thị thanh tiến trình.
 */
export interface TierProgress {
  /**
   * Bậc rank thực tế hiện tại theo điểm số.
   */
  readonly tier: TierDef;

  /**
   * Bậc rank kế tiếp mà người chơi đang hướng tới (`null` nếu đã đạt Cao Thủ).
   */
  readonly nextTier: TierDef | null;

  /**
   * Số điểm đã tích lũy được bên trong bậc hiện tại (`rating - tier.minRating`).
   */
  readonly pointsInTier: number;

  /**
   * Số điểm cần tích lũy thêm để thăng lên bậc kế tiếp (`null` nếu đã đạt Cao Thủ).
   */
  readonly pointsToNext: number | null;

  /**
   * Tỷ lệ phần trăm tiến độ hoàn thành bậc (0.0% -> 100.0%, làm tròn 1 chữ số thập phân).
   * Ví dụ: 1250 điểm (Vàng, khoảng 1200-1399, span=200) -> pointsInTier=50 -> 25.0%.
   * Riêng bậc Cao Thủ luôn cố định là 100.0%.
   */
  readonly percent: number;
}

/**
 * Tính toán chi tiết tiến độ điểm số của người chơi trong bậc rank.
 *
 * CÁCH LÀM TRÒN PHẦN TRĂM (PERCENT):
 * - `span = nextTier.minRating - tier.minRating`
 * - `rawPercent = (pointsInTier / span) * 100`
 * - `percent = Math.round(rawPercent * 10) / 10` (Làm tròn chuẩn 1 chữ số thập phân).
 *
 * @param rating Điểm xếp hạng Elo
 * @returns Đối tượng `TierProgress`
 */
export function getTierProgress(rating: number): TierProgress {
  const tier = getTierByRating(rating);
  const tierIndex = TIER_TABLE.findIndex((t) => t.id === tier.id);

  // 1. Trường hợp đạt bậc cao nhất (Cao Thủ - Master)
  if (tier.maxRating === null || tierIndex === TIER_TABLE.length - 1) {
    const pointsInTier = rating - tier.minRating;
    return {
      tier,
      nextTier: null,
      pointsInTier,
      pointsToNext: null,
      percent: 100,
    };
  }

  // 2. Các bậc thông thường có bậc kế tiếp
  const nextTier =
    tierIndex >= 0 && tierIndex < TIER_TABLE.length - 1 ? TIER_TABLE[tierIndex + 1] : undefined;
  if (!nextTier) {
    return {
      tier,
      nextTier: null,
      pointsInTier: rating - tier.minRating,
      pointsToNext: null,
      percent: 100,
    };
  }

  const pointsInTier = rating - tier.minRating;
  const pointsToNext = nextTier.minRating - rating;
  const span = nextTier.minRating - tier.minRating;

  const rawPercent = (pointsInTier / span) * 100;
  // Làm tròn 1 chữ số thập phân và kẹp an toàn trong khoảng [0, 100]
  const percent = Math.min(100, Math.max(0, Math.round(rawPercent * 10) / 10));

  return {
    tier,
    nextTier,
    pointsInTier,
    pointsToNext,
    percent,
  };
}

/**
 * Tham số đầu vào để tổng hợp trạng thái hiển thị Rank của người chơi.
 */
export interface RankViewInput {
  /**
   * Điểm xếp hạng Elo hiện tại.
   */
  readonly rating: number;

  /**
   * Tổng số trận đấu đã chơi trong mùa giải hiện tại của game này.
   */
  readonly gamesPlayed: number;

  /**
   * Số trận đấu yêu cầu trong giai đoạn định hạng (mặc định: 15 trận từ system_config `elo.placement_games`).
   */
  readonly placementGames: number;

  /**
   * Thông tin trận đấu Xếp Hạng gần nhất của người chơi (nếu có).
   * Lấy từ `match_participants` của trận ranked gần nhất.
   */
  readonly lastMatch?: {
    readonly ratingBefore: number;
    readonly ratingAfter: number;
  } | null;
}

/**
 * Trạng thái hiển thị Rank tổng hợp cho UI.
 */
export type RankView =
  | {
      /**
       * Đang trong giai đoạn định hạng (chưa hoàn thành 15 trận).
       */
      readonly kind: 'placement';
      readonly gamesPlayed: number;
      readonly gamesNeeded: number;
    }
  | {
      /**
       * Đã hoàn thành định hạng và có bậc xếp hạng chính thức.
       */
      readonly kind: 'ranked';

      /**
       * Bậc rank thực tế theo điểm số hiện tại.
       */
      readonly tier: TierDef;

      /**
       * Tiến độ điểm số trong bậc rank.
       */
      readonly progress: TierProgress;

      /**
       * Trạng thái kích hoạt Khiên Bảo Vệ Rớt Bậc (true nếu vừa rớt ngưỡng lần đầu sau 1 trận thua/hòa mất điểm).
       */
      readonly shield: boolean;

      /**
       * Bậc rank dùng để hiển thị trên UI.
       * Nếu `shield === true`: Hiển thị bậc cũ (trước khi rớt) kèm biểu tượng Khiên.
       * Nếu `shield === false`: Hiển thị bậc thực tế (`tier`).
       */
      readonly displayTier: TierDef;
    };

/**
 * Hàm thuần tính toán trạng thái hiển thị rank tổng hợp cho Client UI.
 *
 * LUẬT QUYẾT ĐỊNH (a -> d):
 * a. gamesPlayed < placementGames -> 'placement' (chưa hiện bậc rank).
 * b. shield = true KHI VÀ CHỈ KHI:
 *    - lastMatch tồn tại
 *    - ratingAfter < ratingBefore (trận đấu làm giảm điểm Elo)
 *    - tierIndex(ratingBefore) > tierIndex(ratingAfter) (trận đấu gây rớt ngưỡng bậc)
 *    - rating === ratingAfter (chưa có trận đấu nào khác diễn ra sau đó)
 *    -> displayTier = tier(ratingBefore) (giữ bậc cũ kèm khiên).
 * c. Ngược lại: shield = false, displayTier = tier(rating).
 * d. GIỚI HẠN THIẾT KẾ: Suy diễn từ 1 trận gần nhất, không phát sinh thêm cột DB.
 *
 * @param input Dữ liệu người chơi (rating, gamesPlayed, placementGames, lastMatch)
 * @returns Đối tượng `RankView`
 */
export function resolveRankView(input: RankViewInput): RankView {
  const { rating, gamesPlayed, placementGames, lastMatch } = input;

  // 1. LUẬT a: GIAI ĐOẠN ĐỊNH HẠNG (PLACEMENT)
  if (gamesPlayed < placementGames) {
    return {
      kind: 'placement',
      gamesPlayed,
      gamesNeeded: placementGames,
    };
  }

  // 2. LUẬT b & c: GIAI ĐOẠN ĐÃ CÓ RANK & XÉT DUYỆT KHIÊN BẢO VỆ
  const currentTier = getTierByRating(rating);
  const progress = getTierProgress(rating);

  let shield = false;
  let displayTier = currentTier;

  if (lastMatch) {
    const { ratingBefore, ratingAfter } = lastMatch;

    // Điều kiện: Vừa bị trừ điểm AND điểm hiện tại đúng bằng điểm sau trận đó
    if (ratingAfter < ratingBefore && rating === ratingAfter) {
      const tierBefore = getTierByRating(ratingBefore);
      const tierAfter = getTierByRating(ratingAfter);

      const indexBefore = TIER_TABLE.findIndex((t) => t.id === tierBefore.id);
      const indexAfter = TIER_TABLE.findIndex((t) => t.id === tierAfter.id);

      // Nếu trận này trực tiếp làm rớt từ bậc trên xuống bậc dưới
      if (indexBefore > indexAfter) {
        shield = true;
        displayTier = tierBefore;
      }
    }
  }

  return {
    kind: 'ranked',
    tier: currentTier,
    progress,
    shield,
    displayTier,
  };
}
