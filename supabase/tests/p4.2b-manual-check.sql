-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ THỦ CÔNG: FUNCTION APPLY_MATCH_SETTLEMENT (PHASE P4.2B)
-- ==============================================================================
-- Hướng dẫn: Chạy từng khối lệnh trên SQL Editor Supabase Dashboard (DEV Project).
-- Toàn bộ kịch bản kiểm tra tính toàn vẹn, tính bất biến, và nguyên tắc Idempotent
-- "Retry 2 lần không cộng tiền/điểm 2 lần" của Két Sắt Nguyên Tử P4.2b.
-- ==============================================================================

-- ==============================================================================
-- KHỐI 0: CHUẨN BỊ MÔI TRƯỜNG DỮ LIỆU KIỂM THỬ (SETUP)
-- ==============================================================================
DO $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_season_id smallint;
  v_match_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- Lấy 2 user có sẵn từ profiles
  SELECT user_id INTO v_user_a FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  SELECT user_id INTO v_user_b FROM public.profiles WHERE user_id <> v_user_a ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO v_season_id FROM public.seasons WHERE is_active = true LIMIT 1;

  IF v_user_a IS NULL OR v_user_b IS NULL OR v_season_id IS NULL THEN
    RAISE NOTICE 'Cần tối thiểu 2 user trong profiles và 1 season active để chạy test.';
    RETURN;
  END IF;

  -- Dọn dẹp trận test cũ nếu có
  DELETE FROM public.match_participants WHERE match_id = v_match_id;
  DELETE FROM public.matches WHERE id = v_match_id;

  -- Tạo trận đấu test đã kết thúc (ended_at != NULL, result đã có)
  INSERT INTO public.matches (
    id, game_id, mode, is_ranked, season_id, started_at, ended_at, duration_ms, end_reason
  ) VALUES (
    v_match_id, 'caro', 'online_1v1', true, v_season_id, now() - interval '5 minutes', now(), 300000, 'normal'
  );

  INSERT INTO public.match_participants (
    match_id, user_id, seat_index, result, placement
  ) VALUES
    (v_match_id, v_user_a, 0, 'win', 1),
    (v_match_id, v_user_b, 1, 'loss', 2);

  -- Đặt rating ban đầu là 1200 cho cả 2 người
  INSERT INTO public.player_ratings (
    user_id, game_id, season_id, rating, rd, volatility, games_played, wins, losses, draws, streak, best_rating, placement_done
  ) VALUES
    (v_user_a, 'caro', v_season_id, 1200, 350, 0.06, 0, 0, 0, 0, 0, 1200, false),
    (v_user_b, 'caro', v_season_id, 1200, 350, 0.06, 0, 0, 0, 0, 0, 1200, false)
  ON CONFLICT (user_id, game_id, season_id) DO UPDATE
    SET rating = 1200, games_played = 0, wins = 0, losses = 0, draws = 0, streak = 0, best_rating = 1200, placement_done = false;

  RAISE NOTICE 'Setup thành công cho match_id: %, User A: %, User B: %, Season: %',
    v_match_id, v_user_a, v_user_b, v_season_id;
END $$;

-- ==============================================================================
-- KHỐI 1: GỌI SETTLE LẦN 1 (HAPPY PATH)
-- KỲ VỌNG: applied = true, entries = 2.
--          Rating User A = 1216 (+16), User B = 1184 (-16).
--          Ví User A +50 xu, User B +5 xu.
--          matches.settled_at được đóng dấu NOT NULL.
-- ==============================================================================
DO $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_match_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_payload jsonb;
  v_res jsonb;
BEGIN
  SELECT user_id INTO v_user_a FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  SELECT user_id INTO v_user_b FROM public.profiles WHERE user_id <> v_user_a ORDER BY created_at ASC LIMIT 1;

  v_payload := jsonb_build_object(
    'match_id', v_match_id,
    'is_noop', false,
    'placement_games', 15,
    'entries', jsonb_build_array(
      jsonb_build_object(
        'user_id', v_user_a,
        'seat_index', 0,
        'rating_before', 1200,
        'rating_after', 1216,
        'rating_delta', 16,
        'outcome', 'win',
        'coins', 50
      ),
      jsonb_build_object(
        'user_id', v_user_b,
        'seat_index', 1,
        'rating_before', 1200,
        'rating_after', 1184,
        'rating_delta', -16,
        'outcome', 'loss',
        'coins', 5
      )
    )
  );

  v_res := public.apply_match_settlement(v_payload);
  RAISE NOTICE 'Kết quả Settle Lần 1: %', v_res;
END $$;

-- Kiểm tra kết quả sau Lần 1:
SELECT id, is_ranked, settled_at FROM public.matches WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT match_id, user_id, seat_index, result, rating_before, rating_after, rating_delta FROM public.match_participants WHERE match_id = 'a0000000-0000-0000-0000-000000000001';
SELECT user_id, rating, games_played, wins, losses, streak, best_rating, placement_done FROM public.player_ratings WHERE game_id = 'caro' AND season_id = (SELECT id FROM public.seasons WHERE is_active = true LIMIT 1);
SELECT user_id, balance FROM public.wallets WHERE user_id IN (SELECT user_id FROM public.match_participants WHERE match_id = 'a0000000-0000-0000-0000-000000000001');
SELECT id, user_id, amount, balance_after, type, idempotency_key FROM public.wallet_transactions WHERE ref_id = 'a0000000-0000-0000-0000-000000000001';

-- ==============================================================================
-- KHỐI 2: GỌI SETTLE LẦN 2 Y HỆT (DOD GỐC - IDEMPOTENCY GUARD)
-- KỲ VỌNG: applied = false, reason = 'already_settled_or_not_ended'.
--          TUYỆT ĐỐI KHÔNG CÓ BẤT KỲ SỐ LIỆU NÀO BỊ THAY ĐỔI / CỘNG DỒN.
-- ==============================================================================
DO $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_match_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_payload jsonb;
  v_res jsonb;
BEGIN
  SELECT user_id INTO v_user_a FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  SELECT user_id INTO v_user_b FROM public.profiles WHERE user_id <> v_user_a ORDER BY created_at ASC LIMIT 1;

  v_payload := jsonb_build_object(
    'match_id', v_match_id,
    'is_noop', false,
    'placement_games', 15,
    'entries', jsonb_build_array(
      jsonb_build_object(
        'user_id', v_user_a,
        'seat_index', 0,
        'rating_before', 1200,
        'rating_after', 1216,
        'rating_delta', 16,
        'outcome', 'win',
        'coins', 50
      ),
      jsonb_build_object(
        'user_id', v_user_b,
        'seat_index', 1,
        'rating_before', 1200,
        'rating_after', 1184,
        'rating_delta', -16,
        'outcome', 'loss',
        'coins', 5
      )
    )
  );

  v_res := public.apply_match_settlement(v_payload);
  RAISE NOTICE 'Kết quả Settle Lần 2 (Thử Thách Idempotency): %', v_res;
END $$;

-- Đối soát số liệu sau Lần 2 (Phải giữ nguyên 100% so với Lần 1):
SELECT user_id, rating, games_played, wins, losses, streak FROM public.player_ratings WHERE game_id = 'caro' AND season_id = (SELECT id FROM public.seasons WHERE is_active = true LIMIT 1);
SELECT user_id, balance FROM public.wallets WHERE user_id IN (SELECT user_id FROM public.match_participants WHERE match_id = 'a0000000-0000-0000-0000-000000000001');

-- ==============================================================================
-- KHỐI 3: TEST KIỂM TRA BẮT LỖI & CHỐNG GIAN LẬN (VALIDATION CHECKS)
-- ==============================================================================
-- 3.1. Trận đấu chưa kết thúc (ended_at IS NULL) -> applied = false
DO $$
DECLARE
  v_user_a uuid;
  v_match_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_res jsonb;
BEGIN
  SELECT user_id INTO v_user_a FROM public.profiles LIMIT 1;
  DELETE FROM public.matches WHERE id = v_match_id;
  INSERT INTO public.matches (id, game_id, mode, started_at) VALUES (v_match_id, 'caro', 'online_1v1', now());

  v_res := public.apply_match_settlement(jsonb_build_object(
    'match_id', v_match_id,
    'entries', jsonb_build_array(jsonb_build_object(
      'user_id', v_user_a, 'seat_index', 0, 'rating_before', 1200, 'rating_after', 1216, 'rating_delta', 16, 'outcome', 'win'
    ))
  ));
  RAISE NOTICE 'Test 3.1 Trận chưa kết thúc -> %', v_res;
  DELETE FROM public.matches WHERE id = v_match_id;
END $$;

-- ==============================================================================
-- KHỐI 4: TEST NO-OP CHO TRẬN BỊ ABORT / UNRANKED
-- KỲ VỌNG: applied = true, noop = true. Không đổi rating/ví.
-- ==============================================================================
DO $$
DECLARE
  v_user_a uuid;
  v_match_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;
  v_res jsonb;
BEGIN
  SELECT user_id INTO v_user_a FROM public.profiles LIMIT 1;
  DELETE FROM public.matches WHERE id = v_match_id;
  INSERT INTO public.matches (id, game_id, mode, started_at, ended_at, end_reason)
  VALUES (v_match_id, 'caro', 'online_1v1', now() - interval '1 minute', now(), 'abort');

  v_res := public.apply_match_settlement(jsonb_build_object(
    'match_id', v_match_id,
    'is_noop', true
  ));
  RAISE NOTICE 'Test 4 No-op cho trận abort -> %', v_res;
  DELETE FROM public.matches WHERE id = v_match_id;
END $$;

-- ==============================================================================
-- KHỐI 5: DỌN DẸP DỮ LIỆU TEST (CLEANUP)
-- ==============================================================================
DELETE FROM public.match_participants WHERE match_id = 'a0000000-0000-0000-0000-000000000001';
DELETE FROM public.matches WHERE id = 'a0000000-0000-0000-0000-000000000001';
