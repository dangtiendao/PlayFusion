-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0017_apply_settlement.sql
-- ==============================================================================
-- Mục tiêu: Tạo Stored Function `apply_match_settlement` — "Két Sắt Nguyên Tử"
--          duy nhất của hệ thống kết toán ván đấu (Phase P4.2b).
--
-- Ghi chú kiến trúc & Phân định trách nhiệm:
-- 1. FUNCTION NÀY KHÔNG TÍNH TOÁN ELO:
--    - Điểm số và hệ số K đã được tính toán chính xác bằng module TypeScript `@rating` (P4.1)
--      trong Edge Function `settle_match` (P4.2c).
--    - Function này CHỈ ĐẢM NHIỆM: Thẩm định (Validation) + Áp dụng nguyên tử (Atomic Update)
--      cho toàn bộ các bảng `matches`, `player_ratings`, `wallets`, `wallet_transactions`,
--      và `match_participants` trong đúng 1 Database Transaction.
-- 2. BẢO VỆ CHỐNG GHI TRÙNG LẶP (IDEMPOTENCY GUARD):
--    - Bước đầu tiên luôn là `UPDATE matches SET settled_at = now() WHERE id = ... AND settled_at IS NULL AND ended_at IS NOT NULL`.
--    - Nếu 0 dòng bị ảnh hưởng -> RETURN NGAY `{"applied": false, "reason": "already_settled_or_not_ended"}`.
--    - Đảm bảo dù Edge Function / Trọng tài có retry 10 lần thì dữ liệu cũng chỉ áp dụng đúng 1 lần duy nhất!
-- 3. KHÓA DÒNG THEO THỨ TỰ CỐ ĐỊNH (CHỐNG DEADLOCK):
--    - Danh sách đấu thủ luôn được sắp xếp và khóa theo thứ tự `user_id ASC`.
-- 4. OPTIMISTIC LOCKING (CHỐNG ĐUA RATING):
--    - Kiểm tra `player_ratings.rating` trong DB có khớp với `entry.rating_before` hay không.
--    - Nếu có ván đấu khác vừa kết toán xen vào giữa -> Ném exception 'STALE_RATING' để rollback.
-- 5. CHÍNH SÁCH SÀN RATING = 100:
--    - Thực thi chính sách `GREATEST(rating_after, 100)` tại tầng DB để chống điểm âm / 0 gây tuyệt vọng cho tân thủ.
-- 6. PHÂN QUYỀN ĐẶC BIỆT:
--    - REVOKE toàn bộ quyền khỏi `PUBLIC`, `anon`, `authenticated`.
--    - CHỈ GRANT EXECUTE cho `service_role` (Edge Function Trọng tài / Settle).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.apply_match_settlement(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match_id uuid;
  v_is_noop boolean;
  v_placement_games int;
  v_entries jsonb;
  v_entries_count int;

  v_game_id text;
  v_season_id smallint;
  v_is_ranked boolean;

  -- Biến vòng lặp đấu thủ
  v_entry record;
  v_user_id uuid;
  v_rating_before int;
  v_rating_after int;
  v_rating_delta int;
  v_outcome text;
  v_coins bigint;

  v_actual_result text;

  v_cur_rating numeric;
  v_cur_best_rating numeric;
  v_cur_games_played int;
  v_cur_wins int;
  v_cur_losses int;
  v_cur_draws int;
  v_cur_streak int;
  v_cur_placement_done boolean;

  v_final_rating int;
  v_new_best_rating int;
  v_new_games_played int;
  v_new_wins int;
  v_new_losses int;
  v_new_draws int;
  v_new_streak int;
  v_new_placement_done boolean;

  v_cur_balance bigint;
  v_new_balance bigint;
  v_idempotency_key text;
BEGIN
  -- 1. TRÍCH XUẤT VÀ KIỂM TRA THAM SỐ CỐT LÕI TỪ PAYLOAD
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Payload p bắt buộc phải là đối tượng JSON' USING ERRCODE = 'P0400';
  END IF;

  v_match_id := (p->>'match_id')::uuid;
  v_is_noop := COALESCE((p->>'is_noop')::boolean, false);
  v_placement_games := COALESCE((p->>'placement_games')::int, 15);
  v_entries := p->'entries';

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'match_id không được để trống' USING ERRCODE = 'P0400';
  END IF;

  IF v_placement_games <= 0 THEN
    RAISE EXCEPTION 'placement_games phải là số nguyên dương' USING ERRCODE = 'P0402';
  END IF;

  -- 2. BƯỚC a: GUARD IDEMPOTENT & CHẶN TRẬN CHƯA KẾT THÚC
  -- Khắc luật: Chỉ cập nhật nếu settled_at đang NULL VÀ ended_at ĐÃ KHÁC NULL (ván cờ đã kết thúc).
  -- Nếu 0 dòng affected -> trận đã được settle trước đó hoặc trận chưa kết thúc -> RETURN NGAY.
  UPDATE public.matches
  SET settled_at = now()
  WHERE id = v_match_id
    AND settled_at IS NULL
    AND ended_at IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'already_settled_or_not_ended'
    );
  END IF;

  -- 3. BƯỚC b: NO-OP CHECK (Dành cho trận unranked hoặc trận bị abort)
  -- Ván cờ đã được đóng dấu settled_at thành công ở bước a -> Return applied: true, noop: true.
  IF v_is_noop IS TRUE THEN
    RETURN jsonb_build_object(
      'applied', true,
      'noop', true
    );
  END IF;

  -- 4. BƯỚC c: THẨM ĐỊNH PAYLOAD & TRA CỨU THÔNG TIN TRẬN ĐẤU
  SELECT game_id, season_id, is_ranked
  INTO v_game_id, v_season_id, v_is_ranked
  FROM public.matches
  WHERE id = v_match_id;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy ván đấu %', v_match_id USING ERRCODE = 'P0004';
  END IF;

  IF v_entries IS NULL OR jsonb_typeof(v_entries) <> 'array' THEN
    RAISE EXCEPTION 'entries bắt buộc phải là mảng JSON' USING ERRCODE = 'P0401';
  END IF;

  v_entries_count := jsonb_array_length(v_entries);
  IF v_entries_count < 1 OR v_entries_count > 8 THEN
    RAISE EXCEPTION 'Số lượng đấu thủ kết toán không hợp lệ (1..8): %', v_entries_count USING ERRCODE = 'P0401';
  END IF;

  -- 5. BƯỚC d -> h: DUYỆT TỪNG ĐẤU THỦ THEO THỨ TỰ user_id TĂNG DẦN (CHỐNG DEADLOCK)
  FOR v_entry IN
    SELECT
      (elem->>'user_id')::uuid AS user_id,
      (elem->>'seat_index')::smallint AS seat_index,
      (elem->>'rating_before')::int AS rating_before,
      (elem->>'rating_after')::int AS rating_after,
      (elem->>'rating_delta')::int AS rating_delta,
      elem->>'outcome' AS outcome,
      COALESCE((elem->>'coins')::bigint, 0) AS coins
    FROM jsonb_array_elements(v_entries) AS elem
    ORDER BY (elem->>'user_id')::uuid ASC
  LOOP
    v_user_id := v_entry.user_id;
    v_rating_before := v_entry.rating_before;
    v_rating_after := v_entry.rating_after;
    v_rating_delta := v_entry.rating_delta;
    v_outcome := v_entry.outcome;
    v_coins := v_entry.coins;

    -- Thẩm định tính hợp lệ từng entry
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'user_id không được để trống trong entry' USING ERRCODE = 'P0400';
    END IF;

    IF v_outcome IS NULL OR v_outcome NOT IN ('win', 'loss', 'draw') THEN
      RAISE EXCEPTION 'outcome không hợp lệ (%) cho user %', v_outcome, v_user_id USING ERRCODE = 'P0400';
    END IF;

    IF v_rating_delta <> (v_rating_after - v_rating_before) THEN
      RAISE EXCEPTION 'Sai lệch số học rating_delta (%) != rating_after (%) - rating_before (%) cho user %',
        v_rating_delta, v_rating_after, v_rating_before, v_user_id USING ERRCODE = 'P0405';
    END IF;

    IF v_coins < 0 THEN
      RAISE EXCEPTION 'Thưởng xu không được là số âm (%) cho user %', v_coins, v_user_id USING ERRCODE = 'P0406';
    END IF;

    -- Kiểm tra đối chiếu với match_participants thực tế đã finalize trong DB
    SELECT result INTO v_actual_result
    FROM public.match_participants
    WHERE match_id = v_match_id AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Người dùng % không phải là đấu thủ tham gia ván đấu %', v_user_id, v_match_id USING ERRCODE = 'P0403';
    END IF;

    IF v_actual_result IS DISTINCT FROM v_outcome THEN
      RAISE EXCEPTION 'Sai lệch kết quả cho user %: DB result (%) != Payload outcome (%)',
        v_user_id, v_actual_result, v_outcome USING ERRCODE = 'P0404';
    END IF;

    -- d. KHÓA DÒNG THEO THỨ TỰ CỐ ĐỊNH (player_ratings và wallets)
    IF v_season_id IS NOT NULL AND v_is_ranked IS TRUE THEN
      -- Khởi tạo dòng rating mặc định nếu user chưa từng đấu game này trong mùa
      INSERT INTO public.player_ratings (
        user_id, game_id, season_id, rating, rd, volatility,
        games_played, wins, losses, draws, streak, best_rating, placement_done, last_played_at
      ) VALUES (
        v_user_id, v_game_id, v_season_id, 1200, 350, 0.06,
        0, 0, 0, 0, 0, 1200, false, now()
      ) ON CONFLICT (user_id, game_id, season_id) DO NOTHING;

      -- Khóa dòng rating bằng SELECT FOR UPDATE
      SELECT rating, best_rating, games_played, wins, losses, draws, streak, placement_done
      INTO v_cur_rating, v_cur_best_rating, v_cur_games_played, v_cur_wins, v_cur_losses, v_cur_draws, v_cur_streak, v_cur_placement_done
      FROM public.player_ratings
      WHERE user_id = v_user_id AND game_id = v_game_id AND season_id = v_season_id
      FOR UPDATE;

      -- e. KIỂM TRA OPTIMISTIC LOCK (STALE_RATING)
      IF v_cur_rating::int <> v_rating_before THEN
        RAISE EXCEPTION 'STALE_RATING cho user %: rating trong DB (%) != rating_before trong payload (%)',
          v_user_id, v_cur_rating, v_rating_before USING ERRCODE = 'P0407';
      END IF;

      -- f. ÁP DỤNG CẬP NHẬT RATING & BỘ ĐẾM (SÀN RATING = 100)
      v_final_rating := GREATEST(v_rating_after, 100);
      v_new_best_rating := GREATEST(v_cur_best_rating::int, v_final_rating);
      v_new_games_played := v_cur_games_played + 1;
      v_new_placement_done := (v_cur_placement_done OR (v_new_games_played >= v_placement_games));

      IF v_outcome = 'win' THEN
        v_new_wins := v_cur_wins + 1;
        v_new_losses := v_cur_losses;
        v_new_draws := v_cur_draws;
        v_new_streak := CASE WHEN v_cur_streak >= 0 THEN v_cur_streak + 1 ELSE 1 END;
      ELSIF v_outcome = 'loss' THEN
        v_new_wins := v_cur_wins;
        v_new_losses := v_cur_losses + 1;
        v_new_draws := v_cur_draws;
        v_new_streak := 0;
      ELSE -- 'draw'
        v_new_wins := v_cur_wins;
        v_new_losses := v_cur_losses;
        v_new_draws := v_cur_draws + 1;
        v_new_streak := v_cur_streak;
      END IF;

      UPDATE public.player_ratings
      SET rating = v_final_rating,
          best_rating = v_new_best_rating,
          games_played = v_new_games_played,
          wins = v_new_wins,
          losses = v_new_losses,
          draws = v_new_draws,
          streak = v_new_streak,
          placement_done = v_new_placement_done,
          last_played_at = now()
      WHERE user_id = v_user_id AND game_id = v_game_id AND season_id = v_season_id;
    END IF;

    -- Khóa ví người chơi
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance INTO v_cur_balance
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- g. ÁP DỤNG THƯỞNG XU & SỔ CÁI BẤT BIẾN
    IF v_coins > 0 THEN
      v_new_balance := v_cur_balance + v_coins;
      v_idempotency_key := 'settle:' || v_match_id::text || ':' || v_user_id::text;

      INSERT INTO public.wallet_transactions (
        user_id,
        amount,
        balance_after,
        type,
        ref_type,
        ref_id,
        idempotency_key
      ) VALUES (
        v_user_id,
        v_coins,
        v_new_balance,
        'match_reward',
        'match',
        v_match_id,
        v_idempotency_key
      );

      UPDATE public.wallets
      SET balance = v_new_balance
      WHERE user_id = v_user_id;
    END IF;

    -- h. GHI NHẬN RATING VÀO MATCH_PARTICIPANTS
    UPDATE public.match_participants
    SET rating_before = v_rating_before,
        rating_after = COALESCE(v_final_rating, v_rating_after),
        rating_delta = v_rating_delta
    WHERE match_id = v_match_id AND user_id = v_user_id;
  END LOOP;

  -- i. HOÀN TẤT TOÀN BỘ TRANSACTION
  RETURN jsonb_build_object(
    'applied', true,
    'entries', v_entries_count
  );
END;
$$;

-- 6. THU HỒI QUYỀN KHỎI CLIENT VÀ CHỈ CẤP CHO SERVICE_ROLE
REVOKE ALL ON FUNCTION public.apply_match_settlement(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_match_settlement(jsonb) TO service_role;
