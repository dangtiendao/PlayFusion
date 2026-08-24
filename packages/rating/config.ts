/**
 * packages/rating/config.ts
 *
 * Module phân tích và chuyển đổi cấu hình Elo từ Database (system_config) sang đối tượng EloConfig.
 * Áp dụng nguyên tắc Fail-Soft: Tuyệt đối KHÔNG throw Error khi cấu hình hỏng hoặc thiếu,
 * tự động sử dụng giá trị DEFAULT_ELO_CONFIG cho các trường lỗi và trả về mảng warnings để ghi log.
 */

import { type EloConfig, DEFAULT_ELO_CONFIG } from './types.ts';

/**
 * Kết quả phân tích cấu hình Elo từ Database.
 */
export interface ParsedEloConfigResult {
  /**
   * Cấu hình Elo đã được chuẩn hóa và sẵn sàng sử dụng cho các hàm tính điểm.
   */
  readonly config: EloConfig;

  /**
   * Danh sách các cảnh báo (nếu có) khi phát hiện key thiếu hoặc không đúng định dạng.
   * Edge Function `settle_match` có thể ghi mảng này vào `audit_logs` hoặc console.
   */
  readonly warnings: readonly string[];
}

/**
 * Phân tích đối tượng thô từ bảng `system_config` (các key có tiền tố `elo.*`)
 * thành đối tượng `EloConfig` hoàn chỉnh.
 *
 * Định dạng mong đợi từ `system_config` (đã seed ở Migration 0008):
 * - `elo.k_placement`: `{"k": 60}`
 * - `elo.k_normal`: `{"k": 32}`
 * - `elo.k_high`: `{"k": 16, "threshold": 2000}`
 *
 * NỢ KỸ THUẬT:
 * - 3 thuộc tính `placementGames`, `mismatchThreshold`, `mismatchDampen` hiện chưa được seed
 *   riêng trong DB `system_config`, hàm sẽ lấy giá trị mặc định chuẩn từ `DEFAULT_ELO_CONFIG`.
 *   Đề xuất xem xét tạo migration seed 3 key này ở Phase P4.2 nếu cần thay đổi runtime không qua deploy.
 *
 * @param rows Bản ghi key-value lấy từ database `system_config` (Record<string, unknown>)
 * @returns Đối tượng `ParsedEloConfigResult` gồm `config` và `warnings`
 */
export function parseEloConfig(rows: Record<string, unknown>): ParsedEloConfigResult {
  const warnings: string[] = [];

  // 1. Phân giải elo.k_placement
  let kPlacement = DEFAULT_ELO_CONFIG.kPlacement;
  const rawPlacement = rows['elo.k_placement'];
  if (
    typeof rawPlacement === 'object' &&
    rawPlacement !== null &&
    'k' in rawPlacement &&
    typeof (rawPlacement as { k?: unknown }).k === 'number' &&
    Number.isFinite((rawPlacement as { k: number }).k) &&
    (rawPlacement as { k: number }).k > 0
  ) {
    kPlacement = (rawPlacement as { k: number }).k;
  } else {
    warnings.push(
      `Cấu hình 'elo.k_placement' không hợp lệ hoặc bị thiếu (${JSON.stringify(rawPlacement)}), sử dụng mặc định: ${kPlacement}.`,
    );
  }

  // 2. Phân giải elo.k_normal
  let kNormal = DEFAULT_ELO_CONFIG.kNormal;
  const rawNormal = rows['elo.k_normal'];
  if (
    typeof rawNormal === 'object' &&
    rawNormal !== null &&
    'k' in rawNormal &&
    typeof (rawNormal as { k?: unknown }).k === 'number' &&
    Number.isFinite((rawNormal as { k: number }).k) &&
    (rawNormal as { k: number }).k > 0
  ) {
    kNormal = (rawNormal as { k: number }).k;
  } else {
    warnings.push(
      `Cấu hình 'elo.k_normal' không hợp lệ hoặc bị thiếu (${JSON.stringify(rawNormal)}), sử dụng mặc định: ${kNormal}.`,
    );
  }

  // 3. Phân giải elo.k_high (k và threshold)
  let kHigh = DEFAULT_ELO_CONFIG.kHigh;
  let highRatingThreshold = DEFAULT_ELO_CONFIG.highRatingThreshold;
  const rawHigh = rows['elo.k_high'];
  if (typeof rawHigh === 'object' && rawHigh !== null) {
    const obj = rawHigh as { k?: unknown; threshold?: unknown };

    if (typeof obj.k === 'number' && Number.isFinite(obj.k) && obj.k > 0) {
      kHigh = obj.k;
    } else {
      warnings.push(
        `Cột 'k' trong 'elo.k_high' không hợp lệ (${JSON.stringify(obj.k)}), sử dụng mặc định: ${kHigh}.`,
      );
    }

    if (typeof obj.threshold === 'number' && Number.isFinite(obj.threshold) && obj.threshold > 0) {
      highRatingThreshold = obj.threshold;
    } else {
      warnings.push(
        `Cột 'threshold' trong 'elo.k_high' không hợp lệ (${JSON.stringify(obj.threshold)}), sử dụng mặc định: ${highRatingThreshold}.`,
      );
    }
  } else {
    warnings.push(
      `Cấu hình 'elo.k_high' không hợp lệ hoặc bị thiếu (${JSON.stringify(rawHigh)}), sử dụng mặc định k=${kHigh}, threshold=${highRatingThreshold}.`,
    );
  }

  // 4. Các cấu hình mở rộng (nếu tương lai seed thêm key)
  const placementGames = DEFAULT_ELO_CONFIG.placementGames;
  const mismatchThreshold = DEFAULT_ELO_CONFIG.mismatchThreshold;
  const mismatchDampen = DEFAULT_ELO_CONFIG.mismatchDampen;

  const config: EloConfig = Object.freeze({
    kPlacement,
    kNormal,
    kHigh,
    highRatingThreshold,
    placementGames,
    mismatchThreshold,
    mismatchDampen,
  });

  return {
    config,
    warnings: Object.freeze(warnings),
  };
}
