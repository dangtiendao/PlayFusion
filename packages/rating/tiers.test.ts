/**
 * ==============================================================================
 * UNIT & PROPERTY TESTS CHO BẬC RANK (PACKAGES/RATING/TIERS.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P4.3A):
 * 1. Vét cạn 100% tất cả các mốc biên của Bảng ánh xạ TIER_TABLE (đối chiếu tính tay).
 * 2. Kiểm thử độ chính xác của hàm tính tiến độ getTierProgress (làm tròn 1 chữ số thập phân).
 * 3. Kiểm thử đầy đủ tất cả các nhánh suy diễn của resolveRankView (placement, shield true, shield false, tụt thật, thắng lại).
 * 4. Kiểm thử các ngoại lệ RangeError (rating âm, NaN, Infinity).
 * 5. Property test với PRNG mulberry32 kiểm chứng tính liên tục, không chồng lấn, không khoảng hở của TIER_TABLE.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  TIER_TABLE,
  getTierByRating,
  getTierProgress,
  resolveRankView,
  compareTiers,
  type RankViewInput,
  type TierId,
} from './tiers.ts';

// PRNG mulberry32 deterministic 100% cho property test
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('1. Bảng Ánh Xạ & Vét Cạn Điểm Biên (getTierByRating)', () => {
  it('1.1 [Tính tay] 100 -> Đồng (bronze)', () => {
    const tier = getTierByRating(100);
    expect(tier.id).toBe('bronze');
    expect(tier.name).toBe('Đồng');
    expect(tier.minRating).toBe(0);
    expect(tier.maxRating).toBe(999);
  });

  it('1.2 [Tính tay] 999 -> Đồng (bronze - Điểm tối đa của Đồng)', () => {
    const tier = getTierByRating(999);
    expect(tier.id).toBe('bronze');
  });

  it('1.3 [Tính tay] 1000 -> Bạc (silver - Ngưỡng bắt đầu của Bạc)', () => {
    const tier = getTierByRating(1000);
    expect(tier.id).toBe('silver');
    expect(tier.name).toBe('Bạc');
    expect(tier.minRating).toBe(1000);
    expect(tier.maxRating).toBe(1199);
  });

  it('1.4 [Tính tay] 1199 -> Bạc (silver - Điểm tối đa của Bạc)', () => {
    const tier = getTierByRating(1199);
    expect(tier.id).toBe('silver');
  });

  it('1.5 [Tính tay] 1200 -> Vàng (gold - Ngưỡng bắt đầu & Điểm mặc định)', () => {
    const tier = getTierByRating(1200);
    expect(tier.id).toBe('gold');
    expect(tier.name).toBe('Vàng');
    expect(tier.minRating).toBe(1200);
    expect(tier.maxRating).toBe(1399);
  });

  it('1.6 [Tính tay] 1399 -> Vàng (gold - Điểm tối đa của Vàng)', () => {
    const tier = getTierByRating(1399);
    expect(tier.id).toBe('gold');
  });

  it('1.7 [Tính tay] 1400 -> Bạch Kim (platinum - Ngưỡng bắt đầu của Bạch Kim)', () => {
    const tier = getTierByRating(1400);
    expect(tier.id).toBe('platinum');
    expect(tier.name).toBe('Bạch Kim');
    expect(tier.minRating).toBe(1400);
    expect(tier.maxRating).toBe(1599);
  });

  it('1.8 [Tính tay] 1599 -> Bạch Kim (platinum - Điểm tối đa của Bạch Kim)', () => {
    const tier = getTierByRating(1599);
    expect(tier.id).toBe('platinum');
  });

  it('1.9 [Tính tay] 1600 -> Kim Cương (diamond - Ngưỡng bắt đầu của Kim Cương)', () => {
    const tier = getTierByRating(1600);
    expect(tier.id).toBe('diamond');
    expect(tier.name).toBe('Kim Cương');
    expect(tier.minRating).toBe(1600);
    expect(tier.maxRating).toBe(1799);
  });

  it('1.10 [Tính tay] 1799 -> Kim Cương (diamond - Điểm tối đa của Kim Cương)', () => {
    const tier = getTierByRating(1799);
    expect(tier.id).toBe('diamond');
  });

  it('1.11 [Tính tay] 1800 -> Cao Thủ (master - Ngưỡng bắt đầu của Cao Thủ)', () => {
    const tier = getTierByRating(1800);
    expect(tier.id).toBe('master');
    expect(tier.name).toBe('Cao Thủ');
    expect(tier.minRating).toBe(1800);
    expect(tier.maxRating).toBeNull();
  });

  it('1.12 [Tính tay] 3000 -> Cao Thủ (master - Điểm đỉnh cao không giới hạn trần)', () => {
    const tier = getTierByRating(3000);
    expect(tier.id).toBe('master');
    expect(tier.maxRating).toBeNull();
  });
});

describe('2. Tính Toán Tiến Độ Điểm Số (getTierProgress)', () => {
  it('2.1 [Tính tay] 1000 (Bạc) -> pointsInTier: 0, pointsToNext: 200, percent: 0.0%', () => {
    const progress = getTierProgress(1000);
    expect(progress.tier.id).toBe('silver');
    expect(progress.nextTier?.id).toBe('gold');
    expect(progress.pointsInTier).toBe(0);
    expect(progress.pointsToNext).toBe(200);
    expect(progress.percent).toBe(0);
  });

  it('2.2 [Tính tay] 1199 (Bạc) -> pointsInTier: 199, pointsToNext: 1, percent: 99.5%', () => {
    const progress = getTierProgress(1199);
    expect(progress.tier.id).toBe('silver');
    expect(progress.nextTier?.id).toBe('gold');
    expect(progress.pointsInTier).toBe(199);
    expect(progress.pointsToNext).toBe(1);
    expect(progress.percent).toBe(99.5);
  });

  it('2.3 [Tính tay] 1250 (Vàng) -> pointsInTier: 50, pointsToNext: 150, percent: 25.0%', () => {
    const progress = getTierProgress(1250);
    expect(progress.tier.id).toBe('gold');
    expect(progress.nextTier?.id).toBe('platinum');
    expect(progress.pointsInTier).toBe(50);
    expect(progress.pointsToNext).toBe(150);
    expect(progress.percent).toBe(25);
  });

  it('2.4 [Tính tay] 1800 (Cao Thủ) -> nextTier: null, pointsToNext: null, percent: 100.0%', () => {
    const progress = getTierProgress(1800);
    expect(progress.tier.id).toBe('master');
    expect(progress.nextTier).toBeNull();
    expect(progress.pointsInTier).toBe(0);
    expect(progress.pointsToNext).toBeNull();
    expect(progress.percent).toBe(100);
  });

  it('2.5 [Tính tay] 2450 (Cao Thủ) -> pointsInTier: 650, pointsToNext: null, percent: 100.0%', () => {
    const progress = getTierProgress(2450);
    expect(progress.tier.id).toBe('master');
    expect(progress.nextTier).toBeNull();
    expect(progress.pointsInTier).toBe(650);
    expect(progress.pointsToNext).toBeNull();
    expect(progress.percent).toBe(100);
  });
});

describe('3. Trạng Thái Hiển Thị Tổng Hợp & Bảo Vệ Rớt Bậc (resolveRankView)', () => {
  it('3.1 [Luật a: Placement] Người chơi chưa đủ 15 trận (ví dụ: 14 trận) -> kind: placement', () => {
    const input: RankViewInput = {
      rating: 1200,
      gamesPlayed: 14,
      placementGames: 15,
      lastMatch: null,
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('placement');
    if (view.kind === 'placement') {
      expect(view.gamesPlayed).toBe(14);
      expect(view.gamesNeeded).toBe(15);
    }
  });

  it('3.2 [Luật c: Ranked thường] Đã đủ 15 trận, rating 1200 -> kind: ranked, displayTier: gold, shield: false', () => {
    const input: RankViewInput = {
      rating: 1200,
      gamesPlayed: 15,
      placementGames: 15,
      lastMatch: null,
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('gold');
      expect(view.displayTier.id).toBe('gold');
      expect(view.shield).toBe(false);
      expect(view.progress.percent).toBe(0);
    }
  });

  it('3.3 [Luật b: Shield TRUE] Thua rớt ngưỡng lần đầu (1205 -> 1189) -> shield: true, displayTier: Vàng, tier thực: Bạc', () => {
    const input: RankViewInput = {
      rating: 1189,
      gamesPlayed: 20,
      placementGames: 15,
      lastMatch: {
        ratingBefore: 1205, // Vàng
        ratingAfter: 1189, // Bạc
      },
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('silver'); // Bậc thật: Bạc
      expect(view.displayTier.id).toBe('gold'); // Bậc hiển thị: Vàng (được bảo vệ)
      expect(view.shield).toBe(true); // Có khiên bảo vệ
      expect(view.progress.pointsInTier).toBe(189);
    }
  });

  it('3.4 [Luật b: Shield TRUE] Hòa mất điểm làm rớt ngưỡng lần đầu (1400 -> 1392) -> shield: true, displayTier: Bạch Kim', () => {
    const input: RankViewInput = {
      rating: 1392,
      gamesPlayed: 30,
      placementGames: 15,
      lastMatch: {
        ratingBefore: 1400, // Bạch Kim
        ratingAfter: 1392, // Vàng
      },
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('gold');
      expect(view.displayTier.id).toBe('platinum');
      expect(view.shield).toBe(true);
    }
  });

  it('3.5 [Luật c: Thua tiếp rớt thật] Trận sau thua tiếp khi đang dưới ngưỡng (1189 -> 1173) -> shield: false, displayTier: Bạc', () => {
    const input: RankViewInput = {
      rating: 1173,
      gamesPlayed: 21,
      placementGames: 15,
      lastMatch: {
        ratingBefore: 1189, // Bạc
        ratingAfter: 1173, // Bạc
      },
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('silver');
      expect(view.displayTier.id).toBe('silver');
      expect(view.shield).toBe(false); // Khiên đã vỡ, tụt bậc thật
    }
  });

  it('3.6 [Luật c: Thắng lại vượt ngưỡng] Đang có khiên thắng lại (1189 -> 1205) -> shield: false, displayTier: Vàng thật', () => {
    const input: RankViewInput = {
      rating: 1205,
      gamesPlayed: 21,
      placementGames: 15,
      lastMatch: {
        ratingBefore: 1189,
        ratingAfter: 1205,
      },
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('gold');
      expect(view.displayTier.id).toBe('gold');
      expect(view.shield).toBe(false);
    }
  });

  it('3.7 [Luật c: Thua nhưng KHÔNG rớt ngưỡng] 1250 -> 1234 (đều là Vàng) -> shield: false', () => {
    const input: RankViewInput = {
      rating: 1234,
      gamesPlayed: 25,
      placementGames: 15,
      lastMatch: {
        ratingBefore: 1250,
        ratingAfter: 1234,
      },
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('gold');
      expect(view.displayTier.id).toBe('gold');
      expect(view.shield).toBe(false);
    }
  });

  it('3.8 [Luật c: Rating lệch ratingAfter] rating hiện tại (1195) khác ratingAfter (1189) -> shield: false', () => {
    const input: RankViewInput = {
      rating: 1195, // Đã có trận khác diễn ra sau trận rớt ngưỡng
      gamesPlayed: 22,
      placementGames: 15,
      lastMatch: {
        ratingBefore: 1205,
        ratingAfter: 1189,
      },
    };
    const view = resolveRankView(input);
    expect(view.kind).toBe('ranked');
    if (view.kind === 'ranked') {
      expect(view.tier.id).toBe('silver');
      expect(view.displayTier.id).toBe('silver');
      expect(view.shield).toBe(false);
    }
  });
});

describe('4. Ngoại Lệ Kiểm Tra Tham Số (Error Handling)', () => {
  it('4.1 Ném RangeError khi rating âm (< 0)', () => {
    expect(() => getTierByRating(-1)).toThrow(RangeError);
    expect(() => getTierProgress(-10)).toThrow(RangeError);
  });

  it('4.2 Ném RangeError khi rating là NaN hoặc Infinity', () => {
    expect(() => getTierByRating(NaN)).toThrow(RangeError);
    expect(() => getTierByRating(Infinity)).toThrow(RangeError);
    expect(() => getTierByRating(-Infinity)).toThrow(RangeError);
  });
});

describe('5. Property Tests: Tính Liền Mạch & Bất Biến Của Bảng Ánh Xạ', () => {
  it('5.1 TIER_TABLE có 6 bậc, sắp xếp tăng dần, không có khoảng hở hay chồng lấn', () => {
    expect(TIER_TABLE).toHaveLength(6);

    for (let i = 0; i < TIER_TABLE.length; i++) {
      const current = TIER_TABLE[i];
      expect(current).toBeDefined();
      if (!current) continue;

      if (i === 0) {
        expect(current.minRating).toBe(0);
      } else {
        const prev = TIER_TABLE[i - 1];
        expect(prev).toBeDefined();
        if (prev && prev.maxRating !== null) {
          // Điểm bắt đầu của bậc hiện tại phải liền kề ngay sau điểm kết thúc của bậc trước
          expect(current.minRating).toBe(prev.maxRating + 1);
        }
      }

      if (i === TIER_TABLE.length - 1) {
        expect(current.maxRating).toBeNull();
      } else {
        expect(current.maxRating).toBeGreaterThanOrEqual(current.minRating);
      }
    }
  });

  it('5.2 Mọi rating ngẫu nhiên từ 0 đến 4000 (1000 mẫu PRNG) đều ánh xạ tới đúng 1 bậc duy nhất', () => {
    const rng = mulberry32(20260826);

    for (let i = 0; i < 1000; i++) {
      const randomRating = Math.floor(rng() * 4001); // 0 -> 4000
      const tier = getTierByRating(randomRating);

      expect(randomRating).toBeGreaterThanOrEqual(tier.minRating);
      if (tier.maxRating !== null) {
        expect(randomRating).toBeLessThanOrEqual(tier.maxRating);
      }

      const progress = getTierProgress(randomRating);
      expect(progress.percent).toBeGreaterThanOrEqual(0);
      expect(progress.percent).toBeLessThanOrEqual(100);
      expect(progress.pointsInTier).toBe(randomRating - tier.minRating);
    }
  });

  describe('6. Kiểm Thử compareTiers (So sánh thứ bậc rank - P4.3c)', () => {
    it('6.1 So sánh bằng chuỗi TierId: Bậc cao hơn trả về > 0, bậc thấp hơn trả về < 0, cùng bậc trả về 0', () => {
      expect(compareTiers('gold', 'silver')).toBeGreaterThan(0);
      expect(compareTiers('bronze', 'diamond')).toBeLessThan(0);
      expect(compareTiers('master', 'master')).toBe(0);
      expect(compareTiers('platinum', 'platinum')).toBe(0);
      expect(compareTiers('master', 'bronze')).toBeGreaterThan(0);
    });

    it('6.2 So sánh bằng đối tượng TierDef và hỗn hợp (TierDef vs TierId)', () => {
      const bronzeDef = getTierByRating(800);
      const goldDef = getTierByRating(1300);
      const masterDef = getTierByRating(2000);

      expect(compareTiers(goldDef, bronzeDef)).toBeGreaterThan(0);
      expect(compareTiers(bronzeDef, masterDef)).toBeLessThan(0);
      expect(compareTiers(goldDef, 'gold')).toBe(0);
      expect(compareTiers('master', goldDef)).toBeGreaterThan(0);
    });

    it('6.3 Kiểm thử biên: Bậc liền kề và bậc xa nhất', () => {
      expect(compareTiers('silver', 'bronze')).toBe(1);
      expect(compareTiers('gold', 'silver')).toBe(1);
      expect(compareTiers('platinum', 'gold')).toBe(1);
      expect(compareTiers('diamond', 'platinum')).toBe(1);
      expect(compareTiers('master', 'diamond')).toBe(1);

      // Đi lùi
      expect(compareTiers('bronze', 'master')).toBe(-5);
      expect(compareTiers('master', 'bronze')).toBe(5);
    });

    it('6.4 Mã TierId không hợp lệ -> ném RangeError', () => {
      expect(() => compareTiers('invalid' as unknown as TierId, 'gold')).toThrow(RangeError);
      expect(() => compareTiers('gold', 'unknown' as unknown as TierId)).toThrow(RangeError);
    });
  });
});
