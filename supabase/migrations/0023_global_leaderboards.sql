-- ==============================================================================
-- MIGRATION 0023: BẢNG XẾP HẠNG TỔNG HỢP (GLOBAL LEADERBOARDS - PHASE P4.7a)
-- ==============================================================================
--
-- MỤC TIÊU & THIẾT KẾ KIẾN TRÚC:
-- 1. HAI BẢNG XẾP HẠNG CHUNG BẰNG MATERIALIZED VIEW:
--    a. "Cao thủ" (mv_leaderboard_masters):
--       - Trung bình Elo CÓ TRỌNG SỐ theo số trận đã chơi:
--         weighted_rating = ROUND(SUM(rating * games_played) / SUM(games_played))
--       - CHỈ xét các game đã định hạng (games_played >= 10, chuẩn toàn hệ P4.4).
--       - CHỈ user có ít nhất 1 game định hạng (games_count >= 1).
--       - Snap theo mùa giải đang active (is_active = true).
--    b. "Chăm chỉ" (mv_leaderboard_grinders):
--       - Tổng số xu thu được từ thi đấu trong mùa active:
--         earned_coins = SUM(amount) từ wallet_transactions (type = 'match_reward', amount > 0)
--         kèm mốc thời gian created_at >= season.started_at.
--       - Đếm số lần nhận thưởng trận đấu: COUNT(*) từ sổ cái (nhẹ, không cần JOIN matches).
--       - Dành cho TOÀN BỘ người chơi kể cả tân thủ chưa định hạng (earned_coins > 0).
--
-- 2. ĐẶC THÙ BẢO MẬT & PHÂN QUYỀN (RLS DECISION):
--    - Materialized View KHÔNG hỗ trợ RLS. Quyền được phân định qua GRANT/REVOKE:
--      + GRANT SELECT cho role authenticated (đã đăng nhập).
--      + REVOKE ALL từ anon và public (chống bot cào dữ liệu tự động).
--    - Phân tích quyền riêng tư (Privacy):
--      + Bảng Cao Thủ là dữ liệu công khai (player_ratings + profiles).
--      + Bảng Chăm Chỉ CHỈ công khai tổng xu thu từ trận (earned_coins),
--        TUYỆT ĐỐI KHÔNG lộ số dư ví (wallets.balance) hay lịch sử nạp/tiêu riêng tư.
--
-- 3. TỐI ƯU HÓA FREE TIER & LÀM MỚI CONCURRENTLY:
--    - Tạo UNIQUE INDEX trên (user_id) cho mỗi view (BẮT BUỘC để chạy REFRESH CONCURRENTLY).
--    - Tạo INDEX xếp hạng:
--      + masters: (weighted_rating DESC, user_id ASC)
--      + grinders: (earned_coins DESC, user_id ASC) -> Tie-break nhất quán P4.4.
--
-- 4. BẪY KỸ THUẬT PG_CRON:
--    - REFRESH MATERIALIZED VIEW CONCURRENTLY không thể chạy trong PL/pgSQL transaction block.
--    - Do đó pg_cron gọi THẲNG câu lệnh SQL REFRESH CONCURRENTLY.
--    - Lệch pha 2 phút giữa 2 job để tránh nghẽn I/O (masters :00/:10/:20..., grinders :02/:12/:22...).
-- ==============================================================================

-- 1. BẬT EXTENSION PG_CRON (NẾU CÓ QUYỀN TRÊN SUPABASE / POSTGRES)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==============================================================================
-- 2. MATVIEW 1: BẢNG CAO THỦ (PUBLIC.MV_LEADERBOARD_MASTERS)
-- ==============================================================================
-- Ghi chú kiến trúc: Matview "đông cứng" mùa active tại thời điểm refresh.
-- Khi đóng mùa (close_season), lần refresh kế tiếp sẽ tự động chuyển sang mùa mới.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_leaderboard_masters AS
SELECT
  pr.user_id,
  s.id AS season_id,
  p.display_name,
  p.avatar_url,
  ROUND(SUM(pr.rating * pr.games_played)::numeric / SUM(pr.games_played)::numeric) AS weighted_rating,
  COUNT(*)::int AS games_count,
  SUM(pr.games_played)::int AS total_games,
  MAX(pr.rating)::numeric AS best_tier_rating,
  now() AS refreshed_at
FROM public.player_ratings pr
JOIN public.seasons s ON s.id = pr.season_id AND s.is_active = true
JOIN public.profiles p ON p.user_id = pr.user_id
WHERE pr.games_played >= 10
GROUP BY pr.user_id, s.id, p.display_name, p.avatar_url
HAVING COUNT(*) >= 1
ORDER BY weighted_rating DESC, pr.user_id ASC;

-- Bắt buộc UNIQUE INDEX để hỗ trợ REFRESH CONCURRENTLY không lock bảng
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_leaderboard_masters_user 
  ON public.mv_leaderboard_masters (user_id);

-- INDEX tối ưu truy vấn phân trang bảng xếp hạng theo chuẩn Tie-Break P4.4 (Score DESC, User_ID ASC)
CREATE INDEX IF NOT EXISTS idx_mv_leaderboard_masters_ranking 
  ON public.mv_leaderboard_masters (weighted_rating DESC, user_id ASC);

COMMENT ON MATERIALIZED VIEW public.mv_leaderboard_masters IS 
  'Bảng xếp hạng Cao Thủ: Điểm Elo trung bình có trọng số theo số trận của các game đã định hạng (>= 10 ván) trong mùa active.';

-- ==============================================================================
-- 3. MATVIEW 2: BẢNG CHĂM CHỈ (PUBLIC.MV_LEADERBOARD_GRINDERS)
-- ==============================================================================
-- Ghi chú kiến trúc: Dùng mốc thời gian started_at của mùa active thay vì season_id (do sổ cái không lưu season_id).
-- Đếm trực tiếp các giao dịch match_reward trong sổ cái (chi phí tối thiểu, không cần JOIN bảng matches nặng).
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_leaderboard_grinders AS
SELECT
  wt.user_id,
  s.id AS season_id,
  p.display_name,
  p.avatar_url,
  SUM(wt.amount)::bigint AS earned_coins,
  COUNT(*)::int AS match_rewards_count,
  now() AS refreshed_at
FROM public.wallet_transactions wt
CROSS JOIN (SELECT id, started_at FROM public.seasons WHERE is_active = true LIMIT 1) s
JOIN public.profiles p ON p.user_id = wt.user_id
WHERE wt.type = 'match_reward'
  AND wt.amount > 0
  AND wt.created_at >= s.started_at
GROUP BY wt.user_id, s.id, p.display_name, p.avatar_url
HAVING SUM(wt.amount) > 0
ORDER BY earned_coins DESC, wt.user_id ASC;

-- Bắt buộc UNIQUE INDEX để hỗ trợ REFRESH CONCURRENTLY không lock bảng
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_leaderboard_grinders_user 
  ON public.mv_leaderboard_grinders (user_id);

-- INDEX tối ưu truy vấn phân trang bảng xếp hạng theo chuẩn Tie-Break P4.4 (Coins DESC, User_ID ASC)
CREATE INDEX IF NOT EXISTS idx_mv_leaderboard_grinders_ranking 
  ON public.mv_leaderboard_grinders (earned_coins DESC, user_id ASC);

COMMENT ON MATERIALIZED VIEW public.mv_leaderboard_grinders IS 
  'Bảng xếp hạng Chăm Chỉ: Tổng xu thu được từ ván đấu trong mùa active, mở cho toàn bộ người chơi.';

-- ==============================================================================
-- 4. PHÂN QUYỀN TRUY CẬP (ACCESS GRANTS - QUYẾT ĐỊNH PHƯƠNG ÁN A)
-- ==============================================================================
-- Cấm anon và public đọc trực tiếp (chống bot cào dữ liệu)
REVOKE ALL ON public.mv_leaderboard_masters FROM PUBLIC, anon;
REVOKE ALL ON public.mv_leaderboard_grinders FROM PUBLIC, anon;

-- Cấp quyền SELECT cho người dùng đã đăng nhập (authenticated)
GRANT SELECT ON public.mv_leaderboard_masters TO authenticated;
GRANT SELECT ON public.mv_leaderboard_grinders TO authenticated;

-- ==============================================================================
-- 5. LÀM MỚI DỮ LIỆU BAN ĐẦU (INITIAL POPULATION)
-- ==============================================================================
REFRESH MATERIALIZED VIEW public.mv_leaderboard_masters;
REFRESH MATERIALIZED VIEW public.mv_leaderboard_grinders;

-- ==============================================================================
-- 6. THIẾT LẬP LỊCH LÀM MỚI TỰ ĐỘNG QUA PG_CRON (IDEMPOTENT SETUP)
-- ==============================================================================
-- Khối DO kiểm tra an toàn: Chỉ schedule khi extension pg_cron đã được cài đặt
DO $$
DECLARE
  v_job_id bigint;
  v_has_cron boolean;
BEGIN
  -- Kiểm tra sự tồn tại của extension pg_cron
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_has_cron;

  IF v_has_cron THEN
    -- A. Lập lịch cho Bảng Cao Thủ (Mỗi 10 phút: phút 0, 10, 20, 30, 40, 50)
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'wgh_refresh_masters';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    PERFORM cron.schedule(
      'wgh_refresh_masters',
      '*/10 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_leaderboard_masters;'
    );

    -- B. Lập lịch cho Bảng Chăm Chỉ (Mỗi 10 phút lệch 2p: phút 2, 12, 22, 32, 42, 52)
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'wgh_refresh_grinders';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
    PERFORM cron.schedule(
      'wgh_refresh_grinders',
      '2-59/10 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_leaderboard_grinders;'
    );

    RAISE NOTICE 'pg_cron: Đã thiết lập thành công 2 job làm mới Materialized Views (wgh_refresh_masters & wgh_refresh_grinders).';
  ELSE
    RAISE NOTICE 'pg_cron: Extension chưa được kích hoạt trên môi trường này. Vui lòng bật qua Supabase Dashboard (Database -> Extensions).';
  END IF;
END $$;
