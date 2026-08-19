-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0011_record_offline_match.sql
-- ==============================================================================
-- Mục tiêu: Tạo Stored Function (RPC) SECURITY DEFINER `record_offline_match`
--          để mở đường ghi an toàn duy nhất cho các ván đấu Offline (solo, vs_ai, local_pvp).
--
-- Ghi chú kiến trúc:
-- 1. CỔNG GHI TRẬN BẢO MẬT (SECURITY DEFINER + SEARCH_PATH KHÓA CỨNG):
--    - Client vẫn bị cấm tuyệt đối 100% quyền INSERT trực tiếp vào `matches` và `match_participants`.
--    - Mọi thao tác ghi ván đấu offline bắt buộc phải gọi qua RPC này.
-- 2. BẢO VỆ CHỐNG MẠO DANH & GIAN LẬN (SERVER-SIDE VALIDATION):
--    - (a) Bắt buộc caller có phiên đăng nhập hợp lệ (auth.uid() IS NOT NULL).
--    - (b) Chỉ chấp nhận các mode offline: 'solo', 'vs_ai', 'local_pvp'.
--    - (c) game_id phải tồn tại trong bảng `games` và đang mở (`is_enabled = true`).
--    - (d) Server TỰ ĐỘNG GÁN `user_id = auth.uid()` cho ghế người chơi đầu tiên,
--          ngăn chặn việc client gửi user_id giả mạo của người khác.
--    - (e) Thời lượng ván đấu duration_ms phải nằm trong khoảng hợp lý (0 < duration < 24h).
--    - (f) Cưỡng chế is_ranked = false và season_id = NULL (trận offline không tính rank).
--    - (g) Server tự tính ended_at = started_at + duration_ms.
-- 3. TÍNH IDEMPOTENT & CHỐNG GHI ĐÔI:
--    - match_id (UUID do client sinh khi bắt đầu ván) đóng vai trò Idempotency Key.
--    - Nếu match_id đã tồn tại trong DB, hàm không insert lại mà trả về match_id ngay lập tức.
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV và PROD).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.record_offline_match(p_match jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_match_id uuid;
  v_game_id text;
  v_mode text;
  v_started_at timestamptz;
  v_duration_ms integer;
  v_ended_at timestamptz;
  v_end_reason text;
  v_moves text;
  v_final_state text;
  v_engine_options text;
  v_game_min_players integer;
  v_game_max_players integer;
  v_participants jsonb;
  v_part_count integer;
  v_human_assigned boolean := false;
  v_item jsonb;
  v_seat_index integer;
  v_is_bot boolean;
  v_bot_level text;
  v_outcome text;
  v_placement integer;
  v_score integer;
  v_assigned_user_id uuid;
BEGIN
  -- a. Kiểm tra xác thực người gọi (Khách ẩn danh vẫn có auth.uid() hợp lệ)
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Yêu cầu đăng nhập để lưu kết quả ván đấu.' USING ERRCODE = '42501';
  END IF;

  -- Trích xuất các trường cơ bản từ payload JSONB
  IF p_match IS NULL OR jsonb_typeof(p_match) <> 'object' THEN
    RAISE EXCEPTION 'Validation Error: Payload ván đấu không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_match_id := (p_match->>'match_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Validation Error: match_id không phải là UUID hợp lệ.' USING ERRCODE = '22023';
  END IF;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'Validation Error: match_id không được để trống.' USING ERRCODE = '22023';
  END IF;

  -- IDEMPOTENCY: Nếu ván đấu đã được ghi nhận thành công trước đó -> Bỏ qua, trả về match_id
  IF EXISTS (SELECT 1 FROM public.matches WHERE id = v_match_id) THEN
    RETURN v_match_id;
  END IF;

  v_game_id := p_match->>'game_id';
  v_mode := p_match->>'mode';
  v_started_at := (p_match->>'started_at')::timestamptz;
  v_duration_ms := (p_match->>'duration_ms')::integer;
  v_end_reason := p_match->>'end_reason';
  v_moves := p_match->>'moves';
  v_final_state := p_match->>'final_state';
  v_engine_options := p_match->>'engine_options';
  v_participants := p_match->'participants';

  -- b. Kiểm tra chế độ chơi (RPC này DÀNH RIÊNG cho trận offline; online đi qua settle_match P4.2)
  IF v_mode NOT IN ('solo', 'vs_ai', 'local_pvp') THEN
    RAISE EXCEPTION 'Validation Error: Chế độ chơi "%" không hợp lệ cho trận đấu offline.', v_mode USING ERRCODE = '22023';
  END IF;

  -- c. Kiểm tra game_id tồn tại và đang mở (is_enabled = true)
  SELECT min_players, max_players INTO v_game_min_players, v_game_max_players
  FROM public.games
  WHERE id = v_game_id AND is_enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Validation Error: Trò chơi "%" không tồn tại hoặc đã bị vô hiệu hóa.', v_game_id USING ERRCODE = '22023';
  END IF;

  -- e. Kiểm tra thời lượng ván đấu hợp lý (0 < duration <= 24 giờ = 86,400,000 ms)
  IF v_duration_ms IS NULL OR v_duration_ms <= 0 OR v_duration_ms > 86400000 THEN
    RAISE EXCEPTION 'Validation Error: Thời lượng ván đấu (% ms) không hợp lệ.', v_duration_ms USING ERRCODE = '22023';
  END IF;

  -- g. Server tự tính toán thời điểm kết thúc ván đấu (không tin thời gian kết thúc client gửi)
  IF v_started_at IS NULL THEN
    v_started_at := clock_timestamp() - (v_duration_ms || ' milliseconds')::interval;
  END IF;
  v_ended_at := v_started_at + (v_duration_ms || ' milliseconds')::interval;

  -- d. Kiểm tra danh sách đấu thủ
  IF v_participants IS NULL OR jsonb_typeof(v_participants) <> 'array' THEN
    RAISE EXCEPTION 'Validation Error: Danh sách participants không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  v_part_count := jsonb_array_length(v_participants);
  IF v_part_count < v_game_min_players OR v_part_count > v_game_max_players THEN
    RAISE EXCEPTION 'Validation Error: Số lượng đấu thủ (%) không nằm trong giới hạn cho phép (%..%).',
      v_part_count, v_game_min_players, v_game_max_players USING ERRCODE = '22023';
  END IF;

  -- f. Ghi bản ghi ván đấu (is_ranked LUÔN = false, season_id LUÔN = NULL cho trận offline)
  INSERT INTO public.matches (
    id, game_id, season_id, game_mode, is_ranked, status,
    started_at, ended_at, duration_ms, end_reason, moves, final_state, engine_options
  ) VALUES (
    v_match_id, v_game_id, NULL, v_mode, false, 'completed',
    v_started_at, v_ended_at, v_duration_ms, v_end_reason, v_moves, v_final_state, v_engine_options
  );

  -- Ghi danh sách đấu thủ (Server tự động gán user_id cho ghế người đầu tiên)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_participants)
  LOOP
    v_seat_index := (v_item->>'seat_index')::integer;
    v_is_bot := COALESCE((v_item->>'is_bot')::boolean, false);
    v_bot_level := v_item->>'bot_level';
    v_outcome := v_item->>'result';
    v_placement := (v_item->>'placement')::integer;
    v_score := (v_item->>'score')::integer;

    IF v_is_bot THEN
      IF v_bot_level IS NULL OR v_bot_level NOT IN ('easy', 'medium', 'hard') THEN
        RAISE EXCEPTION 'Validation Error: Bot tại ghế % bắt buộc phải có bot_level hợp lệ (easy, medium, hard).', v_seat_index USING ERRCODE = '22023';
      END IF;
      v_assigned_user_id := NULL;
    ELSE
      IF NOT v_human_assigned THEN
        -- Gán chính chủ tài khoản đang đăng nhập
        v_assigned_user_id := v_caller_id;
        v_human_assigned := true;
      ELSE
        -- Ghế người thứ 2 trong chế độ local_pvp không có user_id
        v_assigned_user_id := NULL;
      END IF;
    END IF;

    INSERT INTO public.match_participants (
      match_id, user_id, seat_index, is_bot, bot_level, outcome, placement, score, rating_delta
    ) VALUES (
      v_match_id, v_assigned_user_id, v_seat_index, v_is_bot, v_bot_level, v_outcome, v_placement, v_score, NULL
    );
  END LOOP;

  RETURN v_match_id;
END;
$$;

-- Cấp quyền EXECUTE cho người dùng đã xác thực (authenticated)
GRANT EXECUTE ON FUNCTION public.record_offline_match(jsonb) TO authenticated;

-- Thu hồi quyền EXECUTE khỏi public và khách chưa xác thực (anon)
REVOKE EXECUTE ON FUNCTION public.record_offline_match(jsonb) FROM PUBLIC, anon;
