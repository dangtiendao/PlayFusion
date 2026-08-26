-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ THỦ CÔNG: RATING DECAY & BẢO VỆ SÀN (DEV DATABASE)
-- (SUPABASE/TESTS/P4.6C-MANUAL-CHECK.SQL)
-- ==============================================================================
-- Mục tiêu kiểm chứng:
-- 1. Trừ 10 điểm cho kỳ thủ >= 1600 nghỉ > 30 ngày (User A: 1700 -> 1690).
-- 2. Giữ sàn 1600 cho kỳ thủ sát mốc (User B: 1605 -> 1600, trừ 5 điểm).
-- 3. Không trừ điểm kỳ thủ mới thi đấu (User C: 1700 nghỉ 1 ngày -> 1700).
-- 4. Không trừ điểm kỳ thủ bậc thấp (User D: 1400 nghỉ 60 ngày -> 1400).
-- 5. Idempotent: Gọi lại trong cùng tuần -> applied = 0, điểm số bảo toàn 100%.
-- ==============================================================================

DO $$
DECLARE
  v_season_id smallint;
  v_res1 jsonb;
  v_res2 jsonb;

  -- 4 Test Users
  v_ua uuid := 'aaaaaaaa-1111-4aaa-aaaa-aaaaaaaaaaaa'::uuid;
  v_ub uuid := 'bbbbbbbb-2222-4bbb-bbbb-bbbbbbbbbbbb'::uuid;
  v_uc uuid := 'cccccccc-3333-4ccc-cccc-cccccccccccc'::uuid;
  v_ud uuid := 'dddddddd-4444-4ddd-dddd-dddddddddddd'::uuid;

  v_ra record;
  v_rb record;
  v_rc record;
  v_rd record;

  v_log_count int;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'BẮT ĐẦU KIỂM THỬ QUY TRÌNH RATING DECAY (P4.6C)';
  RAISE NOTICE '============================================================';

  -- 1. LẤY HOẶC TẠO MÙA ACTIVE
  SELECT id INTO v_season_id FROM public.seasons WHERE is_active = true LIMIT 1;
  IF v_season_id IS NULL THEN
    INSERT INTO public.seasons (name, started_at, is_active)
    VALUES ('Mùa Test Decay', now(), true)
    RETURNING id INTO v_season_id;
  END IF;

  -- 2. TẠO PROFILES VÀ DỰNG DỮ LIỆU RATINGS MẪU
  INSERT INTO public.profiles (user_id, display_name, role)
  VALUES
    (v_ua, 'Kỳ Thủ A (1700/Nghỉ 40d)', 'player'),
    (v_ub, 'Kỳ Thủ B (1605/Nghỉ 40d)', 'player'),
    (v_uc, 'Kỳ Thủ C (1700/Nghỉ 1d)', 'player'),
    (v_ud, 'Kỳ Thủ D (1400/Nghỉ 60d)', 'player')
  ON CONFLICT (user_id) DO NOTHING;

  -- User A: 1700 Elo, 20 trận, nghỉ 40 ngày -> Kỳ vọng: -10 điểm còn 1690
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at
  ) VALUES (
    v_ua, 'caro', v_season_id, 1700, 100, 0.06,
    20, 15, 5, 0, 3, 1750, true, now() - interval '40 days'
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1700, games_played = 20, last_played_at = now() - interval '40 days';

  -- User B: 1605 Elo, 15 trận, nghỉ 40 ngày -> Kỳ vọng: -5 điểm còn 1600 (chạm sàn)
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at
  ) VALUES (
    v_ub, 'caro', v_season_id, 1605, 120, 0.06,
    15, 10, 5, 0, 1, 1620, true, now() - interval '40 days'
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1605, games_played = 15, last_played_at = now() - interval '40 days';

  -- User C: 1700 Elo, 20 trận, nghỉ 1 ngày -> Kỳ vọng: KHÔNG decay (vẫn 1700)
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at
  ) VALUES (
    v_uc, 'caro', v_season_id, 1700, 100, 0.06,
    20, 15, 5, 0, 3, 1700, true, now() - interval '1 day'
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1700, games_played = 20, last_played_at = now() - interval '1 day';

  -- User D: 1400 Elo, 30 trận, nghỉ 60 ngày -> Kỳ vọng: KHÔNG decay (dưới 1600, vẫn 1400)
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at
  ) VALUES (
    v_ud, 'caro', v_season_id, 1400, 150, 0.06,
    30, 15, 15, 0, 0, 1450, true, now() - interval '60 days'
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1400, games_played = 30, last_played_at = now() - interval '60 days';

  -- 3. LẦN 1: THỰC THI apply_rating_decay
  v_res1 := public.apply_rating_decay();
  RAISE NOTICE '>> Kết quả chạy Lần 1: %', v_res1;

  ASSERT (v_res1->>'applied')::int = 2, 'LỖI: Lần 1 phải có đúng 2 kỳ thủ (A và B) bị decay';

  -- 4. KIỂM TRA ĐIỂM SỐ SAU LẦN 1
  SELECT rating, best_rating INTO v_ra FROM public.player_ratings WHERE user_id = v_ua AND season_id = v_season_id AND game_id = 'caro';
  SELECT rating, best_rating INTO v_rb FROM public.player_ratings WHERE user_id = v_ub AND season_id = v_season_id AND game_id = 'caro';
  SELECT rating, best_rating INTO v_rc FROM public.player_ratings WHERE user_id = v_uc AND season_id = v_season_id AND game_id = 'caro';
  SELECT rating, best_rating INTO v_rd FROM public.player_ratings WHERE user_id = v_ud AND season_id = v_season_id AND game_id = 'caro';

  RAISE NOTICE '>> Điểm sau decay: A = % (Kỳ vọng 1690, best=%), B = % (Kỳ vọng 1600), C = % (1700), D = % (1400)',
    v_ra.rating, v_ra.best_rating, v_rb.rating, v_rc.rating, v_rd.rating;

  ASSERT v_ra.rating = 1690, 'LỖI: User A phải bị trừ 10 điểm về 1690';
  ASSERT v_ra.best_rating = 1750, 'LỖI: User A best_rating phải giữ nguyên 1750';
  ASSERT v_rb.rating = 1600, 'LỖI: User B phải chạm sàn đúng 1600 (chỉ trừ 5 điểm)';
  ASSERT v_rc.rating = 1700, 'LỖI: User C mới chơi không được decay';
  ASSERT v_rd.rating = 1400, 'LỖI: User D bậc thấp không được decay';

  -- 5. LẦN 2 (IDEMPOTENCY): GỌI LẠI TRONG CÙNG TUẦN
  v_res2 := public.apply_rating_decay();
  RAISE NOTICE '>> Kết quả chạy Lần 2 (cùng tuần): %', v_res2;

  ASSERT (v_res2->>'applied')::int = 0, 'LỖI: Lần 2 trong cùng tuần phải có applied = 0 (Idempotent)';

  -- Kiểm tra điểm không đổi
  SELECT rating INTO v_ra FROM public.player_ratings WHERE user_id = v_ua AND season_id = v_season_id AND game_id = 'caro';
  ASSERT v_ra.rating = 1690, 'LỖI: User A không được trừ tiếp trong cùng tuần';

  -- Kiểm tra số dòng log trong bảng rating_decay_log
  SELECT COUNT(*) INTO v_log_count FROM public.rating_decay_log WHERE season_id = v_season_id AND game_id = 'caro';
  ASSERT v_log_count = 2, 'LỖI: Chỉ có đúng 2 dòng log được ghi';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TẤT CẢ CÁC BƯỚC KIỂM THỬ THỦ CÔNG P4.6C ĐỀU ĐẠT CHUẨN 100%!';
  RAISE NOTICE '============================================================';
END $$;
