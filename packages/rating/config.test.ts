/**
 * packages/rating/config.test.ts
 *
 * Kiểm thử toàn diện hàm parseEloConfig với nguyên tắc Fail-Soft (100% Coverage).
 */

import { describe, expect, it } from 'vitest';
import { parseEloConfig } from './config.ts';
import { DEFAULT_ELO_CONFIG } from './types.ts';

describe('packages/rating/config — parseEloConfig Unit Tests (Fail-Soft)', () => {
  it('phân tích thành công cấu hình chuẩn từ system_config đã seed', () => {
    const seedRows = {
      'elo.k_placement': { k: 60 },
      'elo.k_normal': { k: 32 },
      'elo.k_high': { k: 16, threshold: 2000 },
    };

    const result = parseEloConfig(seedRows);

    expect(result.warnings).toEqual([]);
    expect(result.config).toEqual(DEFAULT_ELO_CONFIG);
  });

  it('phân tích thành công cấu hình tùy biến hợp lệ', () => {
    const customRows = {
      'elo.k_placement': { k: 50 },
      'elo.k_normal': { k: 25 },
      'elo.k_high': { k: 12, threshold: 2200 },
    };

    const result = parseEloConfig(customRows);

    expect(result.warnings).toHaveLength(0);
    expect(result.config.kPlacement).toBe(50);
    expect(result.config.kNormal).toBe(25);
    expect(result.config.kHigh).toBe(12);
    expect(result.config.highRatingThreshold).toBe(2200);
    expect(result.config.placementGames).toBe(15);
    expect(result.config.mismatchThreshold).toBe(400);
    expect(result.config.mismatchDampen).toBe(0.5);
  });

  it('xử lý fail-soft khi truyền đối tượng rỗng: fallback về DEFAULT_ELO_CONFIG và cảnh báo', () => {
    const result = parseEloConfig({});

    expect(result.config).toEqual(DEFAULT_ELO_CONFIG);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toContain('elo.k_placement');
    expect(result.warnings[1]).toContain('elo.k_normal');
    expect(result.warnings[2]).toContain('elo.k_high');
  });

  it('xử lý fail-soft khi các trường có kiểu dữ liệu sai (string, null, number, boolean)', () => {
    const invalidRows = {
      'elo.k_placement': 'not_an_object',
      'elo.k_normal': null,
      'elo.k_high': true,
    };

    const result = parseEloConfig(invalidRows);

    expect(result.config).toEqual(DEFAULT_ELO_CONFIG);
    expect(result.warnings).toHaveLength(3);
  });

  it('xử lý fail-soft khi các giá trị số âm hoặc bằng 0', () => {
    const negativeRows = {
      'elo.k_placement': { k: -10 },
      'elo.k_normal': { k: 0 },
      'elo.k_high': { k: -16, threshold: -2000 },
    };

    const result = parseEloConfig(negativeRows);

    expect(result.config.kPlacement).toBe(DEFAULT_ELO_CONFIG.kPlacement);
    expect(result.config.kNormal).toBe(DEFAULT_ELO_CONFIG.kNormal);
    expect(result.config.kHigh).toBe(DEFAULT_ELO_CONFIG.kHigh);
    expect(result.config.highRatingThreshold).toBe(DEFAULT_ELO_CONFIG.highRatingThreshold);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('xử lý fail-soft từng phần trong elo.k_high (k sai nhưng threshold đúng và ngược lại)', () => {
    // Trường hợp 1: k hợp lệ nhưng threshold hỏng
    const row1 = {
      'elo.k_placement': { k: 60 },
      'elo.k_normal': { k: 32 },
      'elo.k_high': { k: 18, threshold: 'invalid' },
    };
    const result1 = parseEloConfig(row1);
    expect(result1.config.kHigh).toBe(18);
    expect(result1.config.highRatingThreshold).toBe(DEFAULT_ELO_CONFIG.highRatingThreshold);
    expect(result1.warnings).toHaveLength(1);
    expect(result1.warnings[0]).toContain('threshold');

    // Trường hợp 2: threshold hợp lệ nhưng k hỏng
    const row2 = {
      'elo.k_placement': { k: 60 },
      'elo.k_normal': { k: 32 },
      'elo.k_high': { k: 'invalid', threshold: 2400 },
    };
    const result2 = parseEloConfig(row2);
    expect(result2.config.kHigh).toBe(DEFAULT_ELO_CONFIG.kHigh);
    expect(result2.config.highRatingThreshold).toBe(2400);
    expect(result2.warnings).toHaveLength(1);
    expect(result2.warnings[0]).toContain('k');
  });

  it('xử lý fail-soft khi giá trị là NaN hoặc Infinity', () => {
    const invalidNumbers = {
      'elo.k_placement': { k: NaN },
      'elo.k_normal': { k: Infinity },
      'elo.k_high': { k: -Infinity, threshold: NaN },
    };

    const result = parseEloConfig(invalidNumbers);

    expect(result.config).toEqual(DEFAULT_ELO_CONFIG);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
