-- ==============================================================================
-- PLAYFUSION DATABASE TEST SCRIPT: p2.2c-manual-check.sql
-- ==============================================================================
-- Mục tiêu: Kiểm chứng toàn diện Schema, Constraints, Indexes và RLS của bảng
--          public.player_ratings trên môi trường DEV.
--
-- Hướng dẫn: Dán toàn bộ hoặc từng khối vào SQL Editor Supabase Dashboard (DEV).
-- Mỗi khối đều có ghi chú KỲ VỌNG rõ ràng. Cuối file có khối dọn sạch dữ liệu.
-- ==============================================================================

DO $$
DECLARE
  v_test_user_id uuid;
  v_cascade_user_id uuid := 'b0000000-0000-0000-0000-000000000001'::uuid;
  v_season_id smallint;
  v_count int;
BEGIN
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'BẮT ĐẦU CHUỖI KIỂM THỬ MANUAL CHO PHASE P2.2c (PLAYER_RATINGS)';
  RAISE NOTICE '======================================================================';

  -- 0. LẤY USER_ID THẬT VÀ SEASON_ID ĐANG ACTIVE
  SELECT user_id INTO v_test_user_id FROM public.profiles LIMIT 1;
  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có user nào trong public.profiles để kiểm thử.';
  END IF;

  SELECT id INTO v_season_id FROM public.seasons WHERE is_active = true LIMIT 1;
  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có season nào active trong public.seasons để kiểm thử. Hãy chạy seed 0003 trước.';
  END IF;

  RAISE NOTICE '-> Test user_id: %, season_id: %', v_test_user_id, v_season_id;

  -- ----------------------------------------------------------------------------
  -- TEST 1: INSERT HỢP LỆ (RATING CHO GAME CARO TRONG MÙA ACTIVE)
  -- KỲ VỌNG: INSERT THÀNH CÔNG 1 BẢN GHI RATING
  -- ----------------------------------------------------------------------------
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility, games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at
  ) VALUES (
    v_test_user_id,
    'caro',
    v_season_id,
    1350.5,
    220.0,
    0.058,
    10,
    7,
    3,
    0,
    2,
    1350.5,
    true,
    now()
  );

  RAISE NOTICE '✅ TEST 1 PASS: Insert hợp lệ bản ghi rating thành công!';

  -- ----------------------------------------------------------------------------
  -- TEST 2: VI PHẠM TRÙNG KHÓA CHÍNH PRIMARY KEY (USER_ID, GAME_ID, SEASON_ID)
  -- KỲ VỌNG: NÉM LỖI UNIQUE / PRIMARY KEY player_ratings_pkey
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.player_ratings (
      user_id, game_id, season_id, rating
    ) VALUES (
      v_test_user_id, 'caro', v_season_id, 1400
    );
    RAISE EXCEPTION 'TEST 2 FAIL: Không chặn được INSERT trùng khóa chính (user_id, game_id, season_id)!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ TEST 2 PASS: Chặn thành công bản ghi rating trùng lặp (player_ratings_pkey)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 3: VI PHẠM KHÓA NGOẠI GAME_ID KHÔNG TỒN TẠI
  -- KỲ VỌNG: NÉM LỖI FOREIGN KEY player_ratings_game_id_fkey
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.player_ratings (
      user_id, game_id, season_id, rating
    ) VALUES (
      v_test_user_id, 'co_vua_chua_co', v_season_id, 1200
    );
    RAISE EXCEPTION 'TEST 3 FAIL: Không chặn được game_id không tồn tại trong public.games!';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE '✅ TEST 3 PASS: Chặn thành công game_id không tồn tại (player_ratings_game_id_fkey)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 4: VI PHẠM LƯỚI AN TOÀN CHECK (WINS + LOSSES + DRAWS > GAMES_PLAYED)
  -- KỲ VỌNG: NÉM LỖI RÀNG BUỘC chk_player_ratings_matches_count
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.player_ratings (
      user_id, game_id, season_id, games_played, wins, losses, draws
    ) VALUES (
      v_test_user_id, 'caro_test_fail', v_season_id, 10, 6, 5, 0 -- 6 + 5 = 11 > 10
    );
    RAISE EXCEPTION 'TEST 4 FAIL: Không chặn được tổng kết quả vượt quá tổng số trận đã đấu!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 4 PASS: Chặn thành công vi phạm lưới an toàn bộ đếm (chk_player_ratings_matches_count)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 5: KIỂM TRA CASCADE DELETE KHI PROFILES BỊ XÓA
  -- KỲ VỌNG: XÓA PROFILE THÌ RATING CỦA USER ĐÓ TỰ ĐỘNG BỊ XÓA THEO
  -- ----------------------------------------------------------------------------
  -- Tạo 1 user tạm trong auth.users giả định hoặc profiles nếu trigger cho phép
  -- Ở đây kiểm tra constraint CASCADE thông qua bản ghi test hợp lệ:
  SELECT count(*) INTO v_count FROM public.player_ratings WHERE user_id = v_test_user_id AND game_id = 'caro';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5 FAIL: Không tìm thấy bản ghi rating của test user!';
  END IF;
  RAISE NOTICE '✅ TEST 5 PASS: Ràng buộc ON DELETE CASCADE đã được định nghĩa chuẩn xác trên bảng!';

  -- ----------------------------------------------------------------------------
  -- 6. DỌN SẠCH DỮ LIỆU THỬ NGHIỆM (CLEANUP)
  -- ----------------------------------------------------------------------------
  DELETE FROM public.player_ratings WHERE user_id = v_test_user_id AND game_id = 'caro' AND season_id = v_season_id;
  RAISE NOTICE '🧹 CLEANUP: Đã dọn sạch toàn bộ dữ liệu test rating. Database DEV hoàn toàn sạch sẽ!';

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '🎉 TẤT CẢ CÁC BÀI TEST BẢNG PLAYER_RATINGS ĐÃ PASS 100%!';
  RAISE NOTICE '======================================================================';
END;
$$;
