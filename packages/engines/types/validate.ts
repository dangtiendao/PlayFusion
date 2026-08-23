import type { GameDefinition } from './game-definition.ts';

/**
 * ==============================================================================
 * HÀM KIỂM ĐỊNH TỜ KHAI NĂNG LỰC GAME (GAME DEFINITION VALIDATOR)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Đây là hàm thuần (Pure function), không có side-effect.
 * - Sẽ được gọi bởi Registry tập trung ở Phase P0.7 ngay lúc khởi động ứng dụng (hoặc trong unit tests)
 *   để thực hiện cơ chế Fail-Fast: Phát hiện ngay lập tức các sai sót khai báo manifest trước khi game chạy.
 * ==============================================================================
 */

const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Kiểm tra tính hợp lệ và toàn vẹn logic của một đối tượng GameDefinition.
 *
 * @param def Tờ khai GameDefinition cần kiểm tra.
 * @returns Mảng danh sách các thông báo lỗi phát hiện được (rỗng nếu hoàn toàn hợp lệ).
 */
export function validateGameDefinition(def: GameDefinition): string[] {
  const errors: string[] = [];

  // 1. Kiểm tra định dạng ID (kebab-case bất biến)
  if (!def.id || !KEBAB_CASE_REGEX.test(def.id)) {
    errors.push(
      `ID game "${def.id || ''}" không hợp lệ. ID phải có định dạng kebab-case viết thường (ví dụ: 'caro', 'co-tuong').`,
    );
  }

  // 2. Kiểm tra tên và mô tả
  if (!def.name || def.name.trim().length === 0) {
    errors.push(`Game "${def.id}": Tên trò chơi (name) không được để trống.`);
  }
  if (!def.description || def.description.trim().length === 0) {
    errors.push(`Game "${def.id}": Mô tả trò chơi (description) không được để trống.`);
  }

  // 3. Kiểm tra cấu hình số lượng người chơi (players)
  if (def.players.min < 1) {
    errors.push(
      `Game "${def.id}": Số người chơi tối thiểu (players.min = ${def.players.min}) phải lớn hơn hoặc bằng 1.`,
    );
  }
  if (def.players.min > def.players.max) {
    errors.push(
      `Game "${def.id}": Số người chơi tối thiểu (${def.players.min}) không được lớn hơn số người chơi tối đa (${def.players.max}).`,
    );
  }

  // 4. Kiểm tra danh sách chế độ chơi (modes)
  if (!def.modes || def.modes.length === 0) {
    errors.push(`Game "${def.id}": Danh sách chế độ chơi (modes) không được để trống.`);
  }

  // 5. Kiểm tra logic Chơi với máy ('vs_ai'): Bắt buộc phải có danh sách aiLevels
  if (def.modes?.includes('vs_ai')) {
    if (!def.aiLevels || def.aiLevels.length === 0) {
      errors.push(
        `Game "${def.id}": Khai báo có chế độ chơi với máy ('vs_ai') nhưng thiếu danh sách cấp độ AI (aiLevels).`,
      );
    }
  }

  // 6. Kiểm tra logic Tính điểm / Thời gian (scoring = 'score' | 'time'): Bắt buộc có scoreDirection
  if (def.scoring === 'score' || def.scoring === 'time') {
    if (!def.scoreDirection) {
      errors.push(
        `Game "${def.id}": Trò chơi có phương thức tính điểm '${def.scoring}' nhưng thiếu cấu hình chiều sắp xếp (scoreDirection: 'asc' hoặc 'desc').`,
      );
    }
  }

  // 7. Kiểm tra logic Xếp hạng (ranked): Game ranked online đối kháng không được để ratingSystem = 'leaderboard_only'
  if (def.ranked) {
    const hasOnlineCompetitive = def.modes?.some(
      (m) => m === 'online_1v1' || m === 'online_ffa' || m === 'online_team',
    );
    if (hasOnlineCompetitive && def.ratingSystem === 'leaderboard_only') {
      errors.push(
        `Game "${def.id}": Trò chơi có chế độ đấu xếp hạng online (ranked = true) nhưng lại dùng hệ thống xếp hạng 'leaderboard_only'. Phải sử dụng 'elo' hoặc 'glicko2'.`,
      );
    }
  }

  // 8. Kiểm tra thời lượng trung bình ván đấu (avgMatchSeconds)
  if (typeof def.avgMatchSeconds !== 'number' || def.avgMatchSeconds <= 0) {
    errors.push(
      `Game "${def.id}": Thời lượng trung bình ván đấu (avgMatchSeconds = ${def.avgMatchSeconds}) phải là số dương hợp lệ.`,
    );
  }

  // 9. Kiểm tra hàm loadEngine
  if (typeof def.loadEngine !== 'function') {
    errors.push(`Game "${def.id}": Hàm nạp engine (loadEngine) phải là một hàm Promise hợp lệ.`);
  }

  return errors;
}
