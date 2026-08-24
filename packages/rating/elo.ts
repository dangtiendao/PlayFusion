/**
 * packages/rating/elo.ts
 *
 * Module tính toán điểm xếp hạng Elo 1v1 với Hệ số K động (Dynamic K-Factor).
 * Đảm bảo: Pure TypeScript, Deterministic 100%, Zero Side-effect, Không phụ thuộc DB.
 */

import {
  type EloConfig,
  type MatchScore,
  type PairUpdateResult,
  type PlayerRatingInput,
  DEFAULT_ELO_CONFIG,
} from './types.ts';

/**
 * Tính điểm kỳ vọng chiến thắng (Expected Score) của Player A trước Player B theo công thức chuẩn Elo:
 *
 *   E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))
 *
 * @param ratingA Điểm rank của Player A
 * @param ratingB Điểm rank của Player B
 * @returns Điểm kỳ vọng trong khoảng (0, 1) - TUYỆT ĐỐI KHÔNG làm tròn tại đây để giữ độ chính xác tối đa.
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  if (!Number.isFinite(ratingA) || !Number.isFinite(ratingB)) {
    throw new RangeError(
      `Rating phải là số hữu hạn hợp lệ. Nhận được: ratingA=${ratingA}, ratingB=${ratingB}`,
    );
  }
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * ==============================================================================
 * THỨ TỰ ƯU TIÊN PHÂN GIẢI HỆ SỐ K (CHỐT CỨNG - BẤT BIẾN)
 * ==============================================================================
 *
 * 1. [Giai đoạn định hạng - Placement]: Nếu `gamesPlayed < config.placementGames` (15 trận)
 *    -> Áp dụng `kPlacement` (60) để điểm rank hội tụ nhanh về trình độ thực tế.
 *    -> ĐÂY LÀ ƯU TIÊN CAO NHẤT (kể cả khi người chơi có rating >= 2000).
 *
 * 2. [Ngưỡng cao thủ - High Rating]: Nếu `rating >= config.highRatingThreshold` (2000)
 *    -> Áp dụng `kHigh` (16) để điểm rank của nhóm đỉnh cao ổn định, chống lạm phát.
 *
 * 3. [Người chơi thông thường - Normal]:
 *    -> Áp dụng `kNormal` (32).
 *
 * 4. [Cơ chế giảm K chống cày điểm - Mismatch Dampening]:
 *    -> SAU KHI đã xác định K cơ sở từ các bước (1-3):
 *    -> Nếu |rating - opponentRating| > mismatchThreshold (400 điểm)
 *       VÀ người chơi này là BÊN MẠNH HƠN (`rating > opponentRating`):
 *       -> K = baseK * config.mismatchDampen (giảm 50% K).
 *    -> QUYẾT ĐỊNH THIẾT KẾ: Chỉ giảm K của bên mạnh để triệt tiêu hành vi săn người
 *       yếu cày điểm (farming). Tuyệt đối KHÔNG giảm K của bên yếu khi họ dám đối đầu
 *       với cao thủ (nếu thắng ngược, bên yếu vẫn nhận trọn vẹn điểm thưởng).
 *
 * @param player Thông tin đấu thủ (rating, gamesPlayed)
 * @param opponentRating Điểm rank của đối thủ
 * @param config Cấu hình hệ số Elo
 * @returns Hệ số K thực tế áp dụng cho người chơi
 */
export function resolveK(
  player: PlayerRatingInput,
  opponentRating: number,
  config: EloConfig = DEFAULT_ELO_CONFIG,
): number {
  if (!Number.isFinite(player.rating) || player.rating < 0) {
    throw new RangeError(`Rating của người chơi phải là số không âm. Nhận được: ${player.rating}`);
  }
  if (!Number.isFinite(player.gamesPlayed) || player.gamesPlayed < 0) {
    throw new RangeError(`Số trận đã chơi phải là số không âm. Nhận được: ${player.gamesPlayed}`);
  }
  if (!Number.isFinite(opponentRating) || opponentRating < 0) {
    throw new RangeError(`Rating của đối thủ phải là số không âm. Nhận được: ${opponentRating}`);
  }

  // Bước 1: Xác định K cơ sở theo thứ tự ưu tiên Placement > High > Normal
  let baseK: number;
  if (player.gamesPlayed < config.placementGames) {
    baseK = config.kPlacement;
  } else if (player.rating >= config.highRatingThreshold) {
    baseK = config.kHigh;
  } else {
    baseK = config.kNormal;
  }

  // Bước 2: Giảm K cho bên mạnh hơn khi chênh lệch vượt ngưỡng mismatchThreshold (400)
  const ratingDiff = Math.abs(player.rating - opponentRating);
  const isStronger = player.rating > opponentRating;

  if (ratingDiff > config.mismatchThreshold && isStronger) {
    return baseK * config.mismatchDampen;
  }

  return baseK;
}

/**
 * ==============================================================================
 * TÍNH TOÁN CẬP NHẬT ĐIỂM ELO 1V1 (updatePair)
 * ==============================================================================
 *
 * Công thức:
 *   deltaA = Math.round(kA * (scoreA - expectedA))
 *   deltaB = Math.round(kB * (scoreB - expectedB))
 *
 * QUY TẮC LÀM TRÒN & BẢO TOÀN ĐIỂM (CHỐT CỨNG):
 * - Mỗi delta được làm tròn độc lập bằng `Math.round`.
 * - Khi kA !== kB (ví dụ người mới đấu với người cũ), tổng delta của 2 bên sẽ KHÔNG
 *   bằng 0 (Non Zero-Sum). ĐÂY LÀ ĐẶC TÍNH CÓ CHỦ ĐÍCH CỦA HỆ THỐNG để người mới hội tụ
 *   nhanh mà không làm bóp méo điểm số của người chơi hiện hữu.
 * - Khi kA === kB, tổng delta có thể lệch ±1 do sai số làm tròn số nguyên (`Math.round`).
 *
 * QUY TẮC SÀN/TRẦN ĐIỂM SỐ:
 * - Module này trả về số thực tế thuần túy (`newRating = rating + delta`).
 * - Việc giới hạn sàn điểm (ví dụ: không tụt dưới 0 hoặc 100) là chính sách thuộc
 *   trách nhiệm của tầng kết toán trận đấu `settle_match` ở Phase P4.2.
 *
 * @param a Đấu thủ A
 * @param b Đấu thủ B
 * @param scoreA Kết quả ván đấu (1: A thắng, 0.5: Hòa, 0: A thua)
 * @param config Cấu hình Elo (mặc định lấy DEFAULT_ELO_CONFIG)
 * @returns Kết quả cập nhật điểm của cả 2 đấu thủ
 */
export function updatePair(
  a: PlayerRatingInput,
  b: PlayerRatingInput,
  scoreA: MatchScore,
  config: EloConfig = DEFAULT_ELO_CONFIG,
): PairUpdateResult {
  // 1. Kiểm tra tính hợp lệ của đầu vào (Fail-Fast)
  if (scoreA !== 1 && scoreA !== 0.5 && scoreA !== 0) {
    throw new RangeError(
      `Điểm trận đấu (scoreA) phải là 1 (thắng), 0.5 (hòa), hoặc 0 (thua). Nhận được: ${scoreA}`,
    );
  }

  // 2. Tính điểm kỳ vọng
  const expA = expectedScore(a.rating, b.rating);
  const expB = 1 - expA;

  // 3. Phân giải hệ số K cho từng bên
  const kA = resolveK(a, b.rating, config);
  const kB = resolveK(b, a.rating, config);

  // 4. Tính toán delta điểm số
  const deltaA = Math.round(kA * (scoreA - expA));
  const scoreB: MatchScore = (1 - scoreA) as MatchScore;
  const deltaB = Math.round(kB * (scoreB - expB));

  // 5. Tính điểm mới (không áp đặt sàn/trần ở tầng module toán học)
  const newRatingA = a.rating + deltaA;
  const newRatingB = b.rating + deltaB;

  // 6. Làm tròn kỳ vọng 4 chữ số thập phân cho mục đích hiển thị/debug
  const expectedARounded = Math.round(expA * 10000) / 10000;

  return {
    deltaA,
    deltaB,
    newRatingA,
    newRatingB,
    kA,
    kB,
    expectedA: expectedARounded,
  };
}
