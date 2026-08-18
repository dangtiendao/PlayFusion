/**
 * ==============================================================================
 * CARO ENGINE TEST UTILITIES (TIỆN ÍCH PHỤC VỤ KIỂM THỬ ENGINE & AI CARO)
 * ==============================================================================
 */

/**
 * Helper trực quan: Khởi tạo mảng board 1D từ mảng chuỗi ASCII.
 * Ký tự:
 * - 'x' / 'X': Quân của Player 0 (X, giá trị 0)
 * - 'o' / 'O': Quân của Player 1 (O, giá trị 1)
 * - '.' / '-': Ô trống (giá trị -1)
 *
 * @param rows Mảng các chuỗi biểu diễn từng hàng bàn cờ (có thể cách nhau bởi khoảng trắng hoặc liền nhau).
 * @param size Kích thước cạnh bàn cờ vuông.
 * @returns Mảng số 1D Int8-like độ dài size*size.
 */
export function createBoardFromAscii(rows: readonly string[], size: number): number[] {
  const board = new Array<number>(size * size).fill(-1);
  for (let y = 0; y < rows.length && y < size; y++) {
    const rawRow = rows[y] ?? '';
    const chars = rawRow.includes(' ') ? rawRow.trim().split(/\s+/) : rawRow.split('');
    for (let x = 0; x < chars.length && x < size; x++) {
      const ch = chars[x];
      const cellIdx = y * size + x;
      if (ch === 'x' || ch === 'X') {
        board[cellIdx] = 0;
      } else if (ch === 'o' || ch === 'O') {
        board[cellIdx] = 1;
      } else {
        board[cellIdx] = -1;
      }
    }
  }
  return board;
}

/**
 * Thuật toán sinh số giả ngẫu nhiên Mulberry32 với Seed cố định (100% Deterministic, không Math.random).
 * Dùng để tạo các thế cờ ngẫu nhiên có thể tái lập 100% trong unit test.
 *
 * @param seed Số nguyên làm hạt giống ban đầu.
 * @returns Hàm sinh số thực giả ngẫu nhiên trong khoảng [0, 1).
 */
export function createPrng(seed: number): () => number {
  let s = seed;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
