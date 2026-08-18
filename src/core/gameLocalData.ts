/**
 * ==============================================================================
 * GENERIC GAME LOCAL DATA MODULE (TẦNG DỮ LIỆU CỤC BỘ DÙNG CHUNG CHO MỌI GAME)
 * ==============================================================================
 *
 * ⚠️ QUY TẮC KIẾN TRÚC & TÍNH GENERIC BẤT BIẾN:
 * 1. `gameId` là một chiều dữ liệu (data dimension), TUYỆT ĐỐI không bao giờ là tên bảng/tên module.
 * 2. Module này KHÔNG import bất kỳ thành phần nào từ `src/games/`.
 * 3. Module này KHÔNG chứa bất kỳ từ khóa nào định danh riêng cho một game cụ thể.
 * 4. Mọi thao tác I/O bắt buộc phải đi qua wrapper an toàn `src/core/storage.ts` (prefix `wgh:v1:`).
 * 5. Tự phục hồi an toàn: Dữ liệu hỏng cấu trúc sẽ được dọn dẹp sạch và trả về giá trị mặc định / null.
 */

import { storage } from './storage';

/**
 * Các phân vùng dữ liệu cục bộ chuẩn cho mỗi game.
 */
export type GameDataSection =
  | 'stats' // Thống kê thành tích (tổng trận, thắng, thua, hòa, chuỗi) - P1.5a
  | 'lastConfig' // Cấu hình trận đấu gần nhất để vào nhanh - P1.5a
  | 'savedMatch' // Trạng thái ván chơi dở dang để khôi phục - P1.5b
  | 'history'; // Lịch sử các ván đấu gần nhất - P1.5c (Khai báo sẵn)

/**
 * Tạo key lưu trữ chuẩn có định danh theo gameId và phân vùng.
 * Quy ước key tạo ra: `game:{gameId}:{section}` (Wrapper storage sẽ tự thêm tiền tố `wgh:v1:`).
 *
 * @param gameId Mã định danh duy nhất của trò chơi (ví dụ: 'game_a', 'game_b', 'chess')
 * @param section Phân vùng dữ liệu cần truy xuất
 */
export function buildGameDataKey(gameId: string, section: GameDataSection): string {
  return `game:${gameId}:${section}`;
}

/**
 * Thống kê thành tích chi tiết theo từng chế độ chơi tự do.
 */
export interface GameModeStats {
  /** Tổng số trận đã đấu trong chế độ này */
  matches: number;
  /** Số trận thắng */
  wins: number;
  /** Số trận thua */
  losses: number;
  /** Số trận hòa */
  draws: number;
}

/**
 * Cấu trúc dữ liệu thống kê thành tích cục bộ của một trò chơi.
 */
export interface GameLocalStats {
  /** Tổng số trận đã chơi trên tất cả các chế độ */
  totalMatches: number;
  /** Tổng số trận thắng */
  wins: number;
  /** Tổng số trận thua */
  losses: number;
  /** Tổng số trận hòa */
  draws: number;
  /**
   * Thống kê phân nhóm theo từng chế độ chơi tự do do Game tự định nghĩa (ví dụ: 'vs_ai:hard', 'local_pvp').
   * Module này không hiểu ngữ nghĩa của key, chỉ đóng vai trò phân nhóm và cộng dồn số liệu.
   */
  byMode: Record<string, GameModeStats>;
  /** Chuỗi trận thắng liên tiếp hiện tại */
  currentStreak: number;
  /** Chuỗi trận thắng liên tiếp kỷ lục (cao nhất) */
  bestStreak: number;
  /** Thời điểm cập nhật dữ liệu gần nhất (định dạng ISO string) */
  updatedAt: string;
}

/**
 * Kết quả trận đấu ghi nhận cho hồ sơ cá nhân của người chơi.
 * - 'win': Người chơi chiến thắng (tăng wins, tăng streak).
 * - 'loss': Người chơi thua trận (tăng losses, reset streak về 0).
 * - 'draw': Trận đấu kết thúc hòa (tăng draws, giữ nguyên streak).
 * - 'none': Trận đấu kết thúc nhưng là chế độ đối kháng nhiều người trên cùng máy (local PvP),
 *          chỉ tăng tổng số trận đã chơi, không tính win/loss cá nhân.
 */
export type MatchOutcomeType = 'win' | 'loss' | 'draw' | 'none';

/**
 * Cấu trúc dữ liệu ván đấu dở dang được tự động lưu cục bộ (P1.5b).
 */
export interface SavedMatch {
  /** Phiên bản schema của dữ liệu ván lưu. Đọc thấy version lạ -> tự động loại bỏ */
  schemaVersion: 1;
  /** Chuỗi trạng thái game engine được serialize thuần túy. Module này không hiểu nội dung */
  engineStateSerialized: string;
  /** Cấu hình trận đấu (ví dụ CaroMatchConfig). Game tự validate khi đọc */
  gameConfig: unknown;
  /** Dữ liệu phụ đi kèm phiên đấu (tỷ số phiên, seed, v.v.). Generic không ràng buộc ngữ nghĩa */
  sessionExtra?: unknown;
  /** Thời điểm lưu ván đấu (ISO string) */
  savedAt: string;
}

/**
 * Khởi tạo đối tượng thống kê mặc định ban đầu.
 */
export function createDefaultStats(): GameLocalStats {
  return {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    byMode: {},
    currentStreak: 0,
    bestStreak: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Kiểm tra tính hợp lệ về cấu trúc dữ liệu của GameLocalStats.
 */
function isValidStats(data: unknown): data is GameLocalStats {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const candidate = data as Record<string, unknown>;

  if (
    typeof candidate.totalMatches !== 'number' ||
    typeof candidate.wins !== 'number' ||
    typeof candidate.losses !== 'number' ||
    typeof candidate.draws !== 'number' ||
    typeof candidate.currentStreak !== 'number' ||
    typeof candidate.bestStreak !== 'number' ||
    typeof candidate.updatedAt !== 'string' ||
    !candidate.byMode ||
    typeof candidate.byMode !== 'object' ||
    Array.isArray(candidate.byMode)
  ) {
    return false;
  }

  return true;
}

/**
 * Kiểm tra tính hợp lệ về cấu trúc của đối tượng SavedMatch (P1.5b).
 */
function isValidSavedMatch(data: unknown): data is SavedMatch {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const candidate = data as Record<string, unknown>;

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.engineStateSerialized === 'string' &&
    candidate.engineStateSerialized.length > 0 &&
    candidate.gameConfig !== undefined &&
    candidate.gameConfig !== null &&
    typeof candidate.savedAt === 'string'
  );
}

/**
 * Đọc bảng thống kê thành tích của trò chơi từ bộ nhớ cục bộ.
 * Nếu dữ liệu chưa tồn tại hoặc bị hỏng cấu trúc, tự động trả về giá trị mặc định và dọn sạch key lỗi.
 *
 * @param gameId Mã định danh trò chơi
 * @returns Bảng thống kê GameLocalStats
 */
export function getStats(gameId: string): GameLocalStats {
  const key = buildGameDataKey(gameId, 'stats');
  const raw = storage.getItem<unknown>(key, null);

  if (raw === null || raw === undefined) {
    return createDefaultStats();
  }

  if (!isValidStats(raw)) {
    storage.removeItem(key);
    return createDefaultStats();
  }

  return raw;
}

/**
 * Ghi nhận kết quả của một trận đấu vừa kết thúc và cập nhật thống kê tích lũy.
 *
 * @param gameId Mã định danh trò chơi
 * @param modeKey Khóa phân nhóm chế độ chơi (do game tự đặt, ví dụ: 'vs_ai:hard', 'local_pvp')
 * @param outcome Kết quả trận đấu ('win' | 'loss' | 'draw' | 'none')
 * @returns Bảng thống kê mới nhất sau khi cập nhật
 */
export function recordResult(
  gameId: string,
  modeKey: string,
  outcome: MatchOutcomeType,
): GameLocalStats {
  const stats = getStats(gameId);

  // 1. Tăng tổng số trận
  stats.totalMatches += 1;

  // 2. Khởi tạo hoặc lấy phân nhóm theo mode
  if (!stats.byMode[modeKey]) {
    stats.byMode[modeKey] = {
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }

  const modeStats = stats.byMode[modeKey];
  modeStats.matches += 1;

  // 3. Cập nhật số liệu chi tiết theo kết quả
  switch (outcome) {
    case 'win':
      stats.wins += 1;
      modeStats.wins += 1;
      stats.currentStreak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      break;

    case 'loss':
      stats.losses += 1;
      modeStats.losses += 1;
      stats.currentStreak = 0;
      break;

    case 'draw':
      stats.draws += 1;
      modeStats.draws += 1;
      break;

    case 'none':
      break;
  }

  stats.updatedAt = new Date().toISOString();

  // 4. Lưu lại vào Storage
  storage.setItem(buildGameDataKey(gameId, 'stats'), stats);

  return stats;
}

/**
 * Lấy cấu hình ván đấu gần nhất của trò chơi.
 *
 * @param gameId Mã định danh trò chơi
 * @returns Cấu hình ván đấu hoặc null nếu chưa có
 */
export function getLastConfig<T>(gameId: string): T | null {
  const key = buildGameDataKey(gameId, 'lastConfig');
  return storage.getItem<T | null>(key, null);
}

/**
 * Lưu cấu hình ván đấu gần nhất của trò chơi để phục vụ tính năng vào nhanh ("Chơi ngay").
 *
 * @param gameId Mã định danh trò chơi
 * @param config Đối tượng cấu hình ván đấu của trò chơi
 */
export function setLastConfig<T>(gameId: string, config: T): void {
  const key = buildGameDataKey(gameId, 'lastConfig');
  storage.setItem(key, config);
}

/**
 * Lưu trạng thái ván đấu dở dang (Auto-save) của trò chơi vào Storage (P1.5b).
 *
 * @param gameId Mã định danh trò chơi
 * @param data Đối tượng SavedMatch chứa trạng thái serialize và cấu hình
 */
export function saveMatch(gameId: string, data: SavedMatch): void {
  const key = buildGameDataKey(gameId, 'savedMatch');
  storage.setItem(key, data);
}

/**
 * Lấy trạng thái ván đấu dở dang của trò chơi từ Storage (P1.5b).
 * Tự động validate schemaVersion và tính toàn vẹn. Nếu sai cấu trúc -> xóa key rác và trả null.
 *
 * @param gameId Mã định danh trò chơi
 * @returns Đối tượng SavedMatch hoặc null nếu không có hoặc bị hỏng
 */
export function getSavedMatch(gameId: string): SavedMatch | null {
  const key = buildGameDataKey(gameId, 'savedMatch');
  const raw = storage.getItem<unknown>(key, null);

  if (raw === null || raw === undefined) {
    return null;
  }

  if (!isValidSavedMatch(raw)) {
    storage.removeItem(key);
    return null;
  }

  return raw;
}

/**
 * Xóa trạng thái ván đấu dở dang đã lưu của trò chơi (P1.5b).
 * Sử dụng khi ván kết thúc, người chơi bấm "Ván mới", hoặc bỏ ván dở.
 *
 * @param gameId Mã định danh trò chơi
 */
export function clearSavedMatch(gameId: string): void {
  const key = buildGameDataKey(gameId, 'savedMatch');
  storage.removeItem(key);
}

/**
 * Xóa toàn bộ dữ liệu cục bộ của một trò chơi (Stats, Cấu hình, Ván dở, Lịch sử).
 * Sử dụng cho tính năng "Xóa dữ liệu game" hoặc khôi phục cài đặt gốc.
 *
 * @param gameId Mã định danh trò chơi
 */
export function clearGameData(gameId: string): void {
  storage.removeItem(buildGameDataKey(gameId, 'stats'));
  storage.removeItem(buildGameDataKey(gameId, 'lastConfig'));
  storage.removeItem(buildGameDataKey(gameId, 'savedMatch'));
  storage.removeItem(buildGameDataKey(gameId, 'history'));
}
