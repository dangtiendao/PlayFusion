/**
 * ==============================================================================
 * HỢP ĐỒNG CÔNG KHAI TẦNG REALTIME TRANSPORT (SRC/TRANSPORT/TYPES.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & NGUYÊN TẮC BẢO MẬT:
 * 1. ĐỘC LẬP TẦNG:
 *    - Toàn bộ các kiểu dữ liệu dưới đây là Domain Types sạch, định nghĩa giao thức
 *      truyền nhận thông điệp qua WebSocket Realtime Broadcast & Presence.
 *    - Tầng UI/Views và Tầng Game Engine chỉ giao tiếp qua các kiểu dữ liệu này.
 * 2. CẢNH BÁO BẢO MẬT KÊNH REALTIME (DUMB PIPE):
 *    - Tầng Transport chỉ đóng vai trò là "ống truyền dẫn dữ liệu tốc độ cao" (Dumb Pipe).
 *    - Mọi thông tin người gửi (`senderId`) và nội dung (`payload`) nhận được từ kênh
 *      phải được coi là CHƯA ĐƯỢC XÁC THỰC TUYỆT ĐỐI.
 *    - Các hành động có hệ quả pháp lý (nước đi hợp lệ, kết thúc ván, điểm số)
 *      BẮT BUỘC phải được thẩm định và xác nhận qua Edge Function Trọng Tài (P3.2).
 * ==============================================================================
 */

/**
 * Trạng thái kết nối vòng đời của kênh Realtime ván đấu.
 * - 'idle': Kênh vừa khởi tạo, chưa bắt đầu kết nối.
 * - 'connecting': Đang thiết lập kết nối WebSocket tới Supabase Realtime Server.
 * - 'connected': Đã kết nối thành công và sẵn sàng phát sóng/nhận tin nhắn (SUBSCRIBED).
 * - 'error': Gặp lỗi đường truyền mạng hoặc kênh bị từ chối (TIMED_OUT, CHANNEL_ERROR).
 * - 'closed': Đã ngắt kết nối an toàn và dọn dẹp sạch sẽ tài nguyên (CLOSED/UNSUBSCRIBED).
 */
export type ChannelStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

/**
 * Cấu trúc phong bì chuẩn hóa (Transport Envelope) bọc mọi thông điệp truyền qua Realtime Broadcast.
 *
 * @template T Kiểu dữ liệu nội dung payload của thông điệp (mặc định là `unknown`).
 */
export interface TransportEnvelope<T = unknown> {
  /**
   * Phiên bản cấu trúc phong bì (hiện tại cố định là 1).
   * - Mục đích: Giúp ứng dụng phát hiện phiên bản gói tin không tương thích khi client được nâng cấp.
   * - Quy tắc: Phía nhận nếu phát hiện `v !== 1` PHẢI bỏ qua thông điệp và ghi log cảnh báo, không được crash.
   */
  readonly v: 1;

  /**
   * Tên sự kiện / loại thông điệp (ví dụ: 'move', 'chat', 'ping', 'surrender', 'draw_offer'...).
   * - Quy tắc kiến trúc: Tầng Transport hoàn toàn KHÔNG hiểu ngữ nghĩa nghiệp vụ của `type`,
   *   chỉ làm nhiệm vụ bọc gói và định tuyến đến các handler phù hợp.
   */
  readonly type: string;

  /**
   * Mã định danh tài khoản người gửi (`auth.uid()`).
   *
   * > [!WARNING]
   * > **CẢNH BÁO BẢO MẬT QUAN TRỌNG**:
   * > Phía nhận chỉ sử dụng trường này để đối chiếu hiển thị giao diện UI, TUYỆT ĐỐI KHÔNG
   * > tin tưởng tuyệt đối vào tính chính danh của client. Tính xác thực và quyền đi cờ
   * > sẽ được thẩm định chính thức tại Edge Function Trọng Tài Server-side (Phase P3.2).
   */
  readonly senderId: string;

  /**
   * Thời điểm phát thông điệp dạng chuỗi ISO 8601 UTC (ví dụ: '2026-08-22T20:30:00.000Z').
   * - Mục đích: Dùng để đo độ trễ mạng (Network Latency), phục vụ gỡ lỗi và sắp xếp sự kiện.
   */
  readonly sentAt: string;

  /**
   * Nội dung dữ liệu chi tiết của thông điệp được truyền đi.
   */
  readonly payload: T;
}

/**
 * Thông tin thành viên đang hiện diện (Presence Member) trong phòng đấu hoặc ván chơi.
 */
export interface PresenceMember {
  /** Mã định danh tài khoản người dùng (`auth.uid()`) */
  readonly userId: string;
  /** Tên hiển thị công khai của người chơi */
  readonly displayName: string;
  /** Thời điểm tham gia phòng/kênh dạng chuỗi ISO 8601 */
  readonly joinedAt: string;
}

/**
 * Bộ lắng nghe các sự kiện và biến động trạng thái từ kênh ván đấu Realtime.
 */
export interface MatchChannelHandlers {
  /**
   * Kích hoạt khi nhận được một thông điệp Broadcast hợp lệ từ kênh (có `v === 1`).
   *
   * @param env Phong bì thông điệp chuẩn hóa chứa payload và metadata người gửi.
   */
  readonly onMessage: (env: TransportEnvelope) => void;

  /**
   * Kích hoạt khi danh sách thành viên hiện diện (Presence) có sự thay đổi (join, leave, sync).
   * Danh sách trả về luôn được sắp xếp tăng dần theo `joinedAt` (deterministic cho UI).
   *
   * @param members Danh sách thành viên hiện diện hiện tại trong kênh.
   */
  readonly onPresenceChange: (members: PresenceMember[]) => void;

  /**
   * Kích hoạt khi trạng thái kết nối của kênh thay đổi (`idle` -> `connecting` -> `connected`...).
   *
   * @param status Trạng thái mới của kênh kết nối.
   * @param detail Thông tin chi tiết hoặc thông điệp lỗi nếu có.
   */
  readonly onStatusChange: (status: ChannelStatus, detail?: string) => void;
}
