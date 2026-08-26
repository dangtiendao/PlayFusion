/**
 * packages/rating/types.ts
 *
 * Định nghĩa hợp đồng types cho module tính điểm Elo & Xếp hạng.
 * Module này hoàn toàn thuần túy (Pure TypeScript, Zero DOM, Zero Framework, Zero DB).
 */

/**
 * Cấu hình hệ số Elo và các ngưỡng tính điểm.
 * Tham số này được tiêm vào từ bên ngoài (ở Phase P4.2, Edge Function `settle_match`
 * sẽ đọc từ bảng `system_config` trong database và truyền vào hàm tính).
 */
export interface EloConfig {
  /**
   * Hệ số K trong giai đoạn định hạng (tân thủ).
   * Nguồn: system_config key `elo.k_placement` (mặc định: 60).
   * Do P4.2 settle_match tiêm vào.
   */
  readonly kPlacement: number;

  /**
   * Hệ số K chuẩn cho người chơi thông thường đã hoàn thành định hạng.
   * Nguồn: system_config key `elo.k_normal` (mặc định: 32).
   * Do P4.2 settle_match tiêm vào.
   */
  readonly kNormal: number;

  /**
   * Hệ số K cho cao thủ có mức điểm rank cao.
   * Nguồn: system_config key `elo.k_high.k` (mặc định: 16).
   * Do P4.2 settle_match tiêm vào.
   */
  readonly kHigh: number;

  /**
   * Ngưỡng điểm rank để được xem là cao thủ và áp dụng `kHigh`.
   * Nguồn: system_config key `elo.k_high.threshold` (mặc định: 2000).
   * Do P4.2 settle_match tiêm vào.
   */
  readonly highRatingThreshold: number;

  /**
   * Số trận đấu trong giai đoạn định hạng (placement).
   * Nếu `gamesPlayed < placementGames` -> áp dụng `kPlacement`.
   * Mặc định: 15 trận.
   * Do P4.2 settle_match tiêm vào.
   */
  readonly placementGames: number;

  /**
   * Ngưỡng chênh lệch điểm rank giữa 2 người chơi để kích hoạt cơ chế giảm K (anti-farming).
   * Mặc định: 400 điểm.
   * Do P4.2 settle_match tiêm vào.
   */
  readonly mismatchThreshold: number;

  /**
   * Tỷ lệ giảm hệ số K cho bên mạnh hơn khi chênh lệch điểm rank > `mismatchThreshold`.
   * Mặc định: 0.5 (giảm 50% K).
   * Do P4.2 settle_match tiêm vào.
   */
  readonly mismatchDampen: number;
}

/**
 * Số trận đấu yêu cầu mặc định trong giai đoạn định hạng (placement games).
 * Giá trị này đồng bộ với key `elo.placement_games` trong DB `system_config` (mặc định: 15).
 */
export const PLACEMENT_GAMES_DEFAULT = 15;

/**
 * Cấu hình Elo mặc định dùng làm giá trị dự phòng (fallback)
 * khi cấu hình DB `system_config` bị thiếu hoặc lỗi kết nối.
 *
 * Khớp 100% với dữ liệu đã seed trong migration `0008_admin_ops.sql`.
 */
export const DEFAULT_ELO_CONFIG: EloConfig = Object.freeze({
  kPlacement: 60,
  kNormal: 32,
  kHigh: 16,
  highRatingThreshold: 2000,
  placementGames: PLACEMENT_GAMES_DEFAULT,
  mismatchThreshold: 400,
  mismatchDampen: 0.5,
});

/**
 * Thông tin đầu vào của một đấu thủ tham gia tính điểm Elo.
 */
export interface PlayerRatingInput {
  /**
   * Điểm rank hiện tại của người chơi (trước trận đấu).
   * Ví dụ: 1200, 1500, 2050.
   */
  readonly rating: number;

  /**
   * Tổng số trận người chơi đã tham gia trong mùa giải hiện tại.
   * Dùng để xác định giai đoạn định hạng (`gamesPlayed < placementGames`).
   */
  readonly gamesPlayed: number;
}

/**
 * Điểm số thực tế của trận đấu đối kháng theo góc nhìn của Player A:
 * - `1`: Thắng ván đấu.
 * - `0.5`: Hòa ván đấu.
 * - `0`: Thua ván đấu.
 */
export type MatchScore = 1 | 0.5 | 0;

/**
 * Kết quả tính toán cập nhật điểm Elo cho một cặp đấu 1v1.
 */
export interface PairUpdateResult {
  /**
   * Biến thiên điểm số của Player A (đã làm tròn `Math.round`).
   */
  readonly deltaA: number;

  /**
   * Biến thiên điểm số của Player B (đã làm tròn `Math.round`).
   */
  readonly deltaB: number;

  /**
   * Điểm rank mới của Player A sau khi cộng/trừ delta (`ratingA + deltaA`).
   */
  readonly newRatingA: number;

  /**
   * Điểm rank mới của Player B sau khi cộng/trừ delta (`ratingB + deltaB`).
   */
  readonly newRatingB: number;

  /**
   * Hệ số K thực tế đã áp dụng cho Player A.
   */
  readonly kA: number;

  /**
   * Hệ số K thực tế đã áp dụng cho Player B.
   */
  readonly kB: number;

  /**
   * Điểm kỳ vọng chiến thắng của Player A (làm tròn 4 chữ số thập phân phục vụ debug/hiển thị).
   */
  readonly expectedA: number;
}
