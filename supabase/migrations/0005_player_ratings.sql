-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0005_player_ratings.sql
-- ==============================================================================
-- Mục tiêu: Tạo bảng lưu trữ điểm số xếp hạng và thành tích theo mùa
--          (public.player_ratings), bộ đôi Index Leaderboard và cấu hình RLS.
--
-- Ghi chú kiến trúc:
-- 1. KHÓA CHÍNH (user_id, game_id, season_id):
--    - Điểm số và thành tích được phân tách độc lập theo từng game và từng mùa giải.
--    - game_id là chiều dữ liệu, không bao giờ là tên bảng hay tên cột.
-- 2. BỘ ĐẾM HIỆU NĂNG CAO:
--    - Tích hợp sẵn games_played, wins, losses, draws, streak, best_rating để khi mở
--      hồ sơ cá nhân hoặc xem bảng xếp hạng chỉ cần đọc 1 dòng duy nhất, không phải
--      quét COUNT(*) toàn bộ bảng matches/match_participants (bảo vệ Free Tier DB).
-- 3. SẴN SÀNG CHO GLICKO-2 (PHASE P4.x):
--    - Khai báo sẵn rd (Rating Deviation, mặc định 350) và volatility (mặc định 0.06).
--    - Thêm cột sớm giúp hệ thống chuyển đổi thuật toán rating mà không cần migrate schema.
-- 4. BỘ ĐÔI LEADERBOARD INDEXES (TRADE-OFF PHÂN TÍCH):
--    - Index 1 (Full): (game_id, season_id, rating DESC) phục vụ tìm hạng của người chơi.
--    - Index 2 (Partial): (game_id, season_id, rating DESC) WHERE games_played >= 10
--      phục vụ render Top 100 cao thủ đã hoàn thành định hạng (B-Tree nhỏ gọn trong RAM).
-- 5. BẢO MẬT RLS (DENY-WRITE BY DEFAULT):
--    - SELECT công khai cho toàn bộ client (Leaderboard công khai trong app).
--    - CẤM tuyệt đối mọi quyền INSERT/UPDATE/DELETE từ client (chỉ ghi qua Edge Function
--      settle_match P4.2 bằng service_role).
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV và PROD).
-- ==============================================================================

-- 1. BẢNG PUBLIC.PLAYER_RATINGS (Hệ thống Xếp hạng & Thành tích theo Mùa)
CREATE TABLE IF NOT EXISTS public.player_ratings (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  game_id text NOT NULL REFERENCES public.games(id),
  season_id smallint NOT NULL REFERENCES public.seasons(id),
  rating numeric NOT NULL DEFAULT 1200,                     -- Điểm Elo khởi tạo mặc định 1200
  rd numeric NOT NULL DEFAULT 350,                          -- Độ lệch rating (Rating Deviation) cho Glicko-2 (P4.x)
  volatility numeric NOT NULL DEFAULT 0.06,                 -- Độ biến thiên rating (Volatility) cho Glicko-2 (P4.x)
  games_played int NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  wins int NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses int NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws int NOT NULL DEFAULT 0 CHECK (draws >= 0),
  streak int NOT NULL DEFAULT 0,                            -- Chuỗi thắng liên tiếp hiện tại (âm nếu chuỗi thua)
  best_rating numeric NOT NULL DEFAULT 1200,                -- Điểm rank cao nhất từng đạt được trong mùa
  placement_done boolean NOT NULL DEFAULT false,            -- Đã hoàn thành giai đoạn định hạng ban đầu hay chưa (<15 trận K=60)
  last_played_at timestamptz NULL,                          -- Thời điểm thi đấu trận gần nhất
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- KHÓA CHÍNH: Mỗi người chơi có duy nhất 1 bản ghi rating cho mỗi game trong 1 mùa
  PRIMARY KEY (user_id, game_id, season_id),

  -- LƯỚI AN TOÀN ĐỐI SOÁT: Tổng số trận thắng + thua + hòa không bao giờ vượt quá tổng số trận đã chơi
  CONSTRAINT chk_player_ratings_matches_count CHECK (wins + losses + draws <= games_played)
);

-- Tái sử dụng trigger handle_updated_at đã tạo từ migration 0001
DROP TRIGGER IF EXISTS on_player_ratings_updated_at ON public.player_ratings;
CREATE TRIGGER on_player_ratings_updated_at
  BEFORE UPDATE ON public.player_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 2. CÁC INDEX TỐI ƯU LEADERBOARD & HỒ SƠ CÁ NHÂN
-- ==============================================================================

-- Index a1 (Full Leaderboard Index): Phục vụ tra cứu vị trí xếp hạng cá nhân và phân trang tổng thể
CREATE INDEX IF NOT EXISTS idx_player_ratings_leaderboard
  ON public.player_ratings (game_id, season_id, rating DESC);

-- Index a2 (Partial Top Leaderboard Index): Tối ưu tối đa truy vấn Bảng Xếp Hạng Top 100 cao thủ
-- Chỉ index các người chơi đã đấu từ 10 trận trở lên (đủ điều kiện lên bảng xếp hạng chính thức)
CREATE INDEX IF NOT EXISTS idx_player_ratings_top_leaderboard
  ON public.player_ratings (game_id, season_id, rating DESC)
  WHERE games_played >= 10;

-- Index b: Phục vụ xem toàn bộ thành tích các game trong mùa của 1 người chơi (Profile Page P2.6)
CREATE INDEX IF NOT EXISTS idx_player_ratings_user_season
  ON public.player_ratings (user_id, season_id);

-- ==============================================================================
-- 3. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & THIẾT LẬP BẢO MẬT
-- ==============================================================================
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: Cho phép tất cả client (authenticated & anon) đọc bảng điểm (Leaderboard công khai)
DROP POLICY IF EXISTS "Player ratings are viewable by everyone" ON public.player_ratings;
CREATE POLICY "Player ratings are viewable by everyone"
  ON public.player_ratings
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- CHÚ THÍCH BẢO MẬT (DENY-WRITE BY DEFAULT):
-- TUYỆT ĐỐI KHÔNG cấp Policy INSERT / UPDATE / DELETE cho client.
-- Việc cộng trừ điểm rank và cập nhật bộ đếm do Server Edge Function thực hiện qua service_role (P4.2).
