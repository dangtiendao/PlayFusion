-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0022_rating_decay.sql
-- ==============================================================================
-- Mục tiêu: Tạo bảng nhật ký `rating_decay_log` và Stored Procedure `apply_rating_decay`
--          thực thi quy trình trừ điểm định kỳ cho các kỳ thủ bậc cao (>= 1600)
--          không hoạt động (> 30 ngày) để chống cắm hạng (Phase P4.6c).
--
-- Ghi chú kiến trúc & Bảo mật:
-- 1. BẢNG PUBLIC.RATING_DECAY_LOG (NHẬT KÝ ĐỐI SOÁT & CHỐT IDEMPOTENT):
--    - week_key text: Chuỗi định danh tuần ISO theo múi giờ Việt Nam (`IYYY-IW` Asia/Ho_Chi_Minh).
--    - UNIQUE (user_id, game_id, season_id, week_key): Chốt chặn Idempotent tuyệt đối theo tuần.
--      Nếu cron chạy lại nhiều lần trong cùng một tuần, không bao giờ trừ điểm lần 2.
--    - Trigger Append-Only: Cấm UPDATE hoặc DELETE, bảo toàn nhật ký đối soát điểm.
-- 2. LUẬT TRỪ ĐIỂM & BẢO VỆ SÀN (RATING DECAY INVARIANTS):
--    - Chỉ xét kỳ thủ có Elo > 1600 (sàn Kim Cương).
--    - Nghỉ thi đấu > 30 ngày (last_played_at < now() - 30 days).
--    - Đã thi đấu >= 10 trận (hoàn thành định hình rank).
--    - Trừ tối đa 10 điểm/tuần (points = LEAST(10, rating - 1600)), giữ sàn 1600 không bị rớt hạng.
--    - Cột best_rating giữ nguyên (kỷ lục đỉnh cao không bị xóa nhòa).
-- 3. AN TOÀN ĐUA (CONCURRENCY SAFETY):
--    - FOR UPDATE SKIP LOCKED: Bỏ qua các dòng đang có ván đấu kết toán (settle), không gây deadlock.
-- 4. PHÂN QUYỀN RLS:
--    - rating_decay_log: SELECT mở cho chính chủ (`auth.uid() = user_id`) để UI RankCard cảnh báo.
--    - apply_rating_decay: REVOKE ALL từ PUBLIC/anon/authenticated, chỉ GRANT cho service_role.
-- ==============================================================================

-- 1. BẢNG PUBLIC.RATING_DECAY_LOG
CREATE TABLE IF NOT EXISTS public.rating_decay_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id), -- KHÔNG CASCADE
  game_id text NOT NULL REFERENCES public.games(id),
  season_id smallint NOT NULL REFERENCES public.seasons(id),
  week_key text NOT NULL,                                    -- 'IYYY-IW' theo Asia/Ho_Chi_Minh
  points int NOT NULL CHECK (points > 0),                    -- Số điểm đã trừ (> 0)
  rating_before numeric NOT NULL,
  rating_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Chốt Idempotent: 1 kỳ thủ chỉ bị decay tối đa 1 lần mỗi tuần cho 1 game trong 1 mùa
  CONSTRAINT uq_rating_decay_log_user_game_season_week UNIQUE (user_id, game_id, season_id, week_key)
);

COMMENT ON TABLE public.rating_decay_log IS
  'Nhật ký ghi nhận các đợt trừ điểm bỏ đấu (Rating Decay) định kỳ hàng tuần.';

-- 2. TRIGGER APPEND-ONLY: CẤM SỬA VÀ CẤM XÓA NHẬT KÝ DECAY
CREATE OR REPLACE FUNCTION public.prevent_rating_decay_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Rating decay logs are permanent append-only audit records: UPDATE and DELETE operations are strictly prohibited on rating_decay_log.';
END;
$$;

DROP TRIGGER IF EXISTS on_rating_decay_log_prevent_mutation ON public.rating_decay_log;
CREATE TRIGGER on_rating_decay_log_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.rating_decay_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_rating_decay_log_mutation();

-- 3. INDEXES TỐI ƯU TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_rating_decay_log_user
  ON public.rating_decay_log (user_id, created_at DESC);

-- 4. KÍCH HOẠT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.rating_decay_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own decay logs" ON public.rating_decay_log;
CREATE POLICY "Users can view their own decay logs"
  ON public.rating_decay_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. STORED PROCEDURE apply_rating_decay
CREATE OR REPLACE FUNCTION public.apply_rating_decay()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_season_id smallint;
  v_inactive_days int := 30;
  v_points_per_week int := 10;
  v_min_rating numeric := 1600;

  v_week_key text;
  v_applied_count int := 0;

  v_rec record;
  v_points int;
  v_new_rating numeric;
  v_log_inserted boolean;
BEGIN
  -- a. ĐỌC CẤU HÌNH season.decay TỪ SYSTEM_CONFIG VÀ TRA CỨU MÙA ACTIVE
  SELECT
    COALESCE((value->>'inactive_days')::int, 30),
    COALESCE((value->>'points_per_week')::int, 10),
    COALESCE((value->>'min_rating')::numeric, 1600)
  INTO v_inactive_days, v_points_per_week, v_min_rating
  FROM public.system_config
  WHERE key = 'season.decay';

  v_inactive_days := COALESCE(v_inactive_days, 30);
  v_points_per_week := COALESCE(v_points_per_week, 10);
  v_min_rating := COALESCE(v_min_rating, 1600);

  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE is_active = true
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RETURN jsonb_build_object(
      'applied', 0,
      'reason', 'no_season'
    );
  END IF;

  -- b. XÁC ĐỊNH week_key THEO CHUẨN ISO TUẦN MÚI GIỜ VIỆT NAM (Asia/Ho_Chi_Minh)
  v_week_key := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'IYYY-IW');

  -- c. DUYỆT TỪNG KỲ THỦ ĐỦ ĐIỀU KIỆN DECAY VỚI FOR UPDATE SKIP LOCKED
  FOR v_rec IN
    SELECT
      user_id,
      game_id,
      season_id,
      rating,
      last_played_at
    FROM public.player_ratings
    WHERE season_id = v_active_season_id
      AND rating > v_min_rating
      AND last_played_at IS NOT NULL
      AND last_played_at < now() - (v_inactive_days || ' days')::interval
      AND games_played >= 10
    ORDER BY user_id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- d. TÍNH ĐIỂM TRỪ VÀ BẢO VỆ SÀN (KHÔNG TRỪ XUỐNG DƯỚI min_rating)
    v_points := LEAST(v_points_per_week, (v_rec.rating - v_min_rating)::int);

    IF v_points > 0 THEN
      v_new_rating := v_rec.rating - v_points;

      -- Ghi log đối soát trước (Chốt Idempotent theo tuần)
      INSERT INTO public.rating_decay_log (
        user_id,
        game_id,
        season_id,
        week_key,
        points,
        rating_before,
        rating_after,
        created_at
      ) VALUES (
        v_rec.user_id,
        v_rec.game_id,
        v_rec.season_id,
        v_week_key,
        v_points,
        v_rec.rating,
        v_new_rating,
        now()
      ) ON CONFLICT (user_id, game_id, season_id, week_key) DO NOTHING;

      GET DIAGNOSTICS v_log_inserted = ROW_COUNT;

      -- Chỉ trừ điểm khi log được tạo thành công (chưa bị decay trong tuần này)
      IF v_log_inserted THEN
        UPDATE public.player_ratings
        SET rating = v_new_rating
        WHERE user_id = v_rec.user_id
          AND game_id = v_rec.game_id
          AND season_id = v_rec.season_id;

        v_applied_count := v_applied_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- e. TRẢ VỀ KẾT QUẢ TỔNG KẾT
  RETURN jsonb_build_object(
    'applied', v_applied_count,
    'week', v_week_key
  );
END;
$$;

COMMENT ON FUNCTION public.apply_rating_decay() IS
  'Quét và trừ điểm bỏ đấu hàng tuần cho kỳ thủ bậc cao (>= 1600) nghỉ quá 30 ngày.';

-- 6. THIẾT LẬP PHÂN QUYỀN BẢO MẬT (CHỈ SERVICE_ROLE ĐƯỢC GỌI)
REVOKE ALL ON FUNCTION public.apply_rating_decay() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rating_decay() TO service_role;
