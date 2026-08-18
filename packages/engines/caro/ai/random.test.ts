import { describe, it, expect } from 'vitest';
import { createSeededPrng, hashStringToSeed } from './random';

describe('Caro AI Seeded PRNG (random.ts - P1.2b)', () => {
  it('hashStringToSeed chuyển đổi chuỗi thành số nguyên 32-bit xác định', () => {
    const hash1 = hashStringToSeed('test-seed');
    const hash2 = hashStringToSeed('test-seed');
    const hashDiff = hashStringToSeed('other-seed');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiff);
    expect(Number.isInteger(hash1)).toBe(true);
    expect(hash1).toBeGreaterThan(0);
  });

  it('2 bộ sinh số giả ngẫu nhiên có cùng seed sinh ra chuỗi số giống hệt nhau 100%', () => {
    const prngA = createSeededPrng('match-123');
    const prngB = createSeededPrng('match-123');

    const seqA = Array.from({ length: 50 }, () => prngA());
    const seqB = Array.from({ length: 50 }, () => prngB());

    expect(seqA).toEqual(seqB);
  });

  it('2 bộ sinh số có seed khác nhau sinh ra chuỗi số khác nhau', () => {
    const prng1 = createSeededPrng(42);
    const prng2 = createSeededPrng(99);

    const seq1 = Array.from({ length: 10 }, () => prng1());
    const seq2 = Array.from({ length: 10 }, () => prng2());

    expect(seq1).not.toEqual(seq2);
  });

  it('xử lý chuẩn xác khi seed bằng 0, chuỗi rỗng hoặc không truyền tham số', () => {
    const prngZero = createSeededPrng(0);
    const prngEmpty = createSeededPrng('');
    const prngDefault = createSeededPrng();

    expect(prngZero()).toBeGreaterThanOrEqual(0);
    expect(prngEmpty()).toBeGreaterThanOrEqual(0);
    expect(prngDefault()).toBeGreaterThanOrEqual(0);
  });

  it('mọi số sinh ra đều nằm trong khoảng hợp lệ [0, 1)', () => {
    const prng = createSeededPrng(1337);
    for (let i = 0; i < 1000; i++) {
      const val = prng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});
