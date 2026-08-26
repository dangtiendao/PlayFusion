-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0016_settle_foundation.sql
-- ==============================================================================
-- Mục tiêu: Thiết lập nền tảng cơ sở dữ liệu cho quá trình kết toán ván đấu
--          (settle_match) và chính thức kích hoạt chế độ Xếp hạng (Ranked) cho
--          các trận đấu online qua phòng đấu (Phase P4.2a).
--
-- Ghi chú kiến trúc & Security:
-- 1. THÊM CỘT SETTLED_AT VÀO BẢNG PUBLIC.MATCHES:
--    - settled_at timestamptz NULL: Dấu mốc thời gian ván đấu được kết toán.
--    - QUYẾT ĐỊNH QUAN TRỌNG (IDEMPOTENCY GUARD):
--      + NULL: Trận đấu chưa được kết toán (chờ settle).
--      + NOT NULL: Trận đấu đã được xử lý xong bởi settle_match.
--      + Mọi ván đấu khi đi qua luồng kết toán (kể cả trận unranked hoặc trận bị hủy 'abort')
--        VẪN SẼ ĐƯỢC ĐÓNG DẤU settled_at (với ý nghĩa "no-op" - đã xử lý nhưng không đổi điểm)
--        để phân biệt rạch ròi giữa "trận chưa xử lý" vs "trận đã xử lý nhưng không có gì để áp".
-- 2. SEED CẤU HÌNH SYSTEM_CONFIG (TRẢ NỢ PHASE P4.1):
--    - 'elo.placement_games'    -> {"games": 15} (Số trận định hạng ban đầu)
--    - 'elo.mismatch_threshold' -> {"points": 400} (Ngưỡng chênh lệch điểm kích hoạt giảm K bên mạnh)
--    - 'elo.mismatch_dampen'    -> {"factor": 0.5} (Tỷ lệ giảm K bên mạnh 50%)
--    - Các key tiền tố 'elo.' nằm trong policy SELECT công khai của system_config (migration 0008),
--      được đọc bởi Edge Function Trọng tài / Settle (service_role) và Client (preview).
-- 3. NÂNG CẤP RPC JOIN_ROOM (BẬT RANKED CHO TRẬN ONLINE):
--    - Tra cứu mùa giải đang diễn ra: SELECT id FROM seasons WHERE is_active = true.
--    - Gán is_ranked = true và season_id = active_season_id cho cả 2 chế độ:
--      'online_1v1' (realtime) và 'online_correspondence' (theo lượt).
--    - CƠ CHẾ FAIL-SOFT (AN TOÀN KHI THIẾU MÙA):
--      Nếu database chưa kích hoạt mùa giải nào (v_season_id IS NULL), hệ thống tự động
--      gán is_ranked = false và season_id = NULL, đảm bảo trận đấu vẫn được tạo thành công
--      và không làm gián đoạn trải nghiệm của người chơi.
-- 4. RLS MATRIX:
--    - Cột settled_at được bảo vệ bởi chính sách deny-write mặc định của public.matches.
--    - Client chỉ được phép SELECT, cấm tuyệt đối mọi thao tác INSERT/UPDATE/DELETE.
-- ==============================================================================

-- 1. THÊM CỘT SETTLED_AT VÀO BẢNG PUBLIC.MATCHES
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS settled_at timestamptz NULL;

COMMENT ON COLUMN public.matches.settled_at IS
  'Thời điểm ván đấu được kết toán xong bởi settle_match (Idempotency Guard). NULL = chưa settle.';

-- 2. SEED 3 KEY CẤU HÌNH ELO VÀO SYSTEM_CONFIG
INSERT INTO public.system_config (key, value, description)
VALUES
  (
    'elo.placement_games',
    '{"games": 15}'::jsonb,
    'Số ván đấu định hạng ban đầu áp dụng hệ số K tân thủ (K=60)'
  ),
  (
    'elo.mismatch_threshold',
    '{"points": 400}'::jsonb,
    'Ngưỡng chênh lệch điểm rating để kích hoạt cơ chế giảm hệ số K cho bên mạnh'
  ),
  (
    'elo.mismatch_dampen',
    '{"factor": 0.5}'::jsonb,
    'Tỷ lệ giảm hệ số K của người chơi bên mạnh khi chênh lệch vượt ngưỡng mismatch'
  )
ON CONFLICT (key) DO NOTHING;

-- 3. NÂNG CẤP RPC: JOIN_ROOM (BẬT RANKED VÀ GẮN MÙA GIẢI ACTIVE)
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
  v_season_id smallint;
  v_is_ranked boolean := false;
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

  -- 7. CHỐNG ĐUA & TẠO MÃ VÁN ĐẤU TRƯỚC
  v_new_match_id := extensions.gen_random_uuid();

  -- 8. TRA CỨU MÙA GIẢI ĐANG KÍCH HOẠT (ACTIVE SEASON) & GÁN RANKED
  -- Fail-soft: Nếu không tìm thấy mùa active, trận đấu vẫn được tạo thành công
  -- nhưng với is_ranked = false và season_id = NULL (không chặn người chơi vì thiếu mùa).
  SELECT id INTO v_season_id
  FROM public.seasons
  WHERE is_active = true
  LIMIT 1;

  IF v_season_id IS NOT NULL THEN
    v_is_ranked := true;
  ELSE
    v_is_ranked := false;
  END IF;

  -- 9. CHIA GHẾ NGẪU NHIÊN CÔNG BẰNG (50/50 CHO HOST VÀ GUEST)
  IF random() < 0.5 THEN
    v_host_seat := 0;
    v_guest_seat := 1;
  ELSE
    v_host_seat := 1;
    v_guest_seat := 0;
  END IF;

  -- 10. TẠO VÁN ĐẤU TRONG BẢNG MATCHES
  -- Kế thừa mode từ phòng đấu (v_room.mode), gán is_ranked và season_id
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
    v_is_ranked,
    v_season_id,
    now()
  );

  -- 11. CẬP NHẬT TRẠNG THÁI PHÒNG ĐẤU SANG 'matched'
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

  -- 12. TẠO MATCH_PARTICIPANTS
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
