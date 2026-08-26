-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0020_season_badges.sql
-- ==============================================================================
-- Mục tiêu: Thiết lập nền tảng cơ sở dữ liệu lưu trữ Huy hiệu Mùa giải (Season Badges)
--          và nạp cấu hình chuyển mùa (Soft-reset) & trừ điểm bỏ đấu (Rating Decay).
--          (Phase P4.6a - Quản lý Mùa Giải & Thành Tích Vĩnh Viễn).
--
-- Ghi chú kiến trúc & Bảo mật:
-- 1. BẢNG PUBLIC.USER_SEASON_BADGES (KỶ VẬT THÀNH TÍCH VĨNH VIỄN):
--    - user_id REFERENCES profiles(user_id) KHÔNG CASCADE: Huy hiệu mùa là kỷ vật
--      chứng từ gắn liền với lịch sử mùa giải, không tự ý xóa khi hồ sơ bị thay đổi.
--    - final_rank int NULL: Chỉ gán thứ hạng khi kỳ thủ hoàn thành đủ điều kiện
--      (>= 10 trận theo P4.4). Kỳ thủ tham gia < 10 trận vẫn nhận huy hiệu tham gia
--      với final_rank = NULL.
--    - final_tier: Ràng buộc CHECK chặt chẽ khớp 6 bậc xếp hạng (TierId).
--    - UNIQUE (user_id, season_id, game_id): Chốt Idempotency cho hàm đóng mùa
--      close_season (P4.6b) — nếu chạy lại hoặc retry, không bao giờ nhân đôi huy hiệu.
-- 2. TRIGGER BẤT BIẾN (APPEND-ONLY PATTERN):
--    - Áp dụng trigger BEFORE UPDATE OR DELETE chặn đứng 100% mọi thao tác chỉnh sửa
--      hoặc xóa bỏ huy hiệu, kể cả từ service_role (nhất quán với wallet_transactions).
-- 3. CẤU HÌNH HỆ THỐNG SYSTEM_CONFIG:
--    - 'season.soft_reset' -> {"factor": 0.6, "offset": 480}:
--      Công thức: R_mới = round(0.6 * R_cũ + 480). Giữ mốc chuẩn 1200 đứng yên,
--      kéo rank cao về gần mốc và kéo rank thấp lên để tạo động lực mùa mới.
--    - 'season.decay' -> {"inactive_days": 30, "points_per_week": 10, "min_rating": 1600}:
--      Chống cắm hạng bậc cao (>= Kim Cương 1600). Người chơi nghỉ > 30 ngày bị trừ
--      10 điểm/tuần, tuyệt đối không trừ xuống dưới sàn 1600, không áp dụng cho bậc thấp.
-- 4. RLS MATRIX:
--    - user_season_badges: SELECT công khai cho toàn thể người dùng (khoe hồ sơ & bảng vàng).
--      Khóa ghi 100% client (chỉ close_season service_role được INSERT).
--    - system_config: Mở rộng policy SELECT tiền tố 'season.%' cho client đọc hiển thị luật.
-- ==============================================================================

-- 1. BẢNG PUBLIC.USER_SEASON_BADGES
CREATE TABLE IF NOT EXISTS public.user_season_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id), -- KHÔNG CASCADE (Kỷ vật như chứng từ)
  season_id smallint NOT NULL REFERENCES public.seasons(id),
  game_id text NOT NULL REFERENCES public.games(id),
  final_rating numeric NOT NULL,
  final_tier text NOT NULL CHECK (final_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'master')),
  final_rank int NULL CHECK (final_rank IS NULL OR final_rank >= 1), -- NULL = không đủ 10 trận lên bảng
  games_played int NOT NULL CHECK (games_played >= 0),
  wins int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  draws int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Chốt Idempotency: 1 người chơi chỉ nhận đúng 1 huy hiệu cho 1 game trong 1 mùa giải
  CONSTRAINT uq_user_season_badges_user_season_game UNIQUE (user_id, season_id, game_id)
);

COMMENT ON TABLE public.user_season_badges IS
  'Huy hiệu và bản chụp thành tích mùa giải vĩnh viễn của người chơi (Append-Only).';

COMMENT ON COLUMN public.user_season_badges.final_rank IS
  'Thứ hạng chung cuộc của kỳ thủ trong mùa giải. NULL nếu chưa hoàn thành đủ 10 ván đấu định bảng.';

-- 2. TRIGGER APPEND-ONLY: CẤM SỬA VÀ CẤM XÓA HUY HIỆU
CREATE OR REPLACE FUNCTION public.prevent_user_season_badges_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Season badges are permanent append-only records: UPDATE and DELETE operations are strictly prohibited on user_season_badges.';
END;
$$;

DROP TRIGGER IF EXISTS on_user_season_badges_prevent_mutation ON public.user_season_badges;
CREATE TRIGGER on_user_season_badges_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.user_season_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_season_badges_mutation();

-- 3. CÁC INDEX TỐI ƯU TRUY VẤN
-- Tra cứu toàn bộ huy hiệu mùa của một người dùng (Hiển thị trang Hồ sơ / Tủ đồ danh hiệu)
CREATE INDEX IF NOT EXISTS idx_user_season_badges_user_season
  ON public.user_season_badges (user_id, season_id DESC);

-- Tra cứu danh sách Top bảng vàng mùa giải cũ (chỉ index các dòng có thứ hạng cụ thể)
CREATE INDEX IF NOT EXISTS idx_user_season_badges_top_history
  ON public.user_season_badges (season_id, game_id, final_rank)
  WHERE final_rank IS NOT NULL;

-- 4. KÍCH HOẠT ROW LEVEL SECURITY (RLS)
ALTER TABLE public.user_season_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Season badges are viewable by everyone" ON public.user_season_badges;
CREATE POLICY "Season badges are viewable by everyone"
  ON public.user_season_badges FOR SELECT
  TO authenticated, anon
  USING (true);

-- 5. SEED CẤU HÌNH CHUYỂN MÙA & DECAY VÀO SYSTEM_CONFIG
INSERT INTO public.system_config (key, value, description)
VALUES
  (
    'season.soft_reset',
    '{"factor": 0.6, "offset": 480}'::jsonb,
    'Công thức nén điểm Elo khi chuyển mùa giải mới: R_mới = round(factor * R_cũ + offset)'
  ),
  (
    'season.decay',
    '{"inactive_days": 30, "points_per_week": 10, "min_rating": 1600}'::jsonb,
    'Quy tắc trừ điểm bỏ đấu cho kỳ thủ bậc cao (>=1600) nghỉ thi đấu quá 30 ngày'
  )
ON CONFLICT (key) DO NOTHING;

-- 6. MỞ RỘNG RLS POLICY CỦA SYSTEM_CONFIG (CHO PHÉP CLIENT ĐỌC TIỀN TỐ 'season.%')
DROP POLICY IF EXISTS "Public system configs are viewable by everyone" ON public.system_config;
CREATE POLICY "Public system configs are viewable by everyone"
  ON public.system_config FOR SELECT
  TO authenticated, anon
  USING (
    key LIKE 'reward.%'
    OR key LIKE 'match.%'
    OR key LIKE 'penalty.%'
    OR key LIKE 'elo.%'
    OR key LIKE 'season.%'
  );
