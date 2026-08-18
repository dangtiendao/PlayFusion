/**
 * ==============================================================================
 * HÀM XỬ LÝ CHUỖI VÀ TÌM KIẾM KHÔNG DẤU TIẾNG VIỆT (TEXT UTILS)
 * ==============================================================================
 *
 * GHI CHÚ:
 * - Hàm thuần túy (Pure function), không có side-effect.
 * - Chuẩn hóa chuỗi tiếng Việt có dấu thành không dấu viết thường để tìm kiếm linh hoạt.
 * - Định dạng thời gian tương đối thân thiện (Relative Time Formatting).
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

/**
 * Chuyển đổi mốc thời gian ISO thành chuỗi biểu diễn tương đối tiếng Việt thân thiện.
 * Ví dụ: "Vừa xong", "5 phút trước", "2 giờ trước", "3 ngày trước".
 *
 * @param isoString Chuỗi thời gian chuẩn ISO 8601
 * @param nowMs Mốc thời gian hiện tại (tùy chọn, dùng để mock trong unit tests)
 * @returns Chuỗi thời gian tương đối
 */
export function formatRelativeTime(isoString: string, nowMs?: number): string {
  if (!isoString) return 'Không rõ';

  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) {
    return 'Không rõ';
  }

  const now = nowMs ?? Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 60) {
    return 'Vừa xong';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} phút trước`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} giờ trước`;
  }

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) {
    return `${diffDay} ngày trước`;
  }

  const d = new Date(timestamp);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
