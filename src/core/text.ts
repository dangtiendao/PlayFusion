/**
 * ==============================================================================
 * HÀM XỬ LÝ CHUỖI VÀ TÌM KIẾM KHÔNG DẤU TIẾNG VIỆT (TEXT UTILS)
 * ==============================================================================
 *
 * GHI CHÚ:
 * - Hàm thuần túy (Pure function), không có side-effect.
 * - Chuẩn hóa chuỗi tiếng Việt có dấu thành không dấu viết thường để tìm kiếm linh hoạt.
 * ==============================================================================
 */

/**
 * Loại bỏ dấu tiếng Việt và chuyển chuỗi về dạng chữ thường không dấu chuẩn hóa.
 *
 * @param str Chuỗi tiếng Việt đầu vào (ví dụ: 'Cờ Tướng', 'Đấu máy', 'Xếp hình').
 * @returns Chuỗi không dấu viết thường (ví dụ: 'co tuong', 'dau may', 'xep hinh').
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';

  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (match) => (match === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .trim();
}
