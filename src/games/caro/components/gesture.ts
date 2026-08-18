/**
 * ==============================================================================
 * CARO GESTURE & COORDINATE HELPERS (HÀM THUẦN TÚY XỬ LÝ CỬ CHỈ & TỌA ĐỘ)
 * ==============================================================================
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Ngưỡng khoảng cách (pixel) để phân biệt giữa Chạm (Tap) và Kéo bàn cờ (Pan/Drag) */
export const PAN_DRAG_THRESHOLD_PX = 10;

/**
 * Phân loại cử chỉ của con trỏ (Pointer/Touch) dựa trên khoảng cách dịch chuyển.
 *
 * @param start Điểm bắt đầu khi pointerdown
 * @param end Điểm kết thúc khi pointerup
 * @param threshold Ngưỡng pixel phân loại (mặc định 10px)
 * @returns 'tap' nếu dịch chuyển <= threshold, ngược lại 'pan'
 */
export function classifyPointerGesture(
  start: Point,
  end: Point,
  threshold: number = PAN_DRAG_THRESHOLD_PX,
): 'tap' | 'pan' {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return distance <= threshold ? 'tap' : 'pan';
}

/**
 * Chuyển đổi index mảng 1 chiều thành tọa độ cờ hiển thị (ví dụ: H8, A1, O15).
 * Cột: Ký tự chữ cái A..Z (A=0, B=1, ... H=7)
 * Hàng: Số thứ tự 1..N (hàng 0 là 1)
 *
 * @param index Vị trí ô trong mảng 1 chiều (0..boardSize*boardSize-1)
 * @param boardSize Kích thước cạnh bàn cờ (ví dụ 15)
 * @returns Chuỗi tọa độ hiển thị (ví dụ "H8")
 */
export function indexToCoordinate(index: number, boardSize: number): string {
  if (index < 0 || index >= boardSize * boardSize) {
    return '??';
  }

  const col = index % boardSize;
  const row = Math.floor(index / boardSize);

  const colLetter = String.fromCharCode(65 + col);
  const rowNumber = row + 1;

  return `${colLetter}${rowNumber}`;
}
