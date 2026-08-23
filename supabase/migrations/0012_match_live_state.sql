-- ==============================================================================
-- MIGRATION 0012: BẢNG MATCH_LIVE_STATE & RPC CREATE_TEST_ONLINE_MATCH (PHASE P3.2b)
-- ==============================================================================
--
-- TÀI LIỆU KỸ THUẬT & NGUYÊN TẮC BẢO MẬT:
-- 1. NƠI SỐNG CỦA TRẬN ONLINE:
--    - Bảng `public.match_live_state` lưu trữ thế cờ thời gian thực đang diễn ra.
--    - `move_index`: Số nước đi đã áp dụng thành công. Vừa là Khóa lạc quan (Optimistic Concurrency Control)
--      vừa là Khóa lũy công (Idempotency Key) cho Edge Function `submit_move`.
--    - `turn_deadline`: Khai báo sẵn cho Phase P3.4 (Đồng hồ đếm ngược). Mặc định NULL.
-- 2. PHÂN QUYỀN RLS:
--    - SELECT: CHỈ người tham gia ván đấu (`match_participants`) mới được xem (phục vụ P3.5 Reconnect).
--      Không mở công khai cho toàn thể như bảng `matches` để bảo vệ bí mật chiến thuật đang thi đấu.
--    - INSERT / UPDATE / DELETE: Khóa 100% đối với client. Chỉ Service Role (Edge Function Trọng Tài)
--      mới được phép ghi sau khi thẩm định nước đi bằng Game Engine TS thuần túy.
-- 3. QUY TRÌNH SERVER SINH STATE (SERVER-GENERATED INITIAL STATE):
--    - RPC `create_test_online_match` chỉ tạo bản ghi `matches` và `match_participants`.
--    - RPC KHÔNG tạo `match_live_state`. Server Edge Function (`referee` action `init`) sẽ nạp
--      Game Engine TS thuần để khởi tạo state bàn cờ ban đầu và ghi DB. Client tuyệt đối không được tự cấp state.
-- ==============================================================================

-- 1. Tạo bảng match_live_state
CREATE TABLE IF NOT EXISTS public.match_live_state (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  state_serialized text NOT NULL,
  move_index int NOT NULL DEFAULT 0 CHECK (move_index >= 0),
  current_seat smallint NOT NULL CHECK (current_seat >= 0),
  moves_serialized text NOT NULL DEFAULT '',
  turn_deadline timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.match_live_state IS 'Trạng thái ván đấu online thời gian thực do Trọng tài Server quản lý';
COMMENT ON COLUMN public.match_live_state.move_index IS 'Số nước đi đã thực hiện. Đóng vai trò khóa lạc quan và idempotency key cho submit_move';
COMMENT ON COLUMN public.match_live_state.turn_deadline IS 'Hạn chót nước đi (phục vụ P3.4 đồng hồ cờ). NULL khi chưa kích hoạt đồng hồ';

-- 2. Gắn trigger cập nhật updated_at tự động
DROP TRIGGER IF EXISTS tr_match_live_state_set_updated_at ON public.match_live_state;
CREATE TRIGGER tr_match_live_state_set_updated_at
  BEFORE UPDATE ON public.match_live_state
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. Bật Row Level Security (RLS)
ALTER TABLE public.match_live_state ENABLE ROW LEVEL SECURITY;

-- 4. Policy RLS: Chỉ đấu thủ tham gia trận mới được SELECT thế cờ
DROP POLICY IF EXISTS "Participants can read their match live state" ON public.match_live_state;
CREATE POLICY "Participants can read their match live state"
  ON public.match_live_state
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_live_state.match_id
        AND mp.user_id = (SELECT auth.uid())
    )
  );

-- 5. Cấp quyền truy cập bảng
GRANT SELECT ON public.match_live_state TO authenticated;
GRANT ALL ON public.match_live_state TO service_role;
REVOKE ALL ON public.match_live_state FROM anon, public;

-- ==============================================================================
-- 6. RPC: create_test_online_match (DEV-SCAFFOLD)
-- GHI CHÚ: Hàm tạm phục vụ scaffold kiểm thử trận online P3.2.
-- Sẽ được thay thế hoàn toàn bởi luồng Tạo/Vào phòng đấu mã 6 ký tự ở Phase P3.3 rồi DROP.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_test_online_match(p_opponent_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_match_id uuid;
BEGIN
  -- 1. Xác thực phiên đăng nhập
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập để tạo trận đấu' USING ERRCODE = '42501';
  END IF;

  -- 2. Kiểm tra đối thủ hợp lệ
  IF p_opponent_id IS NULL OR p_opponent_id = v_caller_id THEN
    RAISE EXCEPTION 'Đối thủ không hợp lệ hoặc trùng với người tạo' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_opponent_id) THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ đối thủ' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Tạo bản ghi ván đấu (matches)
  INSERT INTO public.matches (
    game_id,
    mode,
    is_ranked,
    season_id,
    started_at
  ) VALUES (
    'caro',
    'online_1v1',
    false,
    NULL,
    now()
  ) RETURNING id INTO v_match_id;

  -- 4. Tạo bản ghi người tham gia (match_participants)
  -- Caller: Seat 0 (đi trước); Opponent: Seat 1
  INSERT INTO public.match_participants (
    match_id,
    user_id,
    seat_index,
    result,
    score
  ) VALUES
    (v_match_id, v_caller_id, 0, NULL, NULL),
    (v_match_id, p_opponent_id, 1, NULL, NULL);

  -- 5. LƯU Ý: Không tạo dòng match_live_state tại đây.
  -- Server Edge Function Trọng Tài (P3.2c) sẽ nạp Game Engine TS thuần để
  -- khởi tạo state bàn cờ chuẩn và INSERT match_live_state.

  RETURN v_match_id;
END;
$$;

COMMENT ON FUNCTION public.create_test_online_match(uuid) IS 'DEV-SCAFFOLD: Tạo ván đấu test online 1v1 cho 2 user. Sẽ thay thế ở P3.3 rồi DROP.';

-- 7. Cấp quyền thực thi RPC
GRANT EXECUTE ON FUNCTION public.create_test_online_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_test_online_match(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_test_online_match(uuid) FROM anon, public;
