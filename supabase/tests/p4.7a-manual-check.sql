-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ THỦ CÔNG DEV: PHASE P4.7a (GLOBAL LEADERBOARDS)
-- ==============================================================================
--
-- HƯỚNG DẪN THỰC HIỆN:
-- 1. Copy và paste tuần tự từng khối vào SQL Editor trên Supabase Dashboard (DEV).
-- 2. Đối chiếu kết quả trả về với KỲ VỌNG (EXPECTED) đã mô tả chi tiết ở mỗi khối.
-- ==============================================================================

-- ==============================================================================
-- KHỐI 1: TẠO DỮ LIỆU THỬ NGHIỆM SERVICE CHO 3 USER (A, B, C)
-- ==============================================================================
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-1111-4000-a000-000000000001';
  v_user_b := 'bbbbbbbb-2222-4000-b000-000000000002';
  v_user_c := 'cccccccc-3333-4000-c000-000000000003';
  v_active_season_id smallint;
  v_season_started_at timestamptz;
BEGIN
  -- Lấy thông tin mùa active hiện tại
  SELECT id, started_at INTO v_active_season_id, v_season_started_at
  FROM public.seasons
  WHERE is_active = true
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION 'Cần ít nhất 1 mùa active để chạy test.' USING ERRCODE = 'P0404';
  END IF;

  -- 1. Tạo auth.users và profiles cho 3 người chơi nếu chưa có
  INSERT INTO public.profiles (user_id, display_name, avatar_url, role, is_anonymous)
  VALUES
    (v_user_a, 'CaoThủ_A', 'https://avatar.dev/a.png', 'player', false),
    (v_user_b, 'ChămChỉ_B', 'https://avatar.dev/b.png', 'player', false),
    (v_user_c, 'TânThủ_C', 'https://avatar.dev/c.png', 'player', false)
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url;

  -- 2. Tạo ví xu cho 3 người chơi
  INSERT INTO public.wallets (user_id, balance)
  VALUES
    (v_user_a, 1000),
    (v_user_b, 1000),
    (v_user_c, 1000)
  ON CONFLICT (user_id) DO NOTHING;

  -- 3. Tạo dữ liệu xếp hạng player_ratings
  -- User A: Caro 1400 / 20 trận (Đã định hạng)
  -- User B: Caro 1200 / 15 trận (Đã định hạng)
  -- User C: Caro 1300 / 5 trận (Chưa định hạng < 10)
  INSERT INTO public.player_ratings (
    user_id, season_id, game_id, rating, games_played, wins, losses, draws, best_rating, placement_done
  )
  VALUES
    (v_user_a, v_active_season_id, 'caro', 1400, 20, 16, 4, 0, 1400, true),
    (v_user_b, v_active_season_id, 'caro', 1200, 15, 8, 7, 0, 1220, true),
    (v_user_c, v_active_season_id, 'caro', 1300, 5, 4, 1, 0, 1300, false)
  ON CONFLICT (user_id, season_id, game_id) DO UPDATE
  SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, wins = EXCLUDED.wins;

  -- 4. Tạo giao dịch match_reward trong sổ cái ví (thuộc mùa active)
  -- User A: +150 xu
  -- User B: +300 xu
  -- User C: +50 xu
  INSERT INTO public.wallet_transactions (
    user_id, type, amount, balance_after, idempotency_key, created_at
  )
  VALUES
    (v_user_a, 'match_reward', 150, 1150, 'test_p47a_reward_a_001', v_season_started_at + interval '1 hour'),
    (v_user_b, 'match_reward', 300, 1300, 'test_p47a_reward_b_001', v_season_started_at + interval '2 hours'),
    (v_user_c, 'match_reward', 50, 1050, 'test_p47a_reward_c_001', v_season_started_at + interval '3 hours')
  ON CONFLICT (idempotency_key) DO NOTHING;

  RAISE NOTICE 'Khối 1: Đã chuẩn bị xong dữ liệu 3 người chơi A, B, C.';
END $$;

-- ==============================================================================
-- KHỐI 2: THỰC THI REFRESH MATVIEW VÀ KIỂM TRA ĐỐI SOÁT
-- ==============================================================================

-- 1. Refresh thủ công 2 Materialized Views
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_leaderboard_masters;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_leaderboard_grinders;

-- 2. Kiểm tra Bảng Cao Thủ (mv_leaderboard_masters)
-- KỲ VỌNG:
-- - Hạng 1: CaoThủ_A (weighted_rating = 1400, games_count = 1, total_games = 20)
-- - Hạng 2: ChămChỉ_B (weighted_rating = 1200, games_count = 1, total_games = 15)
-- - ĐẶC BIỆT: TânThủ_C KHÔNG CÓ MẶT (do games_played = 5 < 10)
SELECT 
  display_name,
  season_id,
  weighted_rating,
  games_count,
  total_games,
  best_tier_rating
FROM public.mv_leaderboard_masters
ORDER BY weighted_rating DESC, user_id ASC;

-- 3. Kiểm tra Bảng Chăm Chỉ (mv_leaderboard_grinders)
-- KỲ VỌNG:
-- - Hạng 1: ChămChỉ_B (earned_coins = 300, match_rewards_count = 1)
-- - Hạng 2: CaoThủ_A (earned_coins = 150, match_rewards_count = 1)
-- - Hạng 3: TânThủ_C (earned_coins = 50, match_rewards_count = 1)
-- - ĐẶC BIỆT: TânThủ_C VẪN CÓ MẶT ĐẦY ĐỦ (bảng cày cuốc mở cho mọi người)
SELECT 
  display_name,
  season_id,
  earned_coins,
  match_rewards_count
FROM public.mv_leaderboard_grinders
ORDER BY earned_coins DESC, user_id ASC;

-- ==============================================================================
-- KHỐI 3: KIỂM TRA CẤU HÌNH VÀ TRẠNG THÁI LẬP LỊCH PG_CRON
-- ==============================================================================

-- 1. Kiểm tra 2 job cron đã đăng ký thành công
-- KỲ VỌNG: 
-- - wgh_refresh_masters với schedule '*/10 * * * *'
-- - wgh_refresh_grinders với schedule '2-59/10 * * * *'
SELECT jobid, jobname, schedule, active, command 
FROM cron.job
WHERE jobname IN ('wgh_refresh_masters', 'wgh_refresh_grinders')
ORDER BY jobid ASC;

-- 2. Kiểm tra lịch sử chạy gần nhất của pg_cron (nếu đã kích hoạt chu kỳ chạy)
SELECT jobid, status, return_message, start_time, end_time 
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 4;

-- ==============================================================================
-- KHỐI 4: KIỂM TRA PHÂN QUYỀN TRUY CẬP (ACCESS GRANTS & RLS SIMULATION)
-- ==============================================================================

-- 1. Authenticated user SELECT 2 matviews -> Thành công trả về rows
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "aaaaaaaa-1111-4000-a000-000000000001", "role": "authenticated"}';

SELECT count(*) AS count_masters_authenticated FROM public.mv_leaderboard_masters;
SELECT count(*) AS count_grinders_authenticated FROM public.mv_leaderboard_grinders;

-- 2. Anon user SELECT 2 matviews -> Bị chặn (ERROR 42501: permission denied)
SET ROLE anon;
SET request.jwt.claims = '{"role": "anon"}';

-- Thao tác dưới đây PHẢI BỊ BÁO LỖI: permission denied for materialized view mv_leaderboard_masters
-- SELECT count(*) FROM public.mv_leaderboard_masters;

-- Phục hồi role postgres
RESET ROLE;
RESET request.jwt.claims;

-- ==============================================================================
-- KHỐI 5: DỌN DẸP DỮ LIỆU THỬ NGHIỆM DEV
-- ==============================================================================
-- Xóa player_ratings và profiles tạo ra trong bài test
DELETE FROM public.player_ratings 
WHERE user_id IN (
  'aaaaaaaa-1111-4000-a000-000000000001',
  'bbbbbbbb-2222-4000-b000-000000000002',
  'cccccccc-3333-4000-c000-000000000003'
);

-- Lưu ý: Sổ cái wallet_transactions là Append-Only. Trong môi trường test DEV,
-- các dòng test_p47a_% có thể giữ nguyên làm chứng từ đối soát.

-- Refresh lại matview sau khi dọn sạch dữ liệu test
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_leaderboard_masters;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_leaderboard_grinders;
