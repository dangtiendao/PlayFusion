-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0013_rooms.sql
-- ==============================================================================
-- Mục tiêu: Tạo bảng phòng đấu mã 6 ký tự (public.rooms), thiết lập RLS chặt chẽ,
--          cung cấp 4 RPCs SECURITY DEFINER quản lý vòng đời phòng đấu,
--          và DROP RPC scaffold create_test_online_match.
--
-- Ghi chú kiến trúc & Security:
-- 1. BẢNG PHÒNG ĐẤU 6 KÝ TỰ (ROOMS):
--    - code: Mã phòng 6 ký tự viết hoa / số, sinh từ bảng 32 ký tự an toàn
--      (loại trừ O/0, I/1 để tránh nhầm lẫn khi đọc qua điện thoại/màn hình nhỏ).
--    - UNIQUE Partial Index: 1 Host chỉ có tối đa 1 phòng ở trạng thái 'waiting'.
--    - RLS: Host xem được phòng mình; Authenticated tra cứu phòng waiting còn hạn
--      (để xem thông tin trước khi join); Khóa ghi client 100% (deny-write).
-- 2. BỐN (04) RPCs SECURITY DEFINER:
--    - create_room(p_game_id): Tự động hủy phòng waiting cũ của host, sinh mã an toàn,
--      tạo phòng mới với TTL 30 phút.
--    - join_room(p_code): Chống đua atomic (UPDATE rooms SET status='matched' WHERE status='waiting'),
--      chia ghế ngẫu nhiên 50/50, tự tạo matches + match_participants.
--    - cancel_room(p_code): Chỉ host được hủy phòng khi đang waiting.
--    - get_my_room_status(p_code): Fallback polling cho host khi chờ người vào.
-- 3. DROP SCAFFOLD:
--    - DROP FUNCTION public.create_test_online_match(uuid) — Trả nợ kỹ thuật từ P3.2b.
-- ==============================================================================

-- 1. TẠO BẢNG PUBLIC.ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  game_id text NOT NULL REFERENCES public.games(id),
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired')),
  match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  matched_at timestamptz NULL,
  CONSTRAINT chk_rooms_matched_has_match_id CHECK ((status = 'matched') = (match_id IS NOT NULL))
);

-- Partial Index: Mỗi host chỉ được có tối đa 1 phòng chờ hoạt động
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_host_waiting ON public.rooms(host_id) WHERE status = 'waiting';

-- Index hỗ trợ tra cứu theo game và trạng thái
CREATE INDEX IF NOT EXISTS idx_rooms_game_status ON public.rooms(game_id, status);

-- 2. KÍCH HOẠT VÀ THIẾT LẬP RLS CHO BẢNG ROOMS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: Host xem được phòng mình; Authenticated tra cứu phòng waiting còn hạn; Đấu thủ xem lại phòng
CREATE POLICY "rooms_select_policy"
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (
    host_id = auth.uid()
    OR (status = 'waiting' AND expires_at > now())
    OR (match_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.match_participants
      WHERE match_participants.match_id = rooms.match_id
        AND match_participants.user_id = auth.uid()
    ))
  );

-- Khóa ghi client tuyệt đối (deny-write by default: không tạo policy INSERT/UPDATE/DELETE cho client)

-- ==============================================================================
-- 3. RPC: CREATE_ROOM (Tạo phòng đấu mới)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_room(p_game_id text)
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

  -- 2. Kiểm tra trò chơi hợp lệ và đang kích hoạt
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = p_game_id AND is_enabled = true) THEN
    RAISE EXCEPTION 'Trò chơi không tồn tại hoặc đang bị tạm khóa' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Tự động hủy phòng waiting cũ của host (nếu có)
  UPDATE public.rooms
  SET status = 'cancelled'
  WHERE host_id = v_caller_id AND status = 'waiting';

  -- 4. Sinh mã ngẫu nhiên 6 ký tự an toàn từ bảng 32 ký tự
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
        status,
        expires_at
      ) VALUES (
        v_code,
        v_caller_id,
        p_game_id,
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

-- ==============================================================================
-- 4. RPC: JOIN_ROOM (Vào phòng đấu & Khởi tạo ván đấu)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.join_room(p_code text)
RETURNS TABLE(match_id uuid, my_seat smallint, game_id text)
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
    'online_1v1',
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

  RETURN QUERY SELECT v_new_match_id, v_guest_seat, v_room.game_id;
END;
$$;

-- ==============================================================================
-- 5. RPC: CANCEL_ROOM (Hủy phòng đấu)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.cancel_room(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập để hủy phòng' USING ERRCODE = '42501';
  END IF;

  UPDATE public.rooms
  SET status = 'cancelled'
  WHERE code = p_code
    AND host_id = v_caller_id
    AND status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_ROOM' USING ERRCODE = 'P0009';
  END IF;

  RETURN true;
END;
$$;

-- ==============================================================================
-- 6. RPC: GET_MY_ROOM_STATUS (Tra cứu trạng thái phòng - Fallback Polling)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_my_room_status(p_code text)
RETURNS TABLE(status text, match_id uuid, game_id text, my_seat smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_room record;
  v_seat smallint;
BEGIN
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập để kiểm tra phòng' USING ERRCODE = '42501';
  END IF;

  SELECT * FROM public.rooms WHERE code = p_code INTO v_room;
  IF v_room IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND' USING ERRCODE = 'P0004';
  END IF;

  -- Trường hợp 1: Caller là host của phòng
  IF v_room.host_id = v_caller_id THEN
    IF v_room.match_id IS NOT NULL THEN
      SELECT seat_index FROM public.match_participants
      WHERE match_participants.match_id = v_room.match_id
        AND match_participants.user_id = v_caller_id
      INTO v_seat;
    ELSE
      v_seat := 0;
    END IF;

    RETURN QUERY SELECT v_room.status, v_room.match_id, v_room.game_id, v_seat;
    RETURN;
  END IF;

  -- Trường hợp 2: Caller là guest đã match vào trận
  IF v_room.match_id IS NOT NULL THEN
    SELECT seat_index FROM public.match_participants
    WHERE match_participants.match_id = v_room.match_id
      AND match_participants.user_id = v_caller_id
    INTO v_seat;

    IF FOUND THEN
      RETURN QUERY SELECT v_room.status, v_room.match_id, v_room.game_id, v_seat;
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'NOT_ROOM_MEMBER' USING ERRCODE = 'P0010';
END;
$$;

-- ==============================================================================
-- 7. CẤP QUYỀN THỰC THI CHO 4 RPCs MỚI
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.create_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_room(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_room(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.join_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.join_room(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.cancel_room(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_room(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_room(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_my_room_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_room_status(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_my_room_status(text) FROM anon, public;

-- ==============================================================================
-- 8. DROP SCAFFOLD FUNCTION TỪ PHASE P3.2B (TRẢ NỢ KỸ THUẬT)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.create_test_online_match(uuid);
