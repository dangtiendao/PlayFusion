/**
 * ==============================================================================
 * MODULE BÙ LỆCH GIỜ & ĐẾM NGƯỢC THỜI GIAN SERVER (SRC/CORE/SERVERCLOCK.TS)
 * ==============================================================================
 *
 * GHI CHÚ BẢO MẬT & KIẾN TRÚC:
 * 1. NGUYÊN TẮC BÙ LỆCH GIỜ (CLOCK DRIFT COMPENSATION):
 *    - Đồng hồ Client có thể lệch vài giây đến vài giờ so với đồng hồ Server (do cài đặt OS).
 *    - Mỗi khi Client nhận một phản hồi API hoặc gói tin Realtime Broadcast có `serverNow`,
 *      hàm `computeOffset` sẽ tính toán độ lệch:
 *      `offsetMs = serverNowMs - receivedAtLocalMs`.
 *    - Giờ Server ước lượng tại thời điểm `t_local` trên máy:
 *      `estimatedServerNowMs = t_local + offsetMs`.
 * 2. THỜI GIAN CÒN LẠI THEO GIỜ SERVER (SERVER-ACCURATE REMAINING):
 *    - `remainingMs(turnDeadlineIso, offsetMs, nowLocalMs)` tính toán khoảng cách:
 *      `remaining = deadlineMs - (nowLocalMs + offsetMs)`.
 *    - Việc người chơi cố tình đổi giờ máy tính/điện thoại chỉ làm đồng hồ hiển thị
 *      lệch tạm thời trước khi tự hiệu chỉnh lại ở gói tin kế tiếp; phán quyết thắng thua
 *      vẫn do Server nắm giữ 100%.
 * ==============================================================================
 */

/**
 * Tính toán độ lệch giữa giờ Server và giờ Client (ms).
 *
 * @param serverNowIso Chuỗi ISO timestamp do Server trả về
 * @param receivedAtLocalMs Thời điểm nhận gói tin trên máy Client (mặc định: Date.now())
 * @returns Độ lệch (ms) để cộng vào giờ Client (âm nếu client chạy nhanh hơn server)
 */
export function computeOffset(
  serverNowIso: string,
  receivedAtLocalMs: number = Date.now(),
): number {
  const serverMs = new Date(serverNowIso).getTime();
  if (isNaN(serverMs)) return 0;
  return serverMs - receivedAtLocalMs;
}

/**
 * Tính thời gian còn lại (ms) của lượt đánh hiện tại theo mốc giờ Server.
 *
 * @param turnDeadlineIso Hạn chót nước đi (ISO string do Server cung cấp)
 * @param offsetMs Độ lệch giờ hiện tại giữa Server và Client
 * @param nowLocalMs Thời điểm hiện tại trên máy Client (mặc định: Date.now())
 * @returns Số mili-giây còn lại (<= 0 nếu đã quá hạn)
 */
export function calculateRemainingMs(
  turnDeadlineIso: string | null | undefined,
  offsetMs: number,
  nowLocalMs: number = Date.now(),
): number {
  if (!turnDeadlineIso) return 0;
  const deadlineMs = new Date(turnDeadlineIso).getTime();
  if (isNaN(deadlineMs)) return 0;

  const currentServerTimeMs = nowLocalMs + offsetMs;
  return deadlineMs - currentServerTimeMs;
}

/**
 * Định dạng số mili-giây còn lại thành chuỗi mm:ss hiển thị trên đồng hồ ván cờ.
 *
 * @param ms Số mili-giây
 * @returns Chuỗi định dạng "mm:ss" (ví dụ: "04:59", "00:00")
 */
export function formatMmSs(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}
