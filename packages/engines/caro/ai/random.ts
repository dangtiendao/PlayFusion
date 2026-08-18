/**
 * ==============================================================================
 * CARO AI DETERMINISTIC PSEUDO-RANDOM NUMBER GENERATOR (PRNG)
 * ==============================================================================
 *
 * ⚠️ QUY TẮC BẤT BIẾN TỪ P0.6 & PACKAGES/ENGINES/README:
 * CẤM sử dụng `Math.random` trần trong mọi engine và module logic của dự án.
 * Mọi yếu tố ngẫu nhiên (tạo nhiễu ở mức Dễ, tie-break ngẫu nhiên) bắt buộc phải
 * sử dụng PRNG có hạt giống (Seeded PRNG) để bảo đảm 100% Deterministic,
 * phục vụ tính năng Replay, Unit Test và trọng tài đồng thuận (Consensus).
 *
 * Thuật toán sử dụng: Mulberry32 (nhẹ, nhanh, chu kỳ 2^32, phân phối đều).
 */

/**
 * Hàm băm chuỗi ký tự bất kỳ thành số nguyên 32-bit làm hạt giống cho PRNG.
 *
 * @param str Chuỗi ký tự hạt giống (ví dụ: 'game-1234', 'match-seed').
 * @returns Số nguyên dương 32-bit.
 */
export function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Chuyển thành số nguyên 32-bit
  }
  return hash >>> 0 || 1; // Luôn trả về số dương >= 1
}

/**
 * Khởi tạo bộ sinh số giả ngẫu nhiên Mulberry32 với hạt giống số hoặc chuỗi.
 *
 * @param seed Hạt giống số nguyên hoặc chuỗi ký tự. Mặc định là hạt giống cố định 1337 nếu không truyền.
 * @returns Hàm `() => number` sinh số thực trong khoảng nửa mở `[0, 1)`.
 */
export function createSeededPrng(seed: number | string = 1337): () => number {
  let s = typeof seed === 'string' ? hashStringToSeed(seed) : seed | 0;
  if (s === 0) s = 1337;

  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
