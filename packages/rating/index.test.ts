/**
 * packages/rating/index.test.ts
 *
 * Kiểm thử tính toàn vẹn của barrel export (index.ts) cho module @rating.
 */

import { describe, expect, it } from 'vitest';
import * as RatingModule from './index.ts';

describe('packages/rating/index — Barrel Export Integrity Check', () => {
  it('xuất đầy đủ các hàm và hằng số của API công khai', () => {
    expect(RatingModule.DEFAULT_ELO_CONFIG).toBeDefined();
    expect(typeof RatingModule.expectedScore).toBe('function');
    expect(typeof RatingModule.resolveK).toBe('function');
    expect(typeof RatingModule.updatePair).toBe('function');
    expect(typeof RatingModule.updateFfa).toBe('function');
    expect(typeof RatingModule.parseEloConfig).toBe('function');
  });

  it('hàm chạy đúng khi gọi qua namespace xuất khẩu', () => {
    const pair = RatingModule.updatePair(
      { rating: 1200, gamesPlayed: 30 },
      { rating: 1200, gamesPlayed: 30 },
      1,
    );
    expect(pair.deltaA).toBe(16);
    expect(pair.deltaB).toBe(-16);

    const ffa = RatingModule.updateFfa([
      { id: '1', rating: 1200, gamesPlayed: 30, placement: 1 },
      { id: '2', rating: 1200, gamesPlayed: 30, placement: 2 },
    ]);
    expect(ffa).toHaveLength(2);
  });
});
