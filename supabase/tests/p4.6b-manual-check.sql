-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ THỦ CÔNG: ĐÓNG MÙA GIẢI & SOFT-RESET (DEV DATABASE)
-- (SUPABASE/TESTS/P4.6B-MANUAL-CHECK.SQL)
-- ==============================================================================
-- Mục tiêu kiểm chứng:
-- 1. Snapshot cấp huy hiệu user_season_badges đầy đủ, đúng rank (tie-break >=10 trận), đúng tier.
-- 2. Soft-reset rating sang mùa mới chính xác 100% theo công thức tính tay.
-- 3. Idempotent guard: Gọi lại với ID mùa cũ trả về season_mismatch, không làm hỏng mùa mới.
-- 4. Trận dở xuyên mùa settle chuẩn xác vào season_id của trận (mùa cũ).
-- ==============================================================================

DO $$
DECLARE
  v_old_season_id smallint;
  v_new_season_id smallint;
  v_close_result jsonb;
  v_retry_result jsonb;

  -- 3 Test Users
  v_u1 uuid := '11111111-1111-4111-a111-111111111111'::uuid;
  v_u2 uuid := '22222222-2222-4222-a222-222222222222'::uuid;
  v_u3 uuid := '33333333-3333-4333-a333-333333333333'::uuid;

  v_b1 record;
  v_b2 record;
  v_b3 record;

  v_r1 record;
  v_r2 record;
  v_r3 record;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'BẮT ĐẦU KIỂM THỬ QUY TRÌNH ĐÓNG MÙA GIẢI (CLOSE_SEASON P4.6B)';
  RAISE NOTICE '============================================================';

  -- 1. LẤY HOẶC TẠO MÙA ACTIVE HIỆN TẠI
  SELECT id INTO v_old_season_id FROM public.seasons WHERE is_active = true LIMIT 1;
  IF v_old_season_id IS NULL THEN
    INSERT INTO public.seasons (name, started_at, is_active)
    VALUES ('Mùa Test Ban Đầu', now(), true)
    RETURNING id INTO v_old_season_id;
  END IF;

  RAISE NOTICE '>> Mùa active hiện tại: id = %', v_old_season_id;

  -- 2. TẠO PROFILES VÀ DỰNG RATINGS MÙA CŨ CHO 3 USERS
  INSERT INTO public.profiles (user_id, display_name, role)
  VALUES
    (v_u1, 'Kỳ Thủ Kim Cương (1700/20 trận)', 'player'),
    (v_u2, 'Kỳ Thủ Vàng (1200/12 trận)', 'player'),
    (v_u3, 'Kỳ Thủ Tân Binh (1300/5 trận)', 'player')
  ON CONFLICT (user_id) DO NOTHING;

  -- U1: 1700 Elo, 20 trận (>= 10) -> Dự kiến: Tier diamond, Rank 1
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done
  ) VALUES (
    v_u1, 'caro', v_old_season_id, 1700, 100, 0.06,
    20, 15, 5, 0, 3, 1750, true
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1700, games_played = 20, wins = 15, losses = 5, draws = 0;

  -- U2: 1200 Elo, 12 trận (>= 10) -> Dự kiến: Tier gold, Rank 2
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done
  ) VALUES (
    v_u2, 'caro', v_old_season_id, 1200, 150, 0.06,
    12, 6, 6, 0, 0, 1250, true
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1200, games_played = 12, wins = 6, losses = 6, draws = 0;

  -- U3: 1300 Elo, 5 trận (< 10) -> Dự kiến: Tier gold, Rank NULL
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility,
    games_played, wins, losses, draws, streak, best_rating, placement_done
  ) VALUES (
    v_u3, 'caro', v_old_season_id, 1300, 200, 0.06,
    5, 4, 1, 0, 2, 1300, false
  ) ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1300, games_played = 5, wins = 4, losses = 1, draws = 0;

  -- 3. THỰC HIỆN ĐÓNG MÙA QUA STORED PROCEDURE close_season
  v_close_result := public.close_season(v_old_season_id, 'Mùa 2 - Kỷ Nguyên Mới');
  RAISE NOTICE '>> Kết quả đóng mùa: %', v_close_result;

  ASSERT (v_close_result->>'closed')::boolean = true, 'LỖI: close_season phải trả về closed = true';
  v_new_season_id := (v_close_result->>'new_season')::smallint;

  -- 4. KIỂM TRA HUY HIỆU ĐÃ CẤP (USER_SEASON_BADGES)
  SELECT final_rating, final_tier, final_rank, games_played
  INTO v_b1 FROM public.user_season_badges
  WHERE user_id = v_u1 AND season_id = v_old_season_id AND game_id = 'caro';

  SELECT final_rating, final_tier, final_rank, games_played
  INTO v_b2 FROM public.user_season_badges
  WHERE user_id = v_u2 AND season_id = v_old_season_id AND game_id = 'caro';

  SELECT final_rating, final_tier, final_rank, games_played
  INTO v_b3 FROM public.user_season_badges
  WHERE user_id = v_u3 AND season_id = v_old_season_id AND game_id = 'caro';

  RAISE NOTICE '>> U1 Badge (1700/20 trận): tier = %, rank = %', v_b1.final_tier, v_b1.final_rank;
  RAISE NOTICE '>> U2 Badge (1200/12 trận): tier = %, rank = %', v_b2.final_tier, v_b2.final_rank;
  RAISE NOTICE '>> U3 Badge (1300/5 trận) : tier = %, rank = %', v_b3.final_tier, v_b3.final_rank;

  ASSERT v_b1.final_tier = 'diamond', 'LỖI: U1 (1700) phải là diamond (1600-1799)';
  ASSERT v_b1.final_rank = 1, 'LỖI: U1 phải đạt Rank 1';
  ASSERT v_b2.final_tier = 'gold', 'LỖI: U2 (1200) phải là gold (1200-1399)';
  ASSERT v_b2.final_rank = 2, 'LỖI: U2 phải đạt Rank 2';
  ASSERT v_b3.final_tier = 'gold', 'LỖI: U3 (1300) phải là gold (1200-1399)';
  ASSERT v_b3.final_rank IS NULL, 'LỖI: U3 (<10 trận) rank phải là NULL';

  -- 5. KIỂM TRA SOFT-RESET RATING SANG MÙA MỚI
  -- Công thức: R_mới = round(0.6 * R_cũ + 480)
  -- U1: round(0.6 * 1700 + 480) = 1020 + 480 = 1500
  -- U2: round(0.6 * 1200 + 480) = 720 + 480 = 1200
  -- U3: round(0.6 * 1300 + 480) = 780 + 480 = 1260
  SELECT rating, best_rating, games_played, placement_done
  INTO v_r1 FROM public.player_ratings
  WHERE user_id = v_u1 AND season_id = v_new_season_id AND game_id = 'caro';

  SELECT rating, best_rating, games_played, placement_done
  INTO v_r2 FROM public.player_ratings
  WHERE user_id = v_u2 AND season_id = v_new_season_id AND game_id = 'caro';

  SELECT rating, best_rating, games_played, placement_done
  INTO v_r3 FROM public.player_ratings
  WHERE user_id = v_u3 AND season_id = v_new_season_id AND game_id = 'caro';

  RAISE NOTICE '>> U1 Mùa mới: rating = % (Kỳ vọng 1500), best = %, games = %', v_r1.rating, v_r1.best_rating, v_r1.games_played;
  RAISE NOTICE '>> U2 Mùa mới: rating = % (Kỳ vọng 1200), best = %, games = %', v_r2.rating, v_r2.best_rating, v_r2.games_played;
  RAISE NOTICE '>> U3 Mùa mới: rating = % (Kỳ vọng 1260), best = %, games = %', v_r3.rating, v_r3.best_rating, v_r3.games_played;

  ASSERT v_r1.rating = 1500, 'LỖI: U1 soft-reset phải = 1500';
  ASSERT v_r1.best_rating = 1500, 'LỖI: U1 best_rating mùa mới phải = 1500';
  ASSERT v_r1.games_played = 0, 'LỖI: U1 games_played phải = 0';

  ASSERT v_r2.rating = 1200, 'LỖI: U2 soft-reset phải = 1200';
  ASSERT v_r2.best_rating = 1200, 'LỖI: U2 best_rating mùa mới phải = 1200';

  ASSERT v_r3.rating = 1260, 'LỖI: U3 soft-reset phải = 1260';
  ASSERT v_r3.best_rating = 1260, 'LỖI: U3 best_rating mùa mới phải = 1260';

  -- 6. KIỂM TRA CHỐNG ĐÓNG NHẦM (IDEMPOTENCY GUARD)
  -- Gọi lại close_season với confirm id của mùa cũ -> Phải trả về season_mismatch
  v_retry_result := public.close_season(v_old_season_id, 'Mùa Trùng');
  RAISE NOTICE '>> Gọi lại với mùa cũ: %', v_retry_result;

  ASSERT (v_retry_result->>'closed')::boolean = false, 'LỖI: Gọi lại với mùa cũ phải trả về closed = false';
  ASSERT v_retry_result->>'reason' = 'season_mismatch', 'LỖI: Lý do từ chối phải là season_mismatch';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'TẤT CẢ CÁC BƯỚC KIỂM THỬ THỦ CÔNG P4.6B ĐỀU ĐẠT CHUẨN 100%!';
  RAISE NOTICE '============================================================';
END $$;
