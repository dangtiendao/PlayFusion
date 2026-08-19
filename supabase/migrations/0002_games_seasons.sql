-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0002_games_seasons.sql
-- ==============================================================================
-- Mục tiêu: Tạo 2 bảng danh mục nền tảng (public.games và public.seasons),
--          ràng buộc "chỉ 1 mùa active" (Partial Unique Index) và cấu hình RLS.
--
-- Ghi chú kiến trúc:
-- 1. game_id là CHIỀU DỮ LIỆU (không bao giờ là tên bảng/cột).
-- 2. Bảng public.games là "bản chiếu vận hành" của frontend registry:
--    - Frontend Registry (src/games/registry.ts) là nguồn chân lý về sự tồn tại của game trong bundle.
--    - Database (public.games) là nguồn chân lý về trạng thái vận hành (is_enabled, ranked_enabled).
-- 3. Cột is_enabled và ranked_enabled được khai báo sẵn cho Phase P5.4 (Admin bật/tắt game).
-- 4. RLS: Cho phép SELECT công khai để client nạp danh mục; CẤM tuyệt đối mọi quyền ghi từ client.
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV trước; PROD gộp ở P2.2c).
-- ==============================================================================

-- 1. BẢNG PUBLIC.GAMES (Danh mục trò chơi vận hành)
CREATE TABLE IF NOT EXISTS public.games (
  id text PRIMARY KEY,                                      -- Khớp chính xác GameDefinition.id (ví dụ: 'caro'), bất biến
  name text NOT NULL,                                       -- Tên hiển thị chính thức của trò chơi
  category text NOT NULL CHECK (category IN ('board', 'arcade', 'puzzle', 'skill', 'party')),
  ranked boolean NOT NULL DEFAULT false,                    -- Game có hỗ trợ chế độ xếp hạng hay không
  rating_system text NOT NULL DEFAULT 'leaderboard_only'
    CHECK (rating_system IN ('elo', 'glicko2', 'leaderboard_only')),
  scoring text NOT NULL CHECK (scoring IN ('win_loss', 'score', 'time')),
  min_players int NOT NULL CHECK (min_players >= 1),
  max_players int NOT NULL CHECK (max_players >= min_players),
  is_enabled boolean NOT NULL DEFAULT true,                 -- Khai báo sẵn cho P5.4: Admin bật/tắt game trong sảnh
  ranked_enabled boolean NOT NULL DEFAULT true,             -- Khai báo sẵn cho P5.4: Admin bật/tắt tính năng ranked
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index tường minh phục vụ truy vấn và lọc theo category
CREATE INDEX IF NOT EXISTS idx_games_category ON public.games(category);
CREATE INDEX IF NOT EXISTS idx_games_is_enabled ON public.games(is_enabled);

-- Tái sử dụng trigger handle_updated_at đã tạo từ migration 0001
DROP TRIGGER IF EXISTS on_games_updated_at ON public.games;
CREATE TRIGGER on_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 2. BẢNG PUBLIC.SEASONS (Quản lý mùa giải thi đấu)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.seasons (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,     -- smallint (tối đa 32,767 mùa) là tối ưu dung lượng
  name text NOT NULL,                                       -- Tên mùa giải (ví dụ: 'Mùa 1')
  started_at timestamptz NOT NULL,                          -- Thời điểm bắt đầu mùa giải
  ended_at timestamptz NULL,                                -- Thời điểm kết thúc (NULL = đang diễn ra / chưa chốt lịch)
  is_active boolean NOT NULL DEFAULT false,                 -- Đánh dấu mùa giải đang diễn ra
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. RÀNG BUỘC SỐNG CÒN: DUY NHẤT 1 MÙA ACTIVE TẠI MỘT THỜI ĐIỂM
-- ==============================================================================
-- Ghi chú kiến trúc:
-- Sử dụng Partial Unique Index trên cột is_active với điều kiện WHERE is_active = true.
-- Cơ chế này chặn đứng hoàn toàn bug 2 mùa active song song ngay từ tầng Database.
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_active
  ON public.seasons (is_active)
  WHERE is_active = true;

-- ==============================================================================
-- 4. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & THIẾT LẬP CHÍNH SÁCH BẢO MẬT
-- ==============================================================================
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

-- POLICY SELECT CHO PUBLIC.GAMES (Danh mục đọc công khai)
-- Ghi chú kiến trúc:
-- Client cần đọc thông tin game (tên, thể loại, rating_system, trạng thái bật/tắt) để render sảnh và router
DROP POLICY IF EXISTS "Games catalog is viewable by everyone" ON public.games;
CREATE POLICY "Games catalog is viewable by everyone"
  ON public.games
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- POLICY SELECT CHO PUBLIC.SEASONS (Mùa giải đọc công khai)
-- Ghi chú kiến trúc:
-- Client cần đọc mùa giải hiện tại để hiển thị banner mùa, rank và thời gian còn lại
DROP POLICY IF EXISTS "Seasons catalog is viewable by everyone" ON public.seasons;
CREATE POLICY "Seasons catalog is viewable by everyone"
  ON public.seasons
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- CHÚ THÍCH BẢO MẬT (DENY-WRITE BY DEFAULT):
-- TUYỆT ĐỐI KHÔNG cấp Policy INSERT / UPDATE / DELETE cho client (anon / authenticated).
-- - Việc cập nhật games/seasons chỉ được thực hiện bởi Admin qua Edge Function / service_role.
-- - Mọi thao tác ghi từ client thông thường sẽ bị RLS từ chối ngay lập tức.
