/**
 * packages/rating/ffa.ts
 *
 * Module tính toán điểm xếp hạng Elo cho trận đấu nhiều người chơi (Free-For-All - FFA).
 * Phương pháp: Phân rã trận N người thành các cặp 1v1 đối xứng (Pairwise Decomposition).
 * Đảm bảo: Pure TypeScript, Deterministic 100%, Zero Side-effect, Không phụ thuộc DB.
 */

import { expectedScore, resolveK } from './elo.ts';
import { type EloConfig, type PlayerRatingInput, DEFAULT_ELO_CONFIG } from './types.ts';

/**
 * Thông tin của một đấu thủ trong trận đấu nhiều người chơi (FFA).
 */
export interface FfaParticipant extends PlayerRatingInput {
  /**
   * Định danh duy nhất của người chơi trong trận đấu (ví dụ: `user_id`, `seat_index`, uuid...).
   * Module chỉ dùng trường này để map kết quả trả về đúng người, không hiểu ngữ nghĩa nội dung `id`.
   */
  readonly id: string;

  /**
   * Thứ hạng thực tế của người chơi sau khi ván đấu kết thúc (bắt đầu từ 1: hạng Nhất).
   * Cho phép nhiều người chơi có cùng thứ hạng (đồng hạng - Tie).
   * Ví dụ: hạng 1, hạng 2, hạng 3...
   */
  readonly placement: number;
}

/**
 * Kết quả tính toán biến thiên điểm rank cho một đấu thủ trong trận FFA.
 */
export interface FfaUpdateResult {
  /**
   * Định danh của người chơi (khớp với `id` đầu vào).
   */
  readonly id: string;

  /**
   * Biến thiên điểm số của người chơi (đã làm tròn `Math.round`).
   */
  readonly delta: number;

  /**
   * Điểm rank mới của người chơi sau trận đấu (`rating + delta`).
   */
  readonly newRating: number;

  /**
   * Hệ số K thực tế đã áp dụng cho người chơi này.
   */
  readonly k: number;
}

/**
 * ==============================================================================
 * TÍNH TOÁN CẬP NHẬT ĐIỂM ELO TRẬN NHIỀU NGƯỜI (updateFfa)
 * ==============================================================================
 *
 * Công thức phân rã cặp:
 *
 *   delta_A = Math.round( (K_A / (N - 1)) * SUM_{B != A} (S_AB - E_AB) )
 *
 * Trong đó:
 * - N: Tổng số người chơi trong trận đấu (N >= 2).
 * - S_AB: Điểm trận đối kháng giữa cặp (A, B):
 *     + 1.0 : A xếp trên B (placement_A < placement_B)
 *     + 0.5 : A đồng hạng với B (placement_A === placement_B)
 *     + 0.0 : A xếp dưới B (placement_A > placement_B)
 * - E_AB: Kỳ vọng chiến thắng của A trước B = expectedScore(R_A, R_B).
 * - K_A: Hệ số K của A được giải quyết dựa trên rating trung bình của (N - 1) đối thủ còn lại.
 *
 * QUYẾT ĐỊNH THIẾT KẾ TOÁN HỌC (CHỐT CỨNG):
 * 1. [Mismatch Dampen theo rating trung bình đối thủ]:
 *    - Đối thủ của A là tập thể (N - 1) người còn lại. Rating đối thủ = AVG(R_B).
 *    - Nếu R_A > AVG(R_B) + 400 -> K_A giảm 50% để chống cày farm bàn yếu.
 *    - Khi N = 2 (1v1), AVG(R_B) = R_B, suy biến hoàn hảo về logic 1v1.
 * 2. [Làm tròn 1 lần ở tổng cuối]:
 *    - Không làm tròn từng cặp 1v1 mà tính tổng tích lũy rồi làm tròn Math.round một lần duy nhất.
 *    - Giảm thiểu triệt để sai số làm tròn số nguyên khi N lớn (3, 4, 8 người).
 *    - Khi N = 2, công thức khớp tuyệt đối 100% với `updatePair` (sai số = 0).
 *
 * @param participants Danh sách người chơi tham gia trận đấu (tối thiểu 2 người)
 * @param config Cấu hình hệ số Elo (mặc định lấy DEFAULT_ELO_CONFIG)
 * @returns Mảng kết quả biến thiên điểm của từng người chơi, giữ nguyên thứ tự như mảng đầu vào
 */
export function updateFfa(
  participants: readonly FfaParticipant[],
  config: EloConfig = DEFAULT_ELO_CONFIG,
): FfaUpdateResult[] {
  const n = participants.length;

  // 1. Kiểm tra tính hợp lệ của đầu vào (Fail-Fast)
  if (n < 2) {
    throw new RangeError(`Trận đấu FFA phải có tối thiểu 2 người chơi. Nhận được: ${n}`);
  }

  const idSet = new Set<string>();
  for (let i = 0; i < n; i++) {
    const p = participants[i];
    if (!p) continue;

    if (!p.id || typeof p.id !== 'string') {
      throw new RangeError(`Định danh người chơi (id) phải là chuỗi không rỗng tại vị trí ${i}.`);
    }
    if (idSet.has(p.id)) {
      throw new RangeError(`Trùng lặp định danh người chơi: id="${p.id}" xuất hiện nhiều lần.`);
    }
    idSet.add(p.id);

    if (!Number.isFinite(p.placement) || p.placement < 1) {
      throw new RangeError(
        `Thứ hạng (placement) phải là số nguyên >= 1. Nhận được: ${p.placement} tại id="${p.id}".`,
      );
    }
    if (!Number.isFinite(p.rating) || p.rating < 0) {
      throw new RangeError(`Rating phải là số không âm. Nhận được: ${p.rating} tại id="${p.id}".`);
    }
    if (!Number.isFinite(p.gamesPlayed) || p.gamesPlayed < 0) {
      throw new RangeError(
        `Số trận đã chơi (gamesPlayed) phải là số không âm. Nhận được: ${p.gamesPlayed} tại id="${p.id}".`,
      );
    }
  }

  // 2. Tính toán điểm cho từng người chơi
  const results: FfaUpdateResult[] = [];

  for (let i = 0; i < n; i++) {
    const playerA = participants[i];
    if (!playerA) continue;

    // A. Tính rating trung bình của N - 1 đối thủ còn lại
    let opponentRatingSum = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const otherP = participants[j];
        if (otherP) {
          opponentRatingSum += otherP.rating;
        }
      }
    }
    const avgOpponentRating = opponentRatingSum / (n - 1);

    // B. Phân giải hệ số K của Player A theo đối thủ trung bình
    const kA = resolveK(playerA, avgOpponentRating, config);

    // C. Tính tổng chênh lệch điểm thực tế và kỳ vọng qua từng cặp đối thủ
    let totalScoreDiff = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const playerB = participants[j];
      if (!playerB) continue;

      // Xác định điểm đối đầu S_AB
      let scoreAB: number;
      if (playerA.placement < playerB.placement) {
        scoreAB = 1.0; // A xếp trên B
      } else if (playerA.placement === playerB.placement) {
        scoreAB = 0.5; // A đồng hạng B
      } else {
        scoreAB = 0.0; // A xếp dưới B
      }

      // Điểm kỳ vọng E_AB
      const expAB = expectedScore(playerA.rating, playerB.rating);

      totalScoreDiff += scoreAB - expAB;
    }

    // D. Tính delta điểm số: làm tròn 1 lần ở tổng cuối
    const deltaA = Math.round((kA / (n - 1)) * totalScoreDiff);
    const newRatingA = playerA.rating + deltaA;

    results.push({
      id: playerA.id,
      delta: deltaA,
      newRating: newRatingA,
      k: kA,
    });
  }

  return results;
}
