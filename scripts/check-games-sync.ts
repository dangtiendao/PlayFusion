/**
 * ==============================================================================
 * SCRIPT ĐỐI CHIẾU ĐỒNG BỘ: FRONTEND REGISTRY ↔ DATABASE GAMES SEED
 * ==============================================================================
 *
 * Mục tiêu:
 * - Chạy kiểm tra tĩnh (offline) trong CI/CD hoặc trước khi build/deploy.
 * - Đảm bảo mọi game hỗ trợ chế độ xếp hạng (ranked = true) trong Frontend Registry
 *   đều đã được khai báo và nạp seed tương ứng vào Database.
 * - Ngăn chặn lỗi runtime khi người chơi vào game ranked nhưng DB chưa có game_id.
 *
 * Ghi chú kiến trúc:
 * - Tiền thân của script đồng bộ tự động ở Phase P8.2.
 * - Script này KHÔNG kết nối mạng/DB thật trong CI để đảm bảo tốc độ và độ ổn định.
 * ==============================================================================
 */

import { getAllGames } from '../src/games/registry';
import type { GameDefinition } from '../packages/engines/types';

/**
 * Danh sách các game_id chính thức ĐÃ ĐƯỢC SEED vào cơ sở dữ liệu (0003_seed_initial.sql).
 * ⚠️ QUY TẮC BẢO TRÌ: Cập nhật danh sách này mỗi khi bổ sung seed game mới vào database.
 */
export const EXPECTED_SEEDED_GAMES: readonly string[] = [
  'caro', // Phase P1.1 / P2.2a
] as const;

export interface SyncCheckResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly rankedGamesCount: number;
  readonly totalGamesCount: number;
}

/**
 * Hàm kiểm tra tính toàn vẹn và đồng bộ giữa Registry và DB Seed.
 *
 * @param registryGames Danh sách game trong registry (mặc định lấy từ getAllGames)
 * @param seededIds Danh sách game_id đã được seed trong DB (mặc định EXPECTED_SEEDED_GAMES)
 */
export function validateRegistryDbSync(
  registryGames: readonly { definition: GameDefinition }[] = getAllGames(),
  seededIds: readonly string[] = EXPECTED_SEEDED_GAMES,
): SyncCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seededSet = new Set(seededIds);
  const registryIds = new Set<string>();

  let rankedCount = 0;

  for (const entry of registryGames) {
    const game = entry.definition;
    registryIds.add(game.id);

    if (game.ranked) {
      rankedCount++;
      // Game ranked BẮT BUỘC phải có trong DB seed để phục vụ ghi nhận matches và rating
      if (!seededSet.has(game.id)) {
        errors.push(
          `[LỖI ĐỒNG BỘ] Game "${game.name}" (id: '${game.id}') được cấu hình ranked=true trong Registry nhưng CHƯA ĐƯỢC SEED vào Database!`,
        );
      }
    } else {
      // Game không ranked (hoặc game giả lập test như dummy/dummy2)
      if (!seededSet.has(game.id)) {
        warnings.push(
          `[GHI CHÚ] Game "${game.name}" (id: '${game.id}') là game unranked/mock, không được seed vào Database.`,
        );
      }
    }
  }

  // Kiểm tra chiều ngược lại: DB seed có game nào không tồn tại trong frontend registry không
  for (const seededId of seededIds) {
    if (!registryIds.has(seededId)) {
      warnings.push(
        `[CẢNH BÁO] DB Seed có game_id '${seededId}' nhưng không tìm thấy trong Frontend Registry.`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rankedGamesCount: rankedCount,
    totalGamesCount: registryGames.length,
  };
}

/**
 * CLI Runner khi thực thi trực tiếp qua `npx tsx scripts/check-games-sync.ts`
 */
export function runSyncCheckCli(): void {
  console.log('🔍 Đang kiểm tra tính đồng bộ giữa Frontend Registry và Database Seed...');

  const result = validateRegistryDbSync();

  console.log(
    `📊 Thống kê: ${result.totalGamesCount} games trong Registry (${result.rankedGamesCount} ranked) | ${EXPECTED_SEEDED_GAMES.length} games trong DB Seed`,
  );

  if (result.warnings.length > 0) {
    console.log('\n⚠️ Cảnh báo / Ghi chú:');
    result.warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (!result.ok) {
    console.error('\n❌ PHÁT HIỆN LỖI ĐỒNG BỘ:');
    result.errors.forEach((err) => console.error(`  - ${err}`));
    console.error(
      '\n💡 Hướng khắc phục: Bổ sung game vào supabase/migrations/0003_seed_initial.sql và EXPECTED_SEEDED_GAMES.',
    );
    process.exit(1);
  }

  console.log(
    '\n✅ Đồng bộ hoàn hảo: Tất cả các game ranked trong Registry đều đã được seed vào Database!',
  );
}

// Chạy CLI nếu file được thực thi trực tiếp
if (process.argv[1]?.endsWith('check-games-sync.ts')) {
  runSyncCheckCli();
}
