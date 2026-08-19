-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0004_matches.sql
-- ==============================================================================
-- Mục tiêu: Tạo 2 bảng lõi lưu trữ lịch sử ván đấu (public.matches) và danh sách
--          người tham gia (public.match_participants) theo Thiết Kế Dọc (Vertical Design).
--
-- Ghi chú kiến trúc:
-- 1. THIẾT KẾ DỌC (VERTICAL DESIGN):
--    - Mỗi người chơi / bot trong ván đấu là một dòng độc lập trong match_participants.
--    - TUYỆT ĐỐI KHÔNG sử dụng cột ngang player1/player2 (cho phép mở rộng linh hoạt
--      từ 1v1 sang game 4 người FFA hoặc 2v2 mà không cần sửa schema).
-- 2. KHÓA CHÍNH MATCH_PARTICIPANTS:
--    - Sử dụng PRIMARY KEY (match_id, seat_index) vì bot AI và người chơi local không
--      có user_id (NULL không được phép nằm trong PK).
--    - Kết hợp UNIQUE INDEX (match_id, user_id) WHERE user_id IS NOT NULL để chặn
--      1 user ngồi 2 ghế trong cùng một ván.
-- 3. TỐI ƯU FREE TIER (500MB DB LIMIT):
--    - moves và final_state lưu chuỗi nén (text) từ engine serialize (ví dụ Caro: '112,113,97...').
--    - Tuyệt đối không dùng jsonb verbose để tránh làm phình DB sau hàng nghìn trận.
-- 4. BẢO MẬT RLS (DENY-WRITE BY DEFAULT):
--    - SELECT công khai cho toàn bộ client (phục vụ xem hồ sơ, lịch sử, leaderboard).
--    - CẤM mọi quyền INSERT/UPDATE/DELETE từ client (chỉ ghi qua Edge Function settle_match P4.2).
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV; PROD gộp ở P2.2c).
-- ==============================================================================

-- 1. BẢNG PUBLIC.MATCHES (Bản ghi ván đấu)
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.games(id),
  mode text NOT NULL CHECK (mode IN ('solo', 'vs_ai', 'local_pvp', 'online_1v1', 'online_ffa', 'online_team')),
  season_id smallint NULL REFERENCES public.seasons(id),     -- NULL cho trận offline / unranked
  is_ranked boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,                                 -- NULL = ván đang diễn ra
  duration_ms int NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  end_reason text NULL CHECK (end_reason IS NULL OR end_reason IN ('normal', 'resign', 'timeout', 'disconnect', 'abort')),
  engine_options text NULL,                                  -- Cấu hình luật ván đấu (boardSize, rule chặn 2 đầu) để replay
  final_state text NULL,                                     -- State kết thúc bàn cờ (chuỗi serialize nén của engine)
  moves text NULL,                                           -- Chuỗi nước đi nén (format engine, ví dụ Caro: '112,113,97')
  created_at timestamptz NOT NULL DEFAULT now(),

  -- RÀNG BUỘC NHẤT QUÁN: Ván đã kết thúc bắt buộc phải có end_reason, đang chơi thì cả 2 đều NULL
  CONSTRAINT chk_matches_ended_consistency CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);

-- ==============================================================================
-- 2. BẢNG PUBLIC.MATCH_PARTICIPANTS (Thiết kế dọc - Mỗi người chơi/bot 1 dòng)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.match_participants (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  seat_index smallint NOT NULL CHECK (seat_index >= 0),
  user_id uuid NULL REFERENCES public.profiles(user_id),     -- NULL nếu là Bot AI hoặc người chơi local thứ 2
  is_bot boolean NOT NULL DEFAULT false,
  bot_level text NULL CHECK (bot_level IS NULL OR bot_level IN ('easy', 'medium', 'hard')),
  result text NULL CHECK (result IS NULL OR result IN ('win', 'loss', 'draw')),
  placement smallint NULL CHECK (placement IS NULL OR placement >= 1),
  score numeric NULL,                                        -- Dành cho game tính điểm tích lũy
  rating_before int NULL,
  rating_after int NULL,
  rating_delta int NULL,
  rd_before numeric NULL,                                    -- Độ lệch rating (RD) sẵn sàng cho Glicko-2 (P4.x)
  rd_after numeric NULL,

  -- KHÓA CHÍNH: Kết hợp ID trận đấu và vị trí ghế ngồi
  PRIMARY KEY (match_id, seat_index),

  -- RÀNG BUỘC BOT & USER: Bot không bao giờ có user_id
  CONSTRAINT chk_participant_bot_user CHECK (
    (is_bot = true AND user_id IS NULL) OR (is_bot = false)
  ),

  -- RÀNG BUỘC BOT LEVEL: Bot bắt buộc phải có bot_level, người chơi thật thì không
  CONSTRAINT chk_participant_bot_level CHECK (
    (is_bot = true) = (bot_level IS NOT NULL)
  )
);

-- UNIQUE PARTIAL INDEX: Chặn đứng 1 user ngồi 2 ghế trong cùng 1 ván đấu
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_participants_unique_user
  ON public.match_participants (match_id, user_id)
  WHERE user_id IS NOT NULL;

-- ==============================================================================
-- 3. CÁC INDEX TỐI ƯU TRUY VẤN
-- ==============================================================================

-- Index a: Lịch sử ván đấu của 1 người chơi (Phục vụ truy vấn Profile / Lịch sử đấu ở P2.6)
CREATE INDEX IF NOT EXISTS idx_match_participants_user_match
  ON public.match_participants (user_id, match_id)
  WHERE user_id IS NOT NULL;

-- Index b: Danh sách trận đấu gần đây theo game (Phục vụ Admin Dashboard P5.2 và thống kê sảnh)
CREATE INDEX IF NOT EXISTS idx_matches_game_created
  ON public.matches (game_id, created_at DESC);

-- Index c: Thống kê và tổng hợp kết quả theo mùa giải (Phục vụ đóng mùa / trao giải P4.6)
CREATE INDEX IF NOT EXISTS idx_matches_season_ranked
  ON public.matches (season_id)
  WHERE is_ranked = true;

-- ==============================================================================
-- 4. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & THIẾT LẬP CHÍNH SÁCH BẢO MẬT
-- ==============================================================================
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

-- Policy SELECT cho public.matches: Dữ liệu đọc công khai trong app
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON public.matches;
CREATE POLICY "Matches are viewable by everyone"
  ON public.matches
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Policy SELECT cho public.match_participants: Dữ liệu đọc công khai trong app
DROP POLICY IF EXISTS "Match participants are viewable by everyone" ON public.match_participants;
CREATE POLICY "Match participants are viewable by everyone"
  ON public.match_participants
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- CHÚ THÍCH BẢO MẬT (DENY-WRITE BY DEFAULT):
-- TUYỆT ĐỐI KHÔNG cấp Policy INSERT / UPDATE / DELETE cho client (anon / authenticated).
-- Toàn bộ thao tác ghi kết quả trận đấu do Server Edge Function thực hiện qua service_role.

-- ==============================================================================
-- 5. SƠ ĐỒ QUAN HỆ CƠ SỞ DỮ LIỆU (DATABASE RELATIONSHIP DIAGRAM)
-- ==============================================================================
--
--   ┌─────────────────┐           ┌────────────────────────┐
--   │  public.games   │           │     public.seasons     │
--   │  ─────────────  │           │     ──────────────     │
--   │  id (PK, text)  │───┐   ┌───│  id (PK, smallint)     │
--   └─────────────────┘   │   │   │  is_active (UNIQUE idx)│
--                         │   │   └────────────────────────┘
--                         ▼   ▼
--                ┌────────────────────────┐
--                │     public.matches     │
--                │     ──────────────     │
--                │  id (PK, uuid)         │◀────────────────┐
--                │  game_id (FK)          │                 │ (1)
--                │  season_id (FK, NULL)  │                 │
--                │  is_ranked (boolean)   │                 │
--                │  moves, final_state    │                 │ (CASCADE)
--                └────────────────────────┘                 │
--                            │ (1)                          │
--                            │                              │
--                            ▼ (N)                          │
--                ┌──────────────────────────────┐           │
--                │  public.match_participants   │           │
--                │  ──────────────────────────  │           │
--                │  match_id (PK, FK) ──────────┼───────────┘
--                │  seat_index (PK, smallint)   │
--                │  user_id (FK, NULL) ─────────┼───────────┐
--                │  is_bot, bot_level           │           │ (N)
--                │  result, score, rating_delta │           │
--                └──────────────────────────────┘           │
--                                                           ▼ (1)
--                                               ┌────────────────────────┐
--                                               │    public.profiles     │
--                                               │    ───────────────     │
--                                               │  user_id (PK, uuid)    │
--                                               │  display_name, role    │
--                                               └────────────────────────┘
--
