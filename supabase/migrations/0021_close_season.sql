-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0021_close_season.sql
-- ==============================================================================
-- Mục tiêu: Tạo Stored Procedure `close_season` thực thi quy trình đóng mùa giải
--          và chuyển giao sang mùa giải mới nguyên tử (Phase P4.6b).
--
-- Ghi chú kiến trúc & Bảo mật:
-- 1. NGUYÊN TỬ & BẢO VỆ DỮ LIỆU RANK (ACID TRANSACTION):
--    - Chạy toàn bộ trong 1 Transaction duy nhất. Bất kỳ lỗi nào phát sinh đều rollback 100%.
-- 2. CHỐT IDEMPOTENT KÉP (CONFIRM SEASON ID & NO ACTIVE SEASON):
--    - Chốt 1: Tham số `p_confirm_season_id` bắt buộc khớp ID của mùa đang active.
--      Nếu truyền ID mùa cũ vừa đóng -> trả về `{"closed": false, "reason": "season_mismatch"}`
--      chống tuyệt đối việc gọi nhầm làm đóng tiếp mùa mới vừa tạo.
--    - Chốt 2: Nếu không có mùa nào active -> trả về `{"closed": false, "reason": "no_active_season"}`.
-- 3. SNAPSHOT HUY HIỆU VĨNH VIỄN (USER_SEASON_BADGES):
--    - Chỉ cấp huy hiệu cho người chơi có `games_played >= 1` (người 0 trận không cấp huy hiệu).
--    - `final_rank`: Tính theo tie-break chuẩn P4.4 (`ORDER BY rating DESC, user_id ASC`),
--      chỉ gán thứ hạng cho người có `games_played >= 10`. Người < 10 trận nhận `final_rank = NULL`.
--    - `final_tier`: Ánh xạ bằng CASE trong SQL khớp 100% với `packages/rating/tiers.ts` `TIER_TABLE`:
--      >=1800 (master), >=1600 (diamond), >=1400 (platinum), >=1200 (gold), >=1000 (silver), <1000 (bronze).
--    - `ON CONFLICT (user_id, season_id, game_id) DO NOTHING` chống nhân đôi huy hiệu.
-- 4. SOFT-RESET RATING SANG MÙA MỚI:
--    - Đọc công thức từ `system_config` key `season.soft_reset` (fallback factor=0.6, offset=480).
--    - `rating_new = round(factor * rating_old + offset)`.
--    - `best_rating = rating_new` (kỷ lục đỉnh cao là trong phạm vi từng mùa giải).
--    - Reset các bộ đếm: `rd = 350`, `volatility = 0.06`, `games_played = 0`, `wins/losses/draws = 0`,
--      `streak = 0`, `placement_done = false`, `last_played_at = NULL`.
--    - Người 0 trận không seed dòng mới (sẽ được khởi tạo 1200 mặc định khi thi đấu ván đầu).
-- 5. PHÂN QUYỀN:
--    - SECURITY DEFINER, SET search_path = ''.
--    - REVOKE ALL từ PUBLIC, anon, authenticated. CHỈ GRANT EXECUTE cho service_role.
-- ==============================================================================

-- ==============================================================================
-- 0. HÀM TRUY VẤN BẬC RANK ĐỒNG BỘ (IMMUTABLE HELPER)
-- ==============================================================================
-- NGUỒN CHÂN LÝ DUY NHẤT: Bắt buộc khớp 100% với TIER_TABLE trong packages/rating/tiers.ts
-- 1800+ = master, 1600+ = diamond, 1400+ = platinum, 1200+ = gold, 1000+ = silver, <1000 = bronze.
CREATE OR REPLACE FUNCTION public.get_tier_by_rating(p_rating numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_rating >= 1800 THEN 'master'
    WHEN p_rating >= 1600 THEN 'diamond'
    WHEN p_rating >= 1400 THEN 'platinum'
    WHEN p_rating >= 1200 THEN 'gold'
    WHEN p_rating >= 1000 THEN 'silver'
    ELSE 'bronze'
  END;
$$;

COMMENT ON FUNCTION public.get_tier_by_rating(numeric) IS
  'Hàm tra cứu bậc rank chuẩn hóa theo Elo, đồng bộ 100% với TIER_TABLE trong TypeScript.';

CREATE OR REPLACE FUNCTION public.close_season(
  p_confirm_season_id smallint,
  p_new_season_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_season_id smallint;
  v_active_season_name text;
  v_new_season_id smallint;

  v_factor numeric;
  v_offset numeric;

  v_badges_count int := 0;
  v_ratings_count int := 0;
BEGIN
  -- 1. BƯỚC a: LOCK MÙA ACTIVE VÀ KIỂM TRA CHỐT CHẶN IDEMPOTENCY
  SELECT id, name
  INTO v_active_season_id, v_active_season_name
  FROM public.seasons
  WHERE is_active = true
  FOR UPDATE;

  -- Chốt 1: Không có mùa nào đang active -> Thoát êm
  IF v_active_season_id IS NULL THEN
    RETURN jsonb_build_object(
      'closed', false,
      'reason', 'no_active_season'
    );
  END IF;

  -- Chốt Idempotent Thật: Xác nhận đúng mùa cần đóng (chống đóng nhầm mùa giải mới)
  IF p_confirm_season_id IS NULL OR v_active_season_id <> p_confirm_season_id THEN
    RETURN jsonb_build_object(
      'closed', false,
      'reason', 'season_mismatch',
      'active_season_id', v_active_season_id,
      'confirmed_season_id', p_confirm_season_id
    );
  END IF;

  -- 2. BƯỚC b: VALIDATE THAM SỐ TÊN MÙA MỚI
  IF p_new_season_name IS NULL OR char_length(trim(p_new_season_name)) < 2 THEN
    RAISE EXCEPTION 'Tên mùa giải mới bắt buộc phải có ít nhất 2 ký tự' USING ERRCODE = 'P0400';
  END IF;

  -- 3. BƯỚC c: CHỤP SNAPSHOT HUY HIỆU MÙA VĨNH VIỄN (USER_SEASON_BADGES)
  -- Sử dụng hàm public.get_tier_by_rating(rating) để đồng bộ 100% với TIER_TABLE
  WITH ranked_players AS (
    SELECT
      user_id,
      season_id,
      game_id,
      rating,
      games_played,
      wins,
      losses,
      draws,
      -- Chỉ gán thứ hạng khi hoàn thành đủ điều kiện (>= 10 ván), dưới 10 ván rank = NULL
      CASE
        WHEN games_played >= 10 THEN
          ROW_NUMBER() OVER (
            PARTITION BY game_id
            ORDER BY rating DESC, user_id ASC
          )::int
        ELSE NULL
      END AS computed_rank,
      -- Phân bậc xếp hạng qua hàm đồng bộ chuẩn
      public.get_tier_by_rating(rating) AS computed_tier
    FROM public.player_ratings
    WHERE season_id = v_active_season_id
      AND games_played >= 1
  )
  INSERT INTO public.user_season_badges (
    user_id,
    season_id,
    game_id,
    final_rating,
    final_tier,
    final_rank,
    games_played,
    wins,
    losses,
    draws,
    created_at
  )
  SELECT
    user_id,
    season_id,
    game_id,
    rating,
    computed_tier,
    computed_rank,
    games_played,
    wins,
    losses,
    draws,
    now()
  FROM ranked_players
  ON CONFLICT (user_id, season_id, game_id) DO NOTHING;

  GET DIAGNOSTICS v_badges_count = ROW_COUNT;

  -- 4. BƯỚC d: ĐÓNG MÙA GIẢI CŨ
  UPDATE public.seasons
  SET is_active = false,
      ended_at = now()
  WHERE id = v_active_season_id;

  -- 5. BƯỚC e: TẠO VÀ KÍCH HOẠT MÙA GIẢI MỚI
  INSERT INTO public.seasons (name, started_at, is_active)
  VALUES (trim(p_new_season_name), now(), true)
  RETURNING id INTO v_new_season_id;

  -- 6. BƯỚC f: NÉN ĐIỂM SOFT-RESET VÀ KHỞI TẠO PLAYER_RATINGS MÙA MỚI
  -- Đọc công thức nén điểm Elo từ system_config (fallback an toàn 0.6 và 480)
  SELECT
    COALESCE((value->>'factor')::numeric, 0.6),
    COALESCE((value->>'offset')::numeric, 480)
  INTO v_factor, v_offset
  FROM public.system_config
  WHERE key = 'season.soft_reset';

  v_factor := COALESCE(v_factor, 0.6);
  v_offset := COALESCE(v_offset, 480);

  -- Seed rating mùa mới cho các kỳ thủ đã tham gia (games_played >= 1)
  -- Quyết định thiết kế: best_rating của mùa mới = điểm xuất phát mới (kỷ lục đỉnh cao tính theo mùa)
  INSERT INTO public.player_ratings (
    user_id,
    game_id,
    season_id,
    rating,
    rd,
    volatility,
    games_played,
    wins,
    losses,
    draws,
    streak,
    best_rating,
    placement_done,
    last_played_at
  )
  SELECT
    user_id,
    game_id,
    v_new_season_id,
    ROUND(v_factor * rating + v_offset),
    350,
    0.06,
    0,
    0,
    0,
    0,
    0,
    ROUND(v_factor * rating + v_offset),
    false,
    NULL
  FROM public.player_ratings
  WHERE season_id = v_active_season_id
    AND games_played >= 1
  ON CONFLICT (user_id, game_id, season_id) DO NOTHING;

  GET DIAGNOSTICS v_ratings_count = ROW_COUNT;

  -- 7. BƯỚC g: TRẢ VỀ KẾT QUẢ TỔNG KẾT NGUYÊN TỬ
  RETURN jsonb_build_object(
    'closed', true,
    'old_season', v_active_season_id,
    'new_season', v_new_season_id,
    'badges_created', v_badges_count,
    'ratings_seeded', v_ratings_count
  );
END;
$$;

COMMENT ON FUNCTION public.close_season(smallint, text) IS
  'Thực hiện đóng mùa giải hiện tại, cấp huy hiệu vĩnh viễn, soft-reset rating sang mùa giải mới trong 1 transaction.';

-- 8. THIẾT LẬP PHÂN QUYỀN BẢO MẬT (CHỈ SERVICE_ROLE ĐƯỢC GỌI)
REVOKE ALL ON FUNCTION public.close_season(smallint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_season(smallint, text) TO service_role;
