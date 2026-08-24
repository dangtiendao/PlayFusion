/**
 * packages/rating/ffa.test.ts
 *
 * ==============================================================================
 * BẢNG SỐ LIỆU TÍNH TAY ĐỐI CHIẾU FFA (HAND-CALCULATED BENCHMARK VECTORS)
 * ==============================================================================
 *
 * Công thức áp dụng:
 *   E_AB = 1 / (1 + 10 ^ ((R_B - R_A) / 400))
 *   K_A = resolveK(A, AVG(R_opp), config)
 *   delta_A = round( (K_A / (N - 1)) * SUM_{B != A} (S_AB - E_AB) )
 *
 * 1. Vector a (3 người cùng 1200, K=32, hạng 1/2/3):
 *    - P1 (1200, 30, rank 1): SUM = (1-0.5) + (1-0.5) = 1.0 -> delta_1 = round(16 * 1.0) = +16 -> R'_1 = 1216
 *    - P2 (1200, 30, rank 2): SUM = (0-0.5) + (1-0.5) = 0.0 -> delta_2 = round(16 * 0.0) = 0 -> R'_2 = 1200
 *    - P3 (1200, 30, rank 3): SUM = (0-0.5) + (0-0.5) = -1.0 -> delta_3 = round(16 * -1.0) = -16 -> R'_3 = 1184
 *    - Tổng delta = +16 + 0 - 16 = 0 (Bảo toàn Zero-Sum khi cùng K).
 *
 * 2. Vector b (4 người 1100..1400, hạng ngược rating - người yếu nhất thắng):
 *    - P1 (1100, 30, rank 1): SUM ≈ 0.6401 + 0.7597 + 0.8490 = 2.2488 -> delta_1 = round( (32/3) * 2.2488 ) = +24 -> R'_1 = 1124
 *    - P2 (1200, 30, rank 2): SUM ≈ -0.6401 + 0.6401 + 0.7597 = 0.7597 -> delta_2 = round( (32/3) * 0.7597 ) = +8 -> R'_2 = 1208
 *    - P3 (1300, 30, rank 3): SUM ≈ -0.7597 - 0.6401 + 0.6401 = -0.7597 -> delta_3 = round( (32/3) * -0.7597 ) = -8 -> R'_3 = 1292
 *    - P4 (1400, 30, rank 4): SUM ≈ -0.8490 - 0.7597 - 0.6401 = -2.2488 -> delta_4 = round( (32/3) * -2.2488 ) = -24 -> R'_4 = 1376
 *    - Tổng delta = +24 + 8 - 8 - 24 = 0.
 *
 * 3. Vector c (Đồng hạng - Ties: 2 người hạng 1, 1 người hạng 3, cùng 1200, K=32):
 *    - P1 (1200, 30, rank 1): SUM = (0.5-0.5) + (1.0-0.5) = 0.5 -> delta_1 = round(16 * 0.5) = +8 -> R'_1 = 1208
 *    - P2 (1200, 30, rank 1): SUM = (0.5-0.5) + (1.0-0.5) = 0.5 -> delta_2 = round(16 * 0.5) = +8 -> R'_2 = 1208
 *    - P3 (1200, 30, rank 3): SUM = (0-0.5) + (0-0.5) = -1.0 -> delta_3 = round(16 * -1.0) = -16 -> R'_3 = 1184
 *    - Tổng delta = +8 + 8 - 16 = 0.
 *
 * 4. Vector d (Người mới K=60 lẫn thường K=32, 3 người 1200, hạng 1/2/3):
 *    - P1 (1200, 3, rank 1, K=60): SUM = 1.0 -> delta_1 = round( (60/2) * 1.0 ) = +30 -> R'_1 = 1230
 *    - P2 (1200, 30, rank 2, K=32): SUM = 0.0 -> delta_2 = round( (32/2) * 0.0 ) = 0 -> R'_2 = 1200
 *    - P3 (1200, 30, rank 3, K=32): SUM = -1.0 -> delta_3 = round( (32/2) * -1.0 ) = -16 -> R'_3 = 1184
 *    - Tổng delta = +30 + 0 - 16 = +14 != 0 (Minh chứng tính không zero-sum có chủ đích khi K khác nhau).
 * ==============================================================================
 */

import { describe, expect, it } from 'vitest';
import { updatePair } from './elo.ts';
import { updateFfa, type FfaParticipant } from './ffa.ts';

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

describe('packages/rating/ffa — Bộ Vector Tính Tay Kiểm Chứng FFA (DoD Gốc)', () => {
  it('tính tay: Vector a — 3 người cùng 1200, K=32, hạng 1/2/3 -> delta +16, 0, -16', () => {
    const participants: FfaParticipant[] = [
      { id: 'p1', rating: 1200, gamesPlayed: 30, placement: 1 },
      { id: 'p2', rating: 1200, gamesPlayed: 30, placement: 2 },
      { id: 'p3', rating: 1200, gamesPlayed: 30, placement: 3 },
    ];

    const results = updateFfa(participants);

    expect(results).toEqual([
      { id: 'p1', delta: 16, newRating: 1216, k: 32 },
      { id: 'p2', delta: 0, newRating: 1200, k: 32 },
      { id: 'p3', delta: -16, newRating: 1184, k: 32 },
    ]);

    // Tổng delta bảo toàn zero-sum khi cùng K
    const sumDelta = results.reduce((acc, r) => acc + r.delta, 0);
    expect(sumDelta).toBe(0);
  });

  it('tính tay: Vector b — 4 người 1100..1400, hạng ngược rating -> delta +24, +8, -8, -24', () => {
    const participants: FfaParticipant[] = [
      { id: 'p1', rating: 1100, gamesPlayed: 30, placement: 1 },
      { id: 'p2', rating: 1200, gamesPlayed: 30, placement: 2 },
      { id: 'p3', rating: 1300, gamesPlayed: 30, placement: 3 },
      { id: 'p4', rating: 1400, gamesPlayed: 30, placement: 4 },
    ];

    const results = updateFfa(participants);

    expect(results).toEqual([
      { id: 'p1', delta: 24, newRating: 1124, k: 32 },
      { id: 'p2', delta: 8, newRating: 1208, k: 32 },
      { id: 'p3', delta: -8, newRating: 1292, k: 32 },
      { id: 'p4', delta: -24, newRating: 1376, k: 32 },
    ]);

    const sumDelta = results.reduce((acc, r) => acc + r.delta, 0);
    expect(sumDelta).toBe(0);
  });

  it('tính tay: Vector c — Đồng hạng (Ties): 2 người hạng 1, 1 người hạng 3 -> delta +8, +8, -16', () => {
    const participants: FfaParticipant[] = [
      { id: 'p1', rating: 1200, gamesPlayed: 30, placement: 1 },
      { id: 'p2', rating: 1200, gamesPlayed: 30, placement: 1 },
      { id: 'p3', rating: 1200, gamesPlayed: 30, placement: 3 },
    ];

    const results = updateFfa(participants);

    expect(results).toEqual([
      { id: 'p1', delta: 8, newRating: 1208, k: 32 },
      { id: 'p2', delta: 8, newRating: 1208, k: 32 },
      { id: 'p3', delta: -16, newRating: 1184, k: 32 },
    ]);

    const sumDelta = results.reduce((acc, r) => acc + r.delta, 0);
    expect(sumDelta).toBe(0);
  });

  it('tính tay: Vector d — Người mới K=60 lẫn thường K=32 -> delta +30, 0, -16 (tổng delta = +14 != 0)', () => {
    const participants: FfaParticipant[] = [
      { id: 'p1', rating: 1200, gamesPlayed: 3, placement: 1 },
      { id: 'p2', rating: 1200, gamesPlayed: 30, placement: 2 },
      { id: 'p3', rating: 1200, gamesPlayed: 30, placement: 3 },
    ];

    const results = updateFfa(participants);

    expect(results).toEqual([
      { id: 'p1', delta: 30, newRating: 1230, k: 60 },
      { id: 'p2', delta: 0, newRating: 1200, k: 32 },
      { id: 'p3', delta: -16, newRating: 1184, k: 32 },
    ]);

    const sumDelta = results.reduce((acc, r) => acc + r.delta, 0);
    expect(sumDelta).toBe(14);
  });
});

describe('packages/rating/ffa — Đối Chiếu Tương Đương 1v1 (updateFfa vs updatePair)', () => {
  it('trận 2 người (N=2) trong updateFfa khớp kết quả 100% với updatePair', () => {
    // Trường hợp 1: 1200 vs 1400, người 1200 thắng
    const p1 = { rating: 1200, gamesPlayed: 30 };
    const p2 = { rating: 1400, gamesPlayed: 30 };

    const pairResult = updatePair(p1, p2, 1);
    const ffaResult = updateFfa([
      { id: 'a', ...p1, placement: 1 },
      { id: 'b', ...p2, placement: 2 },
    ]);

    expect(ffaResult[0]?.delta).toBe(pairResult.deltaA);
    expect(ffaResult[1]?.delta).toBe(pairResult.deltaB);
    expect(ffaResult[0]?.newRating).toBe(pairResult.newRatingA);
    expect(ffaResult[1]?.newRating).toBe(pairResult.newRatingB);
    expect(ffaResult[0]?.k).toBe(pairResult.kA);
    expect(ffaResult[1]?.k).toBe(pairResult.kB);
  });

  it('trận 2 người hòa trong updateFfa khớp kết quả 100% với updatePair hòa', () => {
    const p1 = { rating: 1200, gamesPlayed: 30 };
    const p2 = { rating: 1400, gamesPlayed: 30 };

    const pairResult = updatePair(p1, p2, 0.5);
    const ffaResult = updateFfa([
      { id: 'a', ...p1, placement: 1 },
      { id: 'b', ...p2, placement: 1 }, // Đồng hạng 1
    ]);

    expect(ffaResult[0]?.delta).toBe(pairResult.deltaA);
    expect(ffaResult[1]?.delta).toBe(pairResult.deltaB);
    expect(ffaResult[0]?.newRating).toBe(pairResult.newRatingA);
    expect(ffaResult[1]?.newRating).toBe(pairResult.newRatingB);
  });
});

describe('packages/rating/ffa — Xác Thực Đầu Vào (Validation & Fail-Fast)', () => {
  it('ném RangeError khi số lượng người chơi < 2', () => {
    expect(() => updateFfa([])).toThrow(RangeError);
    expect(() => updateFfa([{ id: 'p1', rating: 1200, gamesPlayed: 10, placement: 1 }])).toThrow(
      RangeError,
    );
  });

  it('ném RangeError khi id người chơi bị rỗng hoặc không phải chuỗi', () => {
    expect(() =>
      updateFfa([
        { id: '', rating: 1200, gamesPlayed: 10, placement: 1 },
        { id: 'p2', rating: 1300, gamesPlayed: 10, placement: 2 },
      ]),
    ).toThrow(RangeError);
  });

  it('ném RangeError khi trùng lặp ID người chơi', () => {
    expect(() =>
      updateFfa([
        { id: 'dup-id', rating: 1200, gamesPlayed: 10, placement: 1 },
        { id: 'dup-id', rating: 1300, gamesPlayed: 10, placement: 2 },
      ]),
    ).toThrow(RangeError);
  });

  it('ném RangeError khi placement < 1 hoặc không hợp lệ', () => {
    expect(() =>
      updateFfa([
        { id: 'p1', rating: 1200, gamesPlayed: 10, placement: 0 },
        { id: 'p2', rating: 1300, gamesPlayed: 10, placement: 2 },
      ]),
    ).toThrow(RangeError);
  });

  it('ném RangeError khi rating hoặc gamesPlayed âm', () => {
    expect(() =>
      updateFfa([
        { id: 'p1', rating: -100, gamesPlayed: 10, placement: 1 },
        { id: 'p2', rating: 1300, gamesPlayed: 10, placement: 2 },
      ]),
    ).toThrow(RangeError);

    expect(() =>
      updateFfa([
        { id: 'p1', rating: 1200, gamesPlayed: -5, placement: 1 },
        { id: 'p2', rating: 1300, gamesPlayed: 10, placement: 2 },
      ]),
    ).toThrow(RangeError);
  });

  it('không làm thay đổi (mutate) mảng đầu vào và giữ nguyên thứ tự kết quả', () => {
    const input: FfaParticipant[] = [
      { id: 'p3', rating: 1300, gamesPlayed: 20, placement: 3 },
      { id: 'p1', rating: 1100, gamesPlayed: 20, placement: 1 },
      { id: 'p2', rating: 1200, gamesPlayed: 20, placement: 2 },
    ];
    const clone = JSON.parse(JSON.stringify(input));

    const results = updateFfa(input);

    expect(input).toEqual(clone);
    expect(results.map((r) => r.id)).toEqual(['p3', 'p1', 'p2']);
  });
});

describe('packages/rating/ffa — Property-Based Testing (PRNG có Seed, 200 ca)', () => {
  it('tổng delta luôn = 0 khi tất cả người chơi có cùng K (200 trận ngẫu nhiên N=3..6)', () => {
    const rng = createMulberry32(100);

    for (let t = 0; t < 200; t++) {
      const n = Math.floor(rng() * 4) + 3; // 3 đến 6 người chơi
      const participants: FfaParticipant[] = [];

      // Chọn điểm sao cho không kích hoạt mismatch (>400) và không high rating (1100-1400)
      const baseR = 1200;
      for (let i = 0; i < n; i++) {
        const rating = baseR + Math.floor(rng() * 200) - 100; // 1100..1300
        const placement = Math.floor(rng() * n) + 1;
        participants.push({
          id: `player_${i}`,
          rating,
          gamesPlayed: 30, // Cố định để K = 32
          placement,
        });
      }

      const results = updateFfa(participants);
      const sumDelta = results.reduce((acc, r) => acc + r.delta, 0);

      // Do làm tròn độc lập từng delta, tổng có thể lệch tối đa +-Math.floor(n/2)
      expect(Math.abs(sumDelta)).toBeLessThanOrEqual(Math.floor(n / 2));
    }
  });

  it('tính đơn điệu (Monotonicity): cùng rating và K, người hạng cao hơn luôn nhận delta >= người hạng thấp hơn', () => {
    const rng = createMulberry32(200);

    for (let t = 0; t < 100; t++) {
      const p3Rating = 1200 + Math.floor(rng() * 100);
      const p4Rating = 1200 + Math.floor(rng() * 100);

      // p1 và p2 có cùng rating 1250 và cùng gamesPlayed=30 (cùng K=32), nhưng p1 hạng 1, p2 hạng 2
      const participants: FfaParticipant[] = [
        { id: 'p1', rating: 1250, gamesPlayed: 30, placement: 1 },
        { id: 'p2', rating: 1250, gamesPlayed: 30, placement: 2 },
        { id: 'p3', rating: p3Rating, gamesPlayed: 30, placement: 3 },
        { id: 'p4', rating: p4Rating, gamesPlayed: 30, placement: 4 },
      ];

      const results = updateFfa(participants);
      const delta1 = results.find((r) => r.id === 'p1')?.delta ?? 0;
      const delta2 = results.find((r) => r.id === 'p2')?.delta ?? 0;

      expect(delta1).toBeGreaterThanOrEqual(delta2);
    }
  });

  it('rating biên (0, 4000) không bao giờ sinh ra NaN hoặc Infinity', () => {
    const participants: FfaParticipant[] = [
      { id: 'p1', rating: 0, gamesPlayed: 30, placement: 1 },
      { id: 'p2', rating: 4000, gamesPlayed: 30, placement: 2 },
      { id: 'p3', rating: 2000, gamesPlayed: 30, placement: 3 },
    ];

    const results = updateFfa(participants);

    for (const r of results) {
      expect(Number.isFinite(r.delta)).toBe(true);
      expect(Number.isFinite(r.newRating)).toBe(true);
      expect(Number.isFinite(r.k)).toBe(true);
      expect(Number.isNaN(r.delta)).toBe(false);
    }
  });
});
