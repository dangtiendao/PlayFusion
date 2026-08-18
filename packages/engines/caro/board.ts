/**
 * ==============================================================================
 * CARO BOARD COORDINATE HELPERS (HÀM TOÁN HỌC TỌA ĐỘ BÀN CỜ)
 * ==============================================================================
 *
 * Module này cung cấp các hàm thuần túy chuyển đổi giữa tọa độ 2D (x, y) và
 * chỉ số mảng 1D phẳng (flat index). Được tái sử dụng xuyên suốt trong:
 * - Engine P1.1b (legalMoves, applyMove)
 * - Engine P1.1c (isTerminal / quét 4 hướng)
 * - Worker Bot AI P1.2 (Heuristic evaluation & Minimax)
 * - React View P1.3 (Render lưới bàn cờ và xử lý click)
 */

/**
 * Cấu trúc tọa độ 2D trên bàn cờ.
 */
export interface BoardCoordinates {
  /** Tọa độ trục hoành (cột, từ 0 đến size - 1) */
  readonly x: number;
  /** Tọa độ trục tung (hàng, từ 0 đến size - 1) */
  readonly y: number;
}

/**
 * Chuyển đổi tọa độ 2D `(x, y)` thành chỉ số phẳng 1D (flat index).
 *
 * @param x Tọa độ cột (0-indexed).
 * @param y Tọa độ hàng (0-indexed).
 * @param size Kích thước cạnh bàn cờ vuông.
 * @returns Chỉ số index trong mảng 1D `y * size + x`.
 */
export function idx(x: number, y: number, size: number): number {
  return y * size + x;
}

/**
 * Chuyển đổi chỉ số phẳng 1D (flat index) ngược lại thành tọa độ 2D `(x, y)`.
 *
 * @param index Chỉ số phẳng trong mảng 1D (0 .. size*size - 1).
 * @param size Kích thước cạnh bàn cờ vuông.
 * @returns Đối tượng tọa độ 2D `{ x, y }`.
 */
export function xy(index: number, size: number): BoardCoordinates {
  return {
    x: index % size,
    y: Math.floor(index / size),
  };
}

/**
 * Kiểm tra một tọa độ 2D `(x, y)` có nằm bên trong phạm vi hợp lệ của bàn cờ hay không.
 *
 * @param x Tọa độ cột.
 * @param y Tọa độ hàng.
 * @param size Kích thước cạnh bàn cờ vuông.
 * @returns `true` nếu tọa độ hợp lệ `0 <= x < size` và `0 <= y < size`, ngược lại `false`.
 */
export function inBounds(x: number, y: number, size: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}
