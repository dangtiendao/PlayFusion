-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ THỦ CÔNG DEV (MANUAL VERIFICATION SCRIPT) — PHASE P4.5a
-- ==============================================================================
-- Mục tiêu: Kiểm chứng 3 cơ chế chống farm tại Database:
--          1. Trần thưởng ngày (Daily Cap 500 xu) được enforce an toàn trong DB sau lock ví.
--          2. Giới hạn trần ngày thứ 2: Đã đạt 500 xu -> coins_applied = 0, capped = true.
--          3. Penalty trừ xu (Abandon) với cơ chế bảo vệ ví không âm (Zero-floor balance).
-- ==============================================================================

DO $$
DECLARE
  v_test_user_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_test_user_b uuid := '00000000-0000-0000-0000-0000000000b1';
  v_test_match_1 uuid := gen_random_uuid();
  v_test_match_2 uuid := gen_random_uuid();
  v_test_match_3 uuid := gen_random_uuid();
  v_res jsonb;
  v_entry jsonb;
  v_bal bigint;
BEGIN
  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'BẮT ĐẦU KIỂM THỬ CHỐNG FARM PHASE P4.5a';
  RAISE NOTICE '=======================================================';

  -- Dọn dẹp dữ liệu test cũ nếu có
  DELETE FROM public.wallet_transactions WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.wallets WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.match_participants WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.player_ratings WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.profiles WHERE user_id IN (v_test_user_a, v_test_user_b);

  -- 1. DỰNG PROFILES & VÍ BAN ĐẦU
  INSERT INTO public.profiles (user_id, display_name)
  VALUES 
    (v_test_user_a, 'Test AntiFarm A'),
    (v_test_user_b, 'Test AntiFarm B');

  -- Khởi tạo ví User A có 480 xu (đã kiếm hôm nay qua match_reward)
  INSERT INTO public.wallets (user_id, balance) VALUES (v_test_user_a, 480);
  INSERT INTO public.wallet_transactions (user_id, amount, balance_after, type, ref_type, ref_id, idempotency_key, created_at)
  VALUES (
    v_test_user_a, 480, 480, 'match_reward', 'match', gen_random_uuid(), 'mock_reward_today', now()
  );

  -- Khởi tạo ví User B có 10 xu
  INSERT INTO public.wallets (user_id, balance) VALUES (v_test_user_b, 10);

  -- ============================================================================
  -- TEST CASE 1: TRẬN 1 THẮNG THƯỞNG 50 XU NHƯNG ĐÃ ĐẠT 480/500 -> CHỈ CỘNG 20 XU
  -- ============================================================================
  INSERT INTO public.matches (id, game_id, mode, is_ranked, season_id, ended_at)
  VALUES (v_test_match_1, 'caro', 'online_1v1', true, 1, now());

  INSERT INTO public.match_participants (match_id, user_id, seat_index, result)
  VALUES 
    (v_test_match_1, v_test_user_a, 0, 'win'),
    (v_test_match_1, v_test_user_b, 1, 'loss');

  v_res := public.apply_match_settlement(jsonb_build_object(
    'match_id', v_test_match_1,
    'is_noop', false,
    'placement_games', 15,
    'daily_cap', 500,
    'entries', jsonb_build_array(
      jsonb_build_object(
        'user_id', v_test_user_a,
        'seat_index', 0,
        'rating_before', 1200,
        'rating_after', 1216,
        'rating_delta', 16,
        'outcome', 'win',
        'coins', 50 -- Đề nghị thưởng 50 xu
      ),
      jsonb_build_object(
        'user_id', v_test_user_b,
        'seat_index', 1,
        'rating_before', 1200,
        'rating_after', 1184,
        'rating_delta', -16,
        'outcome', 'loss',
        'coins', 5
      )
    )
  ));

  RAISE NOTICE 'Kết quả Test Case 1 (Chạm trần ngày): %', v_res;

  -- Kiểm tra User A: coins_applied = 20, capped = true, balance = 500
  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_test_user_a;
  IF v_bal <> 500 THEN
    RAISE EXCEPTION 'TEST 1 THẤT BẠI: Số dư User A phải là 500 (nhận thêm 20), thực tế là %', v_bal;
  END IF;
  RAISE NOTICE '-> TEST 1 THÀNH CÔNG: User A đã được clamp trần 500 xu (480 + 20 = 500).';

  -- ============================================================================
  -- TEST CASE 2: TRẬN 2 THẮNG TIẾP 50 XU KHI ĐÃ ĐỦ 500/500 -> CỘNG 0 XU (CAPPED)
  -- ============================================================================
  INSERT INTO public.matches (id, game_id, mode, is_ranked, season_id, ended_at)
  VALUES (v_test_match_2, 'caro', 'online_1v1', true, 1, now());

  INSERT INTO public.match_participants (match_id, user_id, seat_index, result)
  VALUES 
    (v_test_match_2, v_test_user_a, 0, 'win'),
    (v_test_match_2, v_test_user_b, 1, 'loss');

  v_res := public.apply_match_settlement(jsonb_build_object(
    'match_id', v_test_match_2,
    'is_noop', false,
    'placement_games', 15,
    'daily_cap', 500,
    'entries', jsonb_build_array(
      jsonb_build_object(
        'user_id', v_test_user_a,
        'seat_index', 0,
        'rating_before', 1216,
        'rating_after', 1232,
        'rating_delta', 16,
        'outcome', 'win',
        'coins', 50 -- Đề nghị 50 xu tiếp
      ),
      jsonb_build_object(
        'user_id', v_test_user_b,
        'seat_index', 1,
        'rating_before', 1184,
        'rating_after', 1168,
        'rating_delta', -16,
        'outcome', 'loss',
        'coins', 5
      )
    )
  ));

  RAISE NOTICE 'Kết quả Test Case 2 (Vượt trần ngày): %', v_res;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_test_user_a;
  IF v_bal <> 500 THEN
    RAISE EXCEPTION 'TEST 2 THẤT BẠI: Số dư User A phải giữ nguyên 500 (nhận 0 xu), thực tế là %', v_bal;
  END IF;
  RAISE NOTICE '-> TEST 2 THÀNH CÔNG: User A đã đạt trần ngày, không cộng thêm xu nào (balance giữ nguyên 500).';

  -- ============================================================================
  -- TEST CASE 3: PENALTY TIMEOUT TRỪ -20 XU KHI USER B CHỈ CÓ 15 XU (TRỪ HẾT VỀ 0)
  -- ============================================================================
  -- User B hiện có: 10 (gốc) + 5 (trận 1) + 5 (trận 2) = 20 xu. Ta ép về 10 xu để test:
  UPDATE public.wallets SET balance = 10 WHERE user_id = v_test_user_b;

  INSERT INTO public.matches (id, game_id, mode, is_ranked, season_id, ended_at, end_reason)
  VALUES (v_test_match_3, 'caro', 'online_1v1', true, 1, now(), 'timeout');

  INSERT INTO public.match_participants (match_id, user_id, seat_index, result)
  VALUES 
    (v_test_match_3, v_test_user_a, 0, 'win'),
    (v_test_match_3, v_test_user_b, 1, 'loss');

  v_res := public.apply_match_settlement(jsonb_build_object(
    'match_id', v_test_match_3,
    'is_noop', false,
    'placement_games', 15,
    'daily_cap', 500,
    'entries', jsonb_build_array(
      jsonb_build_object(
        'user_id', v_test_user_a,
        'seat_index', 0,
        'rating_before', 1232,
        'rating_after', 1248,
        'rating_delta', 16,
        'outcome', 'win',
        'coins', 50
      ),
      jsonb_build_object(
        'user_id', v_test_user_b,
        'seat_index', 1,
        'rating_before', 1168,
        'rating_after', 1152,
        'rating_delta', -16,
        'outcome', 'loss',
        'coins', -20 -- Phạt timeout -20 xu
      )
    )
  ));

  RAISE NOTICE 'Kết quả Test Case 3 (Phạt bảo vệ ví không âm): %', v_res;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_test_user_b;
  IF v_bal <> 0 THEN
    RAISE EXCEPTION 'TEST 3 THẤT BẠI: Số dư User B phải là 0 (chỉ trừ tối đa 10 xu), thực tế là %', v_bal;
  END IF;
  RAISE NOTICE '-> TEST 3 THÀNH CÔNG: User B bị phạt -20 nhưng ví có 10 -> trừ đúng 10, balance = 0, không âm ví!';

  -- ============================================================================
  -- DỌN DẸP DỮ LIỆU TEST
  -- ============================================================================
  DELETE FROM public.wallet_transactions WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.wallets WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.match_participants WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.matches WHERE id IN (v_test_match_1, v_test_match_2, v_test_match_3);
  DELETE FROM public.player_ratings WHERE user_id IN (v_test_user_a, v_test_user_b);
  DELETE FROM public.profiles WHERE user_id IN (v_test_user_a, v_test_user_b);

  RAISE NOTICE '=======================================================';
  RAISE NOTICE 'TẤT CẢ TEST CASES ĐÃ HOÀN TẤT THÀNH CÔNG VÀ DỌN DẸP SẠCH!';
  RAISE NOTICE '=======================================================';
END;
$$;
