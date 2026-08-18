import { caroManifest } from '@engines/caro/manifest';
import { dummyManifest } from '@engines/dummy/manifest';
import { dummy2Manifest } from '@engines/dummy2/manifest';
import { validateGameDefinition, type GameCategory } from '@engines/types';
import type { RegistryEntry } from './types';

/**
 * ==============================================================================
 * GAME REGISTRY (NGUỒN CHÂN LÝ DUY NHẤT VỀ DANH SÁCH TRÒ CHƠI)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & NGUYÊN TẮC BẤT BIẾN:
 *
 * 1. NGUYÊN TẮC "THÊM GAME MỚI = 1 DÒNG":
 *    - Toàn bộ hệ thống (Sảnh Menu, Dynamic Router `/game/:gameId`, Thống kê, Shop)
 *      CHỈ đọc danh sách game từ module này.
 *    - Khi bổ sung một game mới (ví dụ Caro P1.1), kỹ sư chỉ cần thêm 1 entry vào mảng `GAMES`.
 *
 * 2. CƠ CHẾ VALIDATION FAIL-FAST:
 *    - Hàm `assertRegistryValid()` được tự động thực thi ngay khi module này được import lần đầu.
 *    - Nếu có bất kỳ manifest nào sai sót hoặc trùng lặp ID, ứng dụng dev sẽ văng lỗi ngay lập tức
 *      (fail-fast), ngăn chặn 100% việc lọt lỗi logic cấu hình lên production.
 * ==============================================================================
 */

/**
 * Danh sách đăng ký toàn bộ các trò chơi có sẵn trong hệ thống PlayFusion.
 */
export const GAMES: readonly RegistryEntry[] = [
  {
    definition: caroManifest,
    loadView: () => import('./caro/View'),
  },
  {
    definition: dummyManifest,
    loadView: () => import('./dummy/View'),
  },
  {
    definition: dummy2Manifest,
    loadView: () => import('./dummy2/View'),
  },
] as const;

/**
 * Kiểm tra tính hợp lệ toàn diện của một danh sách RegistryEntry.
 *
 * @param entries Danh sách game cần kiểm tra (mặc định là `GAMES`).
 * @returns Mảng danh sách các thông báo lỗi phát hiện được.
 */
export function validateRegistry(entries: readonly RegistryEntry[] = GAMES): string[] {
  const errors: string[] = [];
  const registeredIds = new Set<string>();

  for (const entry of entries) {
    // 1. Kiểm tra đối tượng definition và loadView
    if (!entry || !entry.definition) {
      errors.push('Phát hiện bản ghi game thiếu đối tượng `definition`.');
      continue;
    }

    const gameId = entry.definition.id;

    // 2. Kiểm tra trùng lặp ID
    if (registeredIds.has(gameId)) {
      errors.push(
        `Phát hiện ID game bị trùng lặp: "${gameId}". Mỗi game bắt buộc phải có ID duy nhất.`,
      );
    } else {
      registeredIds.add(gameId);
    }

    // 3. Kiểm tra tính hợp lệ của manifest thông qua validator chuẩn
    const manifestErrors = validateGameDefinition(entry.definition);
    for (const manifestErr of manifestErrors) {
      errors.push(`[Game: ${gameId || 'UNKNOWN'}] ${manifestErr}`);
    }

    // 4. Kiểm tra hàm loadView
    if (typeof entry.loadView !== 'function') {
      errors.push(`[Game: ${gameId}] Hàm tải giao diện (loadView) phải là một hàm Promise hợp lệ.`);
    }
  }

  return errors;
}

/**
 * Hàm xác thực tính toàn vẹn của Registry theo cơ chế Fail-Fast.
 *
 * @param entries Danh sách game cần xác thực.
 * @throws {Error} Nếu phát hiện bất kỳ lỗi cấu hình hoặc trùng lặp ID nào.
 */
export function assertRegistryValid(entries: readonly RegistryEntry[] = GAMES): void {
  const errors = validateRegistry(entries);
  if (errors.length > 0) {
    const errorMessage = `[REGISTRY FAIL-FAST ERROR] Đăng ký danh mục trò chơi không hợp lệ:\n- ${errors.join('\n- ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

// ==============================================================================
// KHỞI ĐỘNG FAIL-FAST: Tự động chạy xác thực ngay khi module được nạp
// ==============================================================================
assertRegistryValid(GAMES);

/**
 * Tra cứu thông tin cấu hình và hàm nạp giao diện của một trò chơi theo `gameId`.
 *
 * @param id ID duy nhất của trò chơi (ví dụ: 'caro', 'dummy').
 * @returns `RegistryEntry` tương ứng hoặc `undefined` nếu không tìm thấy.
 */
export function getGameById(id: string): RegistryEntry | undefined {
  return GAMES.find((entry) => entry.definition.id === id);
}

/**
 * Lấy toàn bộ danh sách các trò chơi đã được đăng ký trong hệ thống.
 */
export function getAllGames(): readonly RegistryEntry[] {
  return GAMES;
}

/**
 * Lọc danh sách trò chơi theo thể loại (Category).
 *
 * @param category Thể loại trò chơi ('board', 'arcade', 'puzzle', 'skill', 'party').
 */
export function getGamesByCategory(category: GameCategory): readonly RegistryEntry[] {
  return GAMES.filter((game) => game.definition.category === category);
}
