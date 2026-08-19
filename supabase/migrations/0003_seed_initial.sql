-- ==============================================================================
-- PLAYFUSION DATABASE SEED: 0003_seed_initial.sql
-- ==============================================================================
-- Mục tiêu: Nạp dữ liệu danh mục game và mùa giải khởi tạo ban đầu.
--
-- Ghi chú kiến trúc:
-- 1. Lý do tách file: Tách riêng Seed khỏi Schema (0002) giúp Schema có thể chạy lại
--    ở nhiều môi trường mới một cách nguyên bản, trong khi Seed có thể linh hoạt theo môi trường.
-- 2. Tính Idempotency: Toàn bộ lệnh INSERT đều có cơ chế chống trùng lặp (ON CONFLICT DO UPDATE
--    hoặc WHERE NOT EXISTS), cho phép chạy lại nhiều lần mà không sinh lỗi hoặc duplicate data.
-- 3. Nguồn chân lý của Game Caro:
--    - id: 'caro' (từ packages/engines/caro/manifest.ts)
--    - name: 'Cờ Caro'
--    - category: 'board'
--    - ranked: true
--    - rating_system: 'elo'
--    - scoring: 'win_loss'
--    - min_players: 2, max_players: 2
-- 4. Quyết định loại trừ: 'dummy' và 'dummy2' KHÔNG được seed vào DB vì đây là các game
--    giả lập dùng để kiểm thử kiến trúc frontend registry, không có dữ liệu trận đấu thật.
-- ==============================================================================

-- 1. SEED GAME CỜ CARO (BẢN CHIẾU VẬN HÀNH TỪ CARO MANIFEST)
INSERT INTO public.games (
  id,
  name,
  category,
  ranked,
  rating_system,
  scoring,
  min_players,
  max_players,
  is_enabled,
  ranked_enabled
)
VALUES (
  'caro',
  'Cờ Caro',
  'board',
  true,
  'elo',
  'win_loss',
  2,
  2,
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  ranked = EXCLUDED.ranked,
  rating_system = EXCLUDED.rating_system,
  scoring = EXCLUDED.scoring,
  min_players = EXCLUDED.min_players,
  max_players = EXCLUDED.max_players,
  updated_at = now();

-- ==============================================================================
-- 2. SEED MÙA GIẢI ĐẦU TIÊN (MÙA 1)
-- ==============================================================================
-- Mùa 1 được kích hoạt ngay lập tức (is_active = true) để hệ thống sẵn sàng ghi nhận rank.
-- ended_at = NULL vì chưa chốt ngày kết thúc (quyết định đóng mùa thuộc Phase P4.6).
-- Điều kiện WHERE NOT EXISTS đảm bảo không vi phạm partial unique index khi chạy lại seed.
INSERT INTO public.seasons (name, started_at, ended_at, is_active)
SELECT
  'Mùa 1',
  now(),
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.seasons WHERE is_active = true
);
