/**
 * ==============================================================================
 * KIỂM THỬ NGUYÊN THỦY RATING MODULE TRONG DENO (SUPABASE/FUNCTIONS/TESTS/RATING-IN-DENO.TEST.TS)
 * ==============================================================================
 *
 * BẰNG CHỨNG KIẾN TRÚC 3 MÔI TRƯỜNG:
 * - Module Rating TypeScript thuần túy (`packages/rating`) chạy NGUYÊN VẸN trên Deno Runtime
 *   mà không cần build step hay sửa đổi bất kỳ dòng code nào.
 * - Chạy bằng lệnh: `deno test supabase/functions/tests/` (hoặc `npm run test:deno`).
 * ==============================================================================
 */

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      msg || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`,
    );
  }
}

import {
  expectedScore,
  resolveK,
  updatePair,
  updateFfa,
  parseEloConfig,
  DEFAULT_ELO_CONFIG,
} from '../../../packages/rating/index.ts';

Deno.test('1. [Deno Rating] 1v1 Vector b: 1200 vs 1400, cửa dưới thắng -> delta +24 / -24', () => {
  const a = { rating: 1200, gamesPlayed: 30 };
  const b = { rating: 1400, gamesPlayed: 30 };

  assertEquals(resolveK(a, b.rating), 32);
  assertEquals(Math.round(expectedScore(a.rating, b.rating) * 10000) / 10000, 0.2403);

  const result = updatePair(a, b, 1);

  assertEquals(result.kA, 32);
  assertEquals(result.kB, 32);
  assertEquals(result.expectedA, 0.2403);
  assertEquals(result.deltaA, 24);
  assertEquals(result.deltaB, -24);
  assertEquals(result.newRatingA, 1224);
  assertEquals(result.newRatingB, 1376);
});

Deno.test(
  '2. [Deno Rating] 1v1 Vector e: Người mới (3 trận, 1200) vs Thường -> delta +30 / -16',
  () => {
    const a = { rating: 1200, gamesPlayed: 3 };
    const b = { rating: 1200, gamesPlayed: 30 };

    const result = updatePair(a, b, 1);

    assertEquals(result.kA, 60);
    assertEquals(result.kB, 32);
    assertEquals(result.expectedA, 0.5);
    assertEquals(result.deltaA, 30);
    assertEquals(result.deltaB, -16);
    assertEquals(result.newRatingA, 1230);
    assertEquals(result.newRatingB, 1184);
  },
);

Deno.test(
  '3. [Deno Rating] 1v1 Vector g: Chênh > 400 (1700 vs 1250) -> K_A giảm 50%, delta +1 / -2',
  () => {
    const a = { rating: 1700, gamesPlayed: 30 };
    const b = { rating: 1250, gamesPlayed: 30 };

    const result = updatePair(a, b, 1);

    assertEquals(result.kA, 16); // 32 * 0.5
    assertEquals(result.kB, 32); // Bên yếu giữ nguyên
    assertEquals(result.expectedA, 0.9302);
    assertEquals(result.deltaA, 1);
    assertEquals(result.deltaB, -2);
    assertEquals(result.newRatingA, 1701);
    assertEquals(result.newRatingB, 1248);
  },
);

Deno.test('4. [Deno Rating] FFA 3 người cùng 1200: hạng 1/2/3 -> delta +16, 0, -16', () => {
  const participants = [
    { id: 'user_1', rating: 1200, gamesPlayed: 30, placement: 1 },
    { id: 'user_2', rating: 1200, gamesPlayed: 30, placement: 2 },
    { id: 'user_3', rating: 1200, gamesPlayed: 30, placement: 3 },
  ];

  const results = updateFfa(participants);

  assertEquals(results.length, 3);
  assertEquals(results[0], { id: 'user_1', delta: 16, newRating: 1216, k: 32 });
  assertEquals(results[1], { id: 'user_2', delta: 0, newRating: 1200, k: 32 });
  assertEquals(results[2], { id: 'user_3', delta: -16, newRating: 1184, k: 32 });
});

Deno.test('5. [Deno Rating] parseEloConfig chuẩn hóa dữ liệu system_config và fail-soft', () => {
  // Chuẩn từ DB
  const validRows = {
    'elo.k_placement': { k: 60 },
    'elo.k_normal': { k: 32 },
    'elo.k_high': { k: 16, threshold: 2000 },
  };
  const parsed = parseEloConfig(validRows);
  assertEquals(parsed.config, DEFAULT_ELO_CONFIG);
  assertEquals(parsed.warnings.length, 0);

  // Thiếu key -> fail-soft
  const brokenRows = {
    'elo.k_placement': { k: -5 },
  };
  const fallback = parseEloConfig(brokenRows);
  assertEquals(fallback.config.kPlacement, 60);
  assertEquals(fallback.warnings.length >= 2, true);
});
