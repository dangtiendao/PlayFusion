-- ==============================================================================
-- MIGRATION 0014: MATCH CLOCK & TIME CONTROL (PHASE P3.4a)
-- ==============================================================================
--
-- GHI CHÚ BẢO MẬT & KIẾN TRÚC:
-- 1. NGUYÊN TẮC THỜI GIAN LÀ LOGIC SERVER-SIDE (SERVER-DRIVEN CLOCK):
--    - Mọi mốc thời gian (`turn_started_at`, `turn_deadline`) và phép trừ giờ
--      BẮT BUỘC do Trọng tài Server tính toán bằng đồng hồ DB/Edge (`now()`).
--    - Client TUYỆT ĐỐI không được phép gửi timestamp hay tự tính giờ còn lại.
-- 2. ĐỊNH DẠNG JSONB CHO QUỸ GIỜ (EXTENSIBLE TIME POOL):
--    - `clock` lưu dạng JSONB `{"0": 300000, "1": 300000}` (mili-giây còn lại theo seat_index).
--    - Thiết kế JSONB cho phép mở rộng tức thì cho game N người chơi (Uno, Cờ cá ngựa...)
--      mà không cần thêm cột cứng vào bảng.
-- 3. BẢN CHỤP TIME CONTROL TRÊN BẢNG MATCHES (IMMUTABLE SNAPSHOT):
--    - `matches.time_control` lưu bản chụp cấu hình giờ tại thời điểm tạo ván.
--    - Đảm bảo khi `system_config` thay đổi trong tương lai, lịch sử ván đấu cũ và
--      hệ thống Replay vẫn đối soát đúng luật giờ ban đầu.
-- 4. BẢO MẬT RLS (KHÔNG CẦN POLICY MỚI):
--    - Các cột mới nằm trên 2 bảng đã khóa ghi (`match_live_state` và `matches`).
--    - Policy hiện có `Participants can read their match live state` (0012) tự động
--      cho phép đấu thủ đọc các cột mới. Client ghi vẫn bị CHẶN 100%.
-- ==============================================================================

-- 1. Bổ sung các cột phục vụ đồng hồ vào bảng match_live_state
ALTER TABLE public.match_live_state
  ADD COLUMN IF NOT EXISTS clock jsonb NULL,
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz NULL;

COMMENT ON COLUMN public.match_live_state.clock IS
  'Quỹ thời gian còn lại của từng ghế tính bằng mili-giây dạng JSONB {"0": ms, "1": ms}. Thiết kế JSONB sẵn sàng cho game N người chơi. NULL = ván đấu không áp dụng Time Control';

COMMENT ON COLUMN public.match_live_state.turn_started_at IS
  'Thời điểm bắt đầu lượt đánh hiện tại theo đồng hồ máy chủ (now()). Dùng làm mốc tính thời gian suy nghĩ; client TUYỆT ĐỐI không ghi';

COMMENT ON COLUMN public.match_live_state.turn_deadline IS
  'Hạn chót nước đi tính theo đồng hồ máy chủ (phục vụ P3.4 xử thua timeout). Kích hoạt chính thức từ Phase P3.4';

-- 2. Bổ sung bản chụp time_control vào bảng matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS time_control jsonb NULL;

COMMENT ON COLUMN public.matches.time_control IS
  'Bản chụp cấu hình kiểm soát thời gian của ván đấu tại thời điểm khởi tạo {"baseSeconds": 300, "incrementSeconds": 5}. Dùng cho đối soát & replay';

-- 3. Seed cấu hình hệ thống cho luật đồng hồ và bỏ trận
INSERT INTO public.system_config (key, value, description)
VALUES
  (
    'match.default_time_control',
    '{"baseSeconds": 300, "incrementSeconds": 5}'::jsonb,
    'Cấu hình đồng hồ mặc định cho ván đấu online (5 phút cơ bản + 5 giây tích lũy mỗi nước hợp lệ)'
  ),
  (
    'match.abort_move_threshold',
    '{"moves": 3}'::jsonb,
    'Ngưỡng số nước đi tối thiểu để phân định thắng thua khi bỏ trận. Kết thúc trước 3 nước = hủy trận (abort), từ 3 nước = xử thua'
  )
ON CONFLICT (key) DO NOTHING;
