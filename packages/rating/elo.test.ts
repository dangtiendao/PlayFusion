/**
 * packages/rating/elo.test.ts
 *
 * ==============================================================================
 * BẢNG SỐ LIỆU TÍNH TAY ĐỐI CHIẾU (HAND-CALCULATED BENCHMARK VECTORS)
 * ==============================================================================
 *
 * Công thức áp dụng:
 *   E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))
 *   E_B = 1 - E_A
 *   delta_A = round(K_A * (S_A - E_A))
 *   delta_B = round(K_B * (S_B - E_B))
 *
 * 1. Vector a (Cân bằng thường):
 *    - Input: R_A=1200, g_A=30 | R_B=1200, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: K_A=32, K_B=32
 *    - Kỳ vọng: E_A = 1 / (1 + 10^0) = 0.5000, E_B = 0.5000
 *    - Delta: delta_A = round(32 * (1 - 0.5)) = +16 | delta_B = round(32 * (0 - 0.5)) = -16
 *    - Điểm mới: R'_A = 1216, R'_B = 1184
 *
 * 2. Vector b (Yếu thắng mạnh):
 *    - Input: R_A=1200, g_A=30 | R_B=1400, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: K_A=32, K_B=32
 *    - Kỳ vọng: (1400 - 1200)/400 = 0.5 -> 10^0.5 ≈ 3.162278 -> E_A = 1/(1+3.162278) ≈ 0.240253
 *    - Delta: delta_A = round(32 * (1 - 0.240253)) = round(24.3119) = +24
 *             delta_B = round(32 * (0 - 0.759747)) = round(-24.3119) = -24
 *    - Điểm mới: R'_A = 1224, R'_B = 1376
 *
 * 3. Vector c (Yếu thua mạnh):
 *    - Input: R_A=1200, g_A=30 | R_B=1400, g_B=30 | S_A=0 (A thua)
 *    - Phân giải K: K_A=32, K_B=32
 *    - Kỳ vọng: E_A ≈ 0.240253, E_B ≈ 0.759747
 *    - Delta: delta_A = round(32 * (0 - 0.240253)) = round(-7.6881) = -8
 *             delta_B = round(32 * (1 - 0.759747)) = round(7.6881) = +8
 *    - Điểm mới: R'_A = 1192, R'_B = 1408
 *
 * 4. Vector d (Cửa dưới hòa):
 *    - Input: R_A=1200, g_A=30 | R_B=1400, g_B=30 | S_A=0.5 (Hòa)
 *    - Phân giải K: K_A=32, K_B=32
 *    - Kỳ vọng: E_A ≈ 0.240253, E_B ≈ 0.759747
 *    - Delta: delta_A = round(32 * (0.5 - 0.240253)) = round(8.3119) = +8
 *             delta_B = round(32 * (0.5 - 0.759747)) = round(-8.3119) = -8
 *    - Điểm mới: R'_A = 1208, R'_B = 1392
 *
 * 5. Vector e (Người mới đấu):
 *    - Input: R_A=1200, g_A=3 | R_B=1200, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: g_A=3 < 15 -> K_A=60 | g_B=30 >= 15 -> K_B=32
 *    - Kỳ vọng: E_A = 0.5000, E_B = 0.5000
 *    - Delta: delta_A = round(60 * (1 - 0.5)) = +30 | delta_B = round(32 * (0 - 0.5)) = -16
 *    - Điểm mới: R'_A = 1230, R'_B = 1184 (Minh chứng không zero-sum có chủ đích khi K khác nhau)
 *
 * 6. Vector f (Cao thủ >= 2000):
 *    - Input: R_A=2050, g_A=30 | R_B=1900, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: R_A=2050 >= 2000 -> K_A=16 | R_B=1900 < 2000 -> K_B=32
 *    - Kỳ vọng: (1900 - 2050)/400 = -0.375 -> 10^-0.375 ≈ 0.421697 -> E_A = 1/(1+0.421697) ≈ 0.703385
 *    - Delta: delta_A = round(16 * (1 - 0.703385)) = round(4.7458) = +5
 *             delta_B = round(32 * (0 - 0.296615)) = round(-9.4917) = -9
 *    - Điểm mới: R'_A = 2055, R'_B = 1891
 *
 * 7. Vector g (Chênh > 400 điểm):
 *    - Input: R_A=1700, g_A=30 | R_B=1250, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: |1700 - 1250| = 450 > 400. Bên mạnh (A) -> K_A = 32 * 0.5 = 16. Bên yếu (B) -> K_B = 32.
 *    - Kỳ vọng: (1250 - 1700)/400 = -1.125 -> 10^-1.125 ≈ 0.074989 -> E_A = 1/(1+0.074989) ≈ 0.930242
 *    - Delta: delta_A = round(16 * (1 - 0.930242)) = round(1.1161) = +1
 *             delta_B = round(32 * (0 - 0.069758)) = round(-2.2323) = -2
 *    - Điểm mới: R'_A = 1701, R'_B = 1248
 *
 * 8. Vector h (Chênh > 400 điểm nhưng bên mạnh đang định hạng):
 *    - Input: R_A=1700, g_A=5 | R_B=1250, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: g_A=5 < 15 -> K cơ sở = 60. Chênh 450 > 400 & mạnh hơn -> K_A = 60 * 0.5 = 30.
 *                   Bên yếu -> K_B = 32.
 *    - Kỳ vọng: E_A ≈ 0.930242, E_B ≈ 0.069758
 *    - Delta: delta_A = round(30 * (1 - 0.930242)) = round(2.0927) = +2
 *             delta_B = round(32 * (0 - 0.069758)) = round(-2.2323) = -2
 *    - Điểm mới: R'_A = 1702, R'_B = 1248
 *
 * 9. Vector i (Người mới có rating cao):
 *    - Input: R_A=2100, g_A=10 | R_B=2000, g_B=30 | S_A=1 (A thắng)
 *    - Phân giải K: g_A=10 < 15 -> K_A=60 (placement ưu tiên trước high threshold).
 *                   g_B=30 >= 15, R_B=2000 >= 2000 -> K_B=16.
 *    - Kỳ vọng: (2000 - 2100)/400 = -0.25 -> 10^-0.25 ≈ 0.562341 -> E_A = 1/(1+0.562341) ≈ 0.640065
 *    - Delta: delta_A = round(60 * (1 - 0.640065)) = round(21.5961) = +22
 *             delta_B = round(16 * (0 - 0.359935)) = round(-5.7590) = -6
 *    - Điểm mới: R'_A = 2122, R'_B = 1994
 *
 * 10. Vector j (Đầu vào không hợp lệ):
 *    - Input: S_A = 0.7 hoặc rating < 0 hoặc gamesPlayed < 0 -> Ném RangeError
 * ==============================================================================
 */

import { describe, expect, it } from 'vitest';
import { expectedScore, resolveK, updatePair } from './elo.ts';
import { DEFAULT_ELO_CONFIG } from './types.ts';

/**
 * Seeded PRNG (Mulberry32) - Đảm bảo deterministic tuyệt đối trong property test
 * Tuyệt đối KHÔNG dùng hàm sinh số ngẫu nhiên không có seed (Unseeded PRNG).
 */
function createMulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('packages/rating/elo — Bộ 10 Vector Kiểm Chứng Tính Tay (DoD Gốc)', () => {
  it('tính tay: Vector a — 1200 vs 1200, K=32 cả 2, A thắng -> E=0.5, delta +16/-16, newRating 1216/1184', () => {
    const a = { rating: 1200, gamesPlayed: 30 };
    const b = { rating: 1200, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(32);
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.5);
    expect(result.deltaA).toBe(16);
    expect(result.deltaB).toBe(-16);
    expect(result.newRatingA).toBe(1216);
    expect(result.newRatingB).toBe(1184);
  });

  it('tính tay: Vector b — 1200 vs 1400, K=32 cả 2, A thắng -> E_A≈0.2403, delta +24/-24, newRating 1224/1376', () => {
    const a = { rating: 1200, gamesPlayed: 30 };
    const b = { rating: 1400, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(32);
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.2403);
    expect(result.deltaA).toBe(24);
    expect(result.deltaB).toBe(-24);
    expect(result.newRatingA).toBe(1224);
    expect(result.newRatingB).toBe(1376);
  });

  it('tính tay: Vector c — 1200 vs 1400, K=32 cả 2, A thua -> E_A≈0.2403, delta -8/+8, newRating 1192/1408', () => {
    const a = { rating: 1200, gamesPlayed: 30 };
    const b = { rating: 1400, gamesPlayed: 30 };
    const result = updatePair(a, b, 0);

    expect(result.kA).toBe(32);
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.2403);
    expect(result.deltaA).toBe(-8);
    expect(result.deltaB).toBe(8);
    expect(result.newRatingA).toBe(1192);
    expect(result.newRatingB).toBe(1408);
  });

  it('tính tay: Vector d — 1200 vs 1400, K=32 cả 2, hòa -> E_A≈0.2403, delta +8/-8, newRating 1208/1392', () => {
    const a = { rating: 1200, gamesPlayed: 30 };
    const b = { rating: 1400, gamesPlayed: 30 };
    const result = updatePair(a, b, 0.5);

    expect(result.kA).toBe(32);
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.2403);
    expect(result.deltaA).toBe(8);
    expect(result.deltaB).toBe(-8);
    expect(result.newRatingA).toBe(1208);
    expect(result.newRatingB).toBe(1392);
  });

  it('tính tay: Vector e — Người mới (3 trận, 1200) vs thường (30 trận, 1200), A thắng -> kA=60, kB=32, delta +30/-16', () => {
    const a = { rating: 1200, gamesPlayed: 3 };
    const b = { rating: 1200, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(60);
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.5);
    expect(result.deltaA).toBe(30);
    expect(result.deltaB).toBe(-16);
    expect(result.newRatingA).toBe(1230);
    expect(result.newRatingB).toBe(1184);
  });

  it('tính tay: Vector f — Cao thủ 2050 (30 trận) vs 1900 (30 trận), A thắng -> kA=16, kB=32, delta +5/-9', () => {
    const a = { rating: 2050, gamesPlayed: 30 };
    const b = { rating: 1900, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(16);
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.7034);
    expect(result.deltaA).toBe(5);
    expect(result.deltaB).toBe(-9);
    expect(result.newRatingA).toBe(2055);
    expect(result.newRatingB).toBe(1891);
  });

  it('tính tay: Vector g — Chênh > 400: 1700 (30 trận) vs 1250 (30 trận), A thắng -> kA=16, kB=32, delta +1/-2', () => {
    const a = { rating: 1700, gamesPlayed: 30 };
    const b = { rating: 1250, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(16); // 32 * 0.5
    expect(result.kB).toBe(32); // Không giảm bên yếu
    expect(result.expectedA).toBe(0.9302);
    expect(result.deltaA).toBe(1);
    expect(result.deltaB).toBe(-2);
    expect(result.newRatingA).toBe(1701);
    expect(result.newRatingB).toBe(1248);
  });

  it('tính tay: Vector h — Chênh > 400 bên mạnh đang định hạng (5 trận, 1700) vs 1250 (30 trận), A thắng -> kA=30, kB=32, delta +2/-2', () => {
    const a = { rating: 1700, gamesPlayed: 5 };
    const b = { rating: 1250, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(30); // 60 * 0.5 (Dampen áp sau Placement)
    expect(result.kB).toBe(32);
    expect(result.expectedA).toBe(0.9302);
    expect(result.deltaA).toBe(2);
    expect(result.deltaB).toBe(-2);
    expect(result.newRatingA).toBe(1702);
    expect(result.newRatingB).toBe(1248);
  });

  it('tính tay: Vector i — Người mới điểm cao 2100 (10 trận) vs 2000 (30 trận), A thắng -> kA=60, kB=16, delta +22/-6', () => {
    const a = { rating: 2100, gamesPlayed: 10 };
    const b = { rating: 2000, gamesPlayed: 30 };
    const result = updatePair(a, b, 1);

    expect(result.kA).toBe(60); // Placement (<15) ưu tiên trước High Rating
    expect(result.kB).toBe(16); // 2000 >= 2000 -> kHigh
    expect(result.expectedA).toBe(0.6401);
    expect(result.deltaA).toBe(22);
    expect(result.deltaB).toBe(-6);
    expect(result.newRatingA).toBe(2122);
    expect(result.newRatingB).toBe(1994);
  });

  it('tính tay: Vector j — Score không hợp lệ hoặc dữ liệu sai ném RangeError', () => {
    const a = { rating: 1200, gamesPlayed: 30 };
    const b = { rating: 1200, gamesPlayed: 30 };

    // Score không đúng (0.7)
    expect(() => updatePair(a, b, 0.7 as 1)).toThrow(RangeError);

    // Rating âm
    expect(() => updatePair({ rating: -100, gamesPlayed: 10 }, b, 1)).toThrow(RangeError);
    expect(() => updatePair(a, { rating: -50, gamesPlayed: 10 }, 1)).toThrow(RangeError);

    // Games played âm
    expect(() => updatePair({ rating: 1200, gamesPlayed: -1 }, b, 1)).toThrow(RangeError);
    expect(() => updatePair(a, { rating: 1200, gamesPlayed: -5 }, 1)).toThrow(RangeError);

    // Rating vô hạn / NaN
    expect(() => expectedScore(NaN, 1200)).toThrow(RangeError);
    expect(() => expectedScore(1200, Infinity)).toThrow(RangeError);
  });
});

describe('packages/rating/elo — resolveK Unit Tests theo thứ tự ưu tiên', () => {
  it('áp dụng kPlacement (60) cho người chơi có gamesPlayed < 15', () => {
    expect(resolveK({ rating: 1200, gamesPlayed: 0 }, 1200)).toBe(60);
    expect(resolveK({ rating: 1200, gamesPlayed: 14 }, 1200)).toBe(60);
  });

  it('áp dụng kHigh (16) cho người chơi có rating >= 2000 (gamesPlayed >= 15)', () => {
    expect(resolveK({ rating: 2000, gamesPlayed: 15 }, 2000)).toBe(16);
    expect(resolveK({ rating: 2500, gamesPlayed: 100 }, 2400)).toBe(16);
  });

  it('áp dụng kNormal (32) cho người chơi thông thường (gamesPlayed >= 15, rating < 2000)', () => {
    expect(resolveK({ rating: 1200, gamesPlayed: 15 }, 1200)).toBe(32);
    expect(resolveK({ rating: 1999, gamesPlayed: 50 }, 1999)).toBe(32);
  });

  it('giảm 50% K cho bên mạnh khi chênh > 400 điểm', () => {
    // A (1700, 20 trận) vs B (1200) -> chênh 500 > 400 -> K = 32 * 0.5 = 16
    expect(resolveK({ rating: 1700, gamesPlayed: 20 }, 1200)).toBe(16);

    // A (2500, 50 trận) vs B (2000) -> chênh 500 > 400 -> K = 16 * 0.5 = 8
    expect(resolveK({ rating: 2500, gamesPlayed: 50 }, 2000)).toBe(8);
  });

  it('KHÔNG giảm K cho bên yếu khi chênh > 400 điểm', () => {
    // A (1200, 20 trận) vs B (1700) -> bên yếu giữ nguyên K = 32
    expect(resolveK({ rating: 1200, gamesPlayed: 20 }, 1700)).toBe(32);

    // A (1000, 5 trận) vs B (1600) -> bên yếu đang định hạng giữ nguyên K = 60
    expect(resolveK({ rating: 1000, gamesPlayed: 5 }, 1600)).toBe(60);
  });

  it('hỗ trợ cấu hình EloConfig tùy biến', () => {
    const customConfig = {
      ...DEFAULT_ELO_CONFIG,
      kPlacement: 50,
      kNormal: 25,
      placementGames: 10,
    };
    expect(resolveK({ rating: 1200, gamesPlayed: 8 }, 1200, customConfig)).toBe(50);
    expect(resolveK({ rating: 1200, gamesPlayed: 10 }, 1200, customConfig)).toBe(25);
  });
});

describe('packages/rating/elo — Property-Based Testing (PRNG có Seed)', () => {
  it('tổng kỳ vọng E_A + E_B luôn bằng 1.0 (kiểm thử 100 cặp rating ngẫu nhiên)', () => {
    const rng = createMulberry32(42); // Fixed seed
    for (let i = 0; i < 100; i++) {
      const ratingA = Math.floor(rng() * 2500) + 500; // [500, 3000]
      const ratingB = Math.floor(rng() * 2500) + 500; // [500, 3000]

      const expA = expectedScore(ratingA, ratingB);
      const expB = expectedScore(ratingB, ratingA);

      expect(expA + expB).toBeCloseTo(1.0, 10);
    }
  });

  it('kỳ vọng đối xứng hoàn hảo khi điểm bằng nhau: E_A = E_B = 0.5', () => {
    const ratings = [0, 500, 1000, 1200, 1500, 2000, 3000];
    for (const r of ratings) {
      expect(expectedScore(r, r)).toBe(0.5);
    }
  });
});
