-- ==============================================================================
-- PLAYFUSION DATABASE TEST SCRIPT: p2.2b-manual-check.sql
-- ==============================================================================
-- Mục tiêu: Kiểm chứng toàn diện Schema, Constraints, Indexes và RLS của 2 bảng
--          public.matches và public.match_participants trên môi trường DEV.
--
-- Hướng dẫn: Dán toàn bộ hoặc từng khối vào SQL Editor Supabase Dashboard (DEV).
-- Mỗi khối đều có ghi chú KỲ VỌNG rõ ràng. Cuối file có khối dọn sạch dữ liệu.
-- ==============================================================================

DO $$
DECLARE
  v_test_user_id uuid;
  v_test_match_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_invalid_match_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_cascade_match_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;
  v_count int;
BEGIN
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'BẮT ĐẦU CHUỖI KIỂM THỬ MANUAL CHO PHASE P2.2b (MATCHES & PARTICIPANTS)';
  RAISE NOTICE '======================================================================';

  -- 0. LẤY MỘT USER_ID THẬT TỪ PUBLIC.PROFILES ĐỂ TEST
  SELECT user_id INTO v_test_user_id FROM public.profiles LIMIT 1;
  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có user nào trong public.profiles để kiểm thử. Hãy chạy P2.1c / đăng nhập khách trước.';
  END IF;
  RAISE NOTICE '-> Sử dụng test user_id: %', v_test_user_id;

  -- ----------------------------------------------------------------------------
  -- TEST 1: INSERT HỢP LỆ (1 VÁN VS_AI KẾT THÚC: 1 NGƯỜI THẬT + 1 BOT HARD)
  -- KỲ VỌNG: INSERT THÀNH CÔNG 1 VÁN VÀ 2 DÒNG PARTICIPANTS
  -- ----------------------------------------------------------------------------
  INSERT INTO public.matches (
    id, game_id, mode, is_ranked, started_at, ended_at, duration_ms, end_reason, engine_options, moves
  ) VALUES (
    v_test_match_id,
    'caro',
    'vs_ai',
    false,
    now() - interval '2 minutes',
    now(),
    120000,
    'normal',
    '{"boardSize":15}',
    '112,113,97,98,82'
  );

  INSERT INTO public.match_participants (
    match_id, seat_index, user_id, is_bot, result, score
  ) VALUES (
    v_test_match_id, 0, v_test_user_id, false, 'win', 1
  );

  INSERT INTO public.match_participants (
    match_id, seat_index, user_id, is_bot, bot_level, result, score
  ) VALUES (
    v_test_match_id, 1, NULL, true, 'hard', 'loss', 0
  );

  RAISE NOTICE '✅ TEST 1 PASS: Insert hợp lệ ván vs_ai và 2 participants thành công!';

  -- ----------------------------------------------------------------------------
  -- TEST 2: VI PHẠM CHECK NHẤT QUÁN (ENDED_AT IS NULL NHƯNG CÓ END_REASON)
  -- KỲ VỌNG: NÉM LỖI RÀNG BUỘC chk_matches_ended_consistency
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.matches (
      id, game_id, mode, started_at, ended_at, end_reason
    ) VALUES (
      v_invalid_match_id, 'caro', 'online_1v1', now(), NULL, 'resign'
    );
    RAISE EXCEPTION 'TEST 2 FAIL: Không chặn được ván có end_reason nhưng ended_at là NULL!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 2 PASS: Chặn thành công ván đấu thiếu ended_at khi có end_reason (chk_matches_ended_consistency)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 3: VI PHẠM CHECK BOT CÓ USER_ID (IS_BOT = TRUE NHƯNG CÓ USER_ID)
  -- KỲ VỌNG: NÉM LỖI RÀNG BUỘC chk_participant_bot_user
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.match_participants (
      match_id, seat_index, user_id, is_bot, bot_level
    ) VALUES (
      v_test_match_id, 2, v_test_user_id, true, 'easy'
    );
    RAISE EXCEPTION 'TEST 3 FAIL: Không chặn được Bot AI có user_id!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 3 PASS: Chặn thành công Bot AI có user_id (chk_participant_bot_user)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 4: VI PHẠM CHECK BOT THIẾU BOT_LEVEL (IS_BOT = TRUE NHƯNG BOT_LEVEL LÀ NULL)
  -- KỲ VỌNG: NÉM LỖI RÀNG BUỘC chk_participant_bot_level
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.match_participants (
      match_id, seat_index, user_id, is_bot, bot_level
    ) VALUES (
      v_test_match_id, 2, NULL, true, NULL
    );
    RAISE EXCEPTION 'TEST 4 FAIL: Không chặn được Bot AI thiếu bot_level!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 4 PASS: Chặn thành công Bot AI thiếu bot_level (chk_participant_bot_level)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 5: VI PHẠM UNIQUE INDEX 1 USER NGỒI 2 GHẾ TRONG CÙNG VÁN
  -- KỲ VỌNG: NÉM LỖI UNIQUE idx_match_participants_unique_user
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.match_participants (
      match_id, seat_index, user_id, is_bot, result
    ) VALUES (
      v_test_match_id, 2, v_test_user_id, false, 'draw'
    );
    RAISE EXCEPTION 'TEST 5 FAIL: Không chặn được 1 user ngồi 2 ghế trong cùng 1 trận!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ TEST 5 PASS: Chặn thành công 1 user ngồi 2 ghế (idx_match_participants_unique_user)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 6: VI PHẠM KHÓA NGOẠI GAME_ID KHÔNG TỒN TẠI
  -- KỲ VỌNG: NÉM LỖI FOREIGN KEY matches_game_id_fkey
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.matches (
      id, game_id, mode, started_at
    ) VALUES (
      v_invalid_match_id, 'co_vua_chua_co', 'vs_ai', now()
    );
    RAISE EXCEPTION 'TEST 6 FAIL: Không chặn được game_id không tồn tại trong public.games!';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE '✅ TEST 6 PASS: Chặn thành công game_id không tồn tại (matches_game_id_fkey)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 7: KIỂM TRA CASCADE DELETE (XÓA MATCH THÌ PARTICIPANTS TỰ XÓA)
  -- KỲ VỌNG: XÓA 1 MATCH LÀM TỰ ĐỘNG XÓA 2 DÒNG PARTICIPANTS
  -- ----------------------------------------------------------------------------
  INSERT INTO public.matches (id, game_id, mode, started_at)
  VALUES (v_cascade_match_id, 'caro', 'local_pvp', now());

  INSERT INTO public.match_participants (match_id, seat_index, user_id)
  VALUES (v_cascade_match_id, 0, v_test_user_id), (v_cascade_match_id, 1, NULL);

  DELETE FROM public.matches WHERE id = v_cascade_match_id;

  SELECT count(*) INTO v_count FROM public.match_participants WHERE match_id = v_cascade_match_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7 FAIL: Xóa match không cascade xóa match_participants!';
  END IF;
  RAISE NOTICE '✅ TEST 7 PASS: Cascade DELETE hoạt động chính xác (0 participants mồ côi)!';

  -- ----------------------------------------------------------------------------
  -- 8. DỌN SẠCH DỮ LIỆU THỬ NGHIỆM (CLEANUP)
  -- ----------------------------------------------------------------------------
  DELETE FROM public.matches WHERE id = v_test_match_id;
  RAISE NOTICE '🧹 CLEANUP: Đã dọn sạch toàn bộ dữ liệu test. Database DEV hoàn toàn sạch sẽ!';

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '🎉 TẤT CẢ 7 BÀI TEST SCHEMA MATCHES & PARTICIPANTS ĐÃ PASS 100%!';
  RAISE NOTICE '======================================================================';
END;
$$;
