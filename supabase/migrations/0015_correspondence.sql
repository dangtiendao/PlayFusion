-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0015_correspondence.sql
-- ==============================================================================
-- Mục tiêu: Thiết lập nền tảng cơ sở dữ liệu cho chế độ chơi theo lượt kiểu thư tín
--          (online_correspondence) - Phase P3.6a.
--
-- Ghi chú kiến trúc & Security:
-- 1. MỞ RỘNG CHECK CONSTRAINT TRÊN PUBLIC.MATCHES:
--    - Mở rộng mode CHECK từ 6 giá trị lên 7 giá trị: bổ sung 'online_correspondence'.
--    - Lý do tạo mode mới thay vì dùng lại 'online_1v1': Thống kê tách bạch theo
--      modeKey, luật đếm giờ tính theo ngày/giờ thay vì realtime giây, và không
--      yêu cầu duy trì socket WebSocket thường trực (bảo vệ Quota 200 CCU).
-- 2. THÊM CỘT MODE CHO BẢNG PUBLIC.ROOMS:
--    - mode text NOT NULL DEFAULT 'online_1v1' CHECK (mode IN ('online_1v1', 'online_correspondence')).
--    - DEFAULT 'online_1v1' đảm bảo tương thích ngược 100% với các phòng đấu cũ.
-- 3. NÂNG CẤP 2 RPCS QUẢN LÝ PHÒNG ĐẤU:
--    - create_room(p_game_id text, p_mode text DEFAULT 'online_1v1'): Nhận và validate
--      p_mode hợp lệ trước khi lưu vào rooms.mode.
--    - join_room(p_code text): Tạo ván đấu matches với mode kế thừa từ rooms.mode
--      thay vì hardcode 'online_1v1', đồng thời trả thêm cột mode để client điều hướng đúng.
-- 4. CẤU HÌNH SYSTEM_CONFIG:
--    - Seed key 'match.correspondence_per_move_hours' -> {"hours": 24} (thời hạn mỗi nước).
-- 5. RLS MATRIX:
--    - Không tạo policy mới; cột mode trong rooms nằm trong SELECT policy hiện hữu.
-- ==============================================================================

-- 1. MỞ RỘNG RÀNG BUỘC CHECK MODE TRÊN BẢNG PUBLIC.MATCHES
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%mode%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.matches DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_mode_check
  CHECK (mode IN ('solo', 'vs_ai', 'local_pvp', 'online_1v1', 'online_correspondence', 'online_ffa', 'online_team'));

-- 2. THÊM CỘT MODE VÀO BẢNG PUBLIC.ROOMS
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'online_1v1'
  CHECK (mode IN ('online_1v1', 'online_correspondence'));

-- 3. NÂNG CẤP RPC: CREATE_ROOM
DROP FUNCTION IF EXISTS public.create_room(text);
DROP FUNCTION IF EXISTS public.create_room(text, text);

CREATE OR REPLACE FUNCTION public.create_room(
  p_game_id text,
  p_mode text DEFAULT 'online_1v1'
)
RETURNS TABLE(code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 32 ký tự an toàn (bỏ O/0, I/1)
  v_code text;
  v_expires_at timestamptz := now() + interval '30 minutes';
  v_attempts int := 0;
  v_bytes bytea;
BEGIN
  -- 1. Xác thực người dùng
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập để tạo phòng đấu' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate chế độ chơi phòng đấu
  IF p_mode IS NULL OR p_mode NOT IN ('online_1v1', 'online_correspondence') THEN
    RAISE EXCEPTION 'Chế độ chơi không hợp lệ' USING ERRCODE = 'P0011';
  END IF;

  -- 3. Kiểm tra trò chơi hợp lệ và đang kích hoạt
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND is_enabled = true) THEN
    RAISE EXCEPTION 'Trò chơi không tồn tại hoặc đang bị tạm khóa' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Tự động hủy phòng waiting cũ của host (nếu có)
  UPDATE public.rooms
  SET status = 'cancelled'
  WHERE host_id = v_caller_id AND status = 'waiting';

  -- 5. Sinh mã ngẫu nhiên 6 ký tự an toàn từ bảng 32 ký tự
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'Không thể sinh mã phòng ngẫu nhiên sau 5 lần thử' USING ERRCODE = 'P0003';
    END IF;

    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    FOR i IN 0..5 LOOP
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.rooms (
        code,
        host_id,
        game_id,
        mode,
        status,
        expires_at
      ) VALUES (
        v_code,
        v_caller_id,
        p_game_id,
        p_mode,
        'waiting',
        v_expires_at
      );
      EXIT; -- Thành công thoát vòng lặp
    EXCEPTION WHEN unique_violation THEN
      -- Nếu trùng mã PK -> lặp lại sinh mã mới
    END;
  END LOOP;

  RETURN QUERY SELECT v_code, v_expires_at;
END;
$$;

-- 4. NÂNG CẤP RPC: JOIN_ROOM
DROP FUNCTION IF EXISTS public.join_room(text);

CREATE OR REPLACE FUNCTION public.join_room(p_code text)
RETURNS TABLE(match_id uuid, my_seat smallint, game_id text, mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guest_id uuid;
  v_room record;
  v_new_match_id uuid;
  v_host_seat smallint;
  v_guest_seat smallint;
BEGIN
  -- 1. Xác thực người dùng
  v_guest_id := (SELECT auth.uid());
  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập để vào phòng đấu' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate định dạng mã phòng
  IF p_code IS NULL OR p_code !~ '^[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'Mã phòng không đúng định dạng 6 ký tự' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Tra cứu phòng đấu
  SELECT * FROM public.rooms WHERE code = p_code INTO v_room;
  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy phòng đấu' USING ERRCODE = 'P0004';
  END IF;

  -- 4. Kiểm tra không được tự join phòng của chính mình
  IF v_room.host_id = v_guest_id THEN
    RAISE EXCEPTION 'CANNOT_JOIN_OWN_ROOM' USING ERRCODE = 'P0005';
  END IF;

  -- 5. Kiểm tra phòng hết hạn
  IF v_room.status = 'expired' OR (v_room.status = 'waiting' AND v_room.expires_at <= now()) THEN
    UPDATE public.rooms SET status = 'expired' WHERE code = p_code;
    RAISE EXCEPTION 'ROOM_EXPIRED' USING ERRCODE = 'P0006';
  END IF;

  -- 6. Kiểm tra phòng không ở trạng thái waiting
  IF v_room.status <> 'waiting' THEN
    RAISE EXCEPTION 'ROOM_NOT_AVAILABLE' USING ERRCODE = 'P0007';
  END IF;

  -- 7. CHỐNG ĐUA & TẠO VÁN ĐẤU TRONG BẢNG MATCHES TRƯỚC
  -- (Phải INSERT public.matches trước để thỏa mãn foreign key constraint rooms_match_id_fkey khi UPDATE public.rooms)
  v_new_match_id := extensions.gen_random_uuid();

  -- 8. CHIA GHẾ NGẪU NHIÊN CÔNG BẰNG (50/50 CHO HOST VÀ GUEST)
  IF random() < 0.5 THEN
    v_host_seat := 0;
    v_guest_seat := 1;
  ELSE
    v_host_seat := 1;
    v_guest_seat := 0;
  END IF;

  -- 9. TẠO VÁN ĐẤU TRONG BẢNG MATCHES
  -- Kế thừa mode từ phòng đấu (v_room.mode) thay vì hardcode 'online_1v1'
  INSERT INTO public.matches (
    id,
    game_id,
    mode,
    is_ranked,
    season_id,
    started_at
  ) VALUES (
    v_new_match_id,
    v_room.game_id,
    v_room.mode,
    false,
    NULL,
    now()
  );

  -- 10. CẬP NHẬT TRẠNG THÁI PHÒNG ĐẤU SANG 'matched'
  -- Atomic check: Chỉ đúng 1 người cập nhật thành công (nếu thất bại do đua, transaction tự rollback xóa matches)
  UPDATE public.rooms
  SET status = 'matched',
      match_id = v_new_match_id,
      matched_at = now()
  WHERE code = p_code
    AND status = 'waiting'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_TAKEN' USING ERRCODE = 'P0008';
  END IF;

  -- 11. TẠO MATCH_PARTICIPANTS
  INSERT INTO public.match_participants (
    match_id,
    user_id,
    seat_index
  ) VALUES
    (v_new_match_id, v_room.host_id, v_host_seat),
    (v_new_match_id, v_guest_id, v_guest_seat);

  RETURN QUERY SELECT v_new_match_id, v_guest_seat, v_room.game_id, v_room.mode;
END;
$$;

-- 5. SEED SYSTEM CONFIG: THỜI HẠN MỖI NƯỚC ĐI CORRESPONDENCE
INSERT INTO public.system_config (key, value, description)
VALUES (
  'match.correspondence_per_move_hours',
  '{"hours": 24}'::jsonb,
  'Thời hạn tối đa cho mỗi nước đi trong chế độ chơi theo lượt (correspondence), tính bằng giờ.'
)
ON CONFLICT (key) DO NOTHING;
