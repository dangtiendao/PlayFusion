-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0001_profiles.sql
-- ==============================================================================
-- Mục tiêu: Tạo bảng profiles, triggers đồng bộ từ auth.users, bảo vệ role và RLS
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (Dev trước, sau đó Prod)
-- Ghi chú kỹ thuật: Cân nhắc chuyển sang Supabase CLI link project ở Phase P2.2
-- ==============================================================================

-- 1. TẠO BẢNG PUBLIC.PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) >= 2 AND char_length(trim(display_name)) <= 20),
  avatar_url text NULL,
  -- role: Khai báo sẵn cho Phase P5.1 (Phân quyền Admin / Moderator / Player)
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin')),
  is_anonymous boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index tường minh cho user_id phục vụ truy vấn tối ưu
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- ==============================================================================
-- 2. TRIGGER FUNCTION: TỰ ĐỘNG INSERT PROFILE CHO USER MỚI (HANDLE_NEW_USER)
-- ==============================================================================
-- Ghi chú kiến trúc:
-- - Chạy với quyền SECURITY DEFINER để có quyền ghi vào public.profiles
--   ngay cả khi client không được cấp quyền INSERT qua REST API.
-- - Tự động nhận diện user ẩn danh (is_anonymous = true hoặc provider = 'anonymous').
-- - Sinh tên mặc định thân thiện "Khách-" + 6 ký tự đầu của UUID (hoặc lấy tên Google).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_is_anon boolean;
  v_display_name text;
  v_avatar_url text;
BEGIN
  -- Xác định người dùng ẩn danh theo GoTrue auth.users hiện hành
  v_is_anon := COALESCE(NEW.is_anonymous, (NEW.raw_app_meta_data->>'provider' = 'anonymous'), false);

  -- Nếu là tài khoản Google đã có tên trong raw_user_meta_data
  IF NOT v_is_anon AND (NEW.raw_user_meta_data->>'full_name' IS NOT NULL OR NEW.raw_user_meta_data->>'name' IS NOT NULL) THEN
    v_display_name := substr(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')), 1, 20);
    IF char_length(v_display_name) < 2 THEN
      v_display_name := 'Player-' || substr(replace(NEW.id::text, '-', ''), 1, 6);
    END IF;
  ELSE
    -- Sinh tên mặc định thân thiện cho khách ẩn danh: Khách-a1b2c3
    v_display_name := 'Khách-' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;

  v_avatar_url := COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture');

  INSERT INTO public.profiles (user_id, display_name, avatar_url, role, is_anonymous, created_at, updated_at)
  VALUES (
    NEW.id,
    v_display_name,
    v_avatar_url,
    'player',
    v_is_anon,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Đăng ký trigger sau khi user được tạo trong auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. TRIGGER FUNCTION: CẬP NHẬT PROFILE KHI NÂNG CẤP TÀI KHOẢN (HANDLE_USER_UPDATE)
-- ==============================================================================
-- Ghi chú kiến trúc:
-- - Khi khách ẩn danh liên kết Google (linkIdentity), email xuất hiện và is_anonymous thành false.
-- - QUY TẮC BẢO VỆ TÊN TỰ ĐẶT: CHỈ cập nhật display_name từ Google nếu tên hiện tại
--   vẫn là tên mặc định ('Khách-%'). Nếu người chơi đã chủ động đổi tên cá nhân,
--   tuyệt đối giữ nguyên tên người dùng đã đặt.
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
DECLARE
  v_google_name text;
  v_google_avatar text;
BEGIN
  v_google_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  v_google_avatar := COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture');

  UPDATE public.profiles
  SET
    is_anonymous = COALESCE(NEW.is_anonymous, false),
    avatar_url = COALESCE(v_google_avatar, profiles.avatar_url),
    -- Chỉ ghi đè tên từ Google nếu người dùng chưa từng tự đổi tên
    display_name = CASE
      WHEN profiles.display_name LIKE 'Khách-%' AND v_google_name IS NOT NULL AND char_length(trim(v_google_name)) >= 2 THEN substr(trim(v_google_name), 1, 20)
      ELSE profiles.display_name
    END,
    updated_at = now()
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Đăng ký trigger khi user được cập nhật trong auth.users
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.is_anonymous IS TRUE AND NEW.is_anonymous IS FALSE)
    OR (OLD.email IS NULL AND NEW.email IS NOT NULL)
  )
  EXECUTE FUNCTION public.handle_user_update();

-- ==============================================================================
-- 4. TRIGGER FUNCTION: TỰ ĐỘNG CẬP NHẬT UPDATED_AT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_updated_at ON public.profiles;
CREATE TRIGGER on_profile_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 5. TRIGGER FUNCTION: BẢO VỆ CỘT HỆ THỐNG (CHỐNG ROLE ESCALATION TỪ CLIENT)
-- ==============================================================================
-- Ghi chú kiến trúc:
-- - Postgres RLS policy không hỗ trợ chặn theo từng cột độc lập trong lệnh UPDATE.
-- - Sử dụng Trigger BEFORE UPDATE là giải pháp chuẩn mực để chặn triệt để hành vi
--   client tự ý sửa `role` hoặc `user_id`.
CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Lỗi bảo mật: Bạn không có quyền thay đổi vai trò (role) của tài khoản.';
  END IF;

  IF (NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Lỗi bảo mật: Không thể thay đổi định danh (user_id) của tài khoản.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_protect_system_fields ON public.profiles;
CREATE TRIGGER on_profile_protect_system_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_system_fields();

-- ==============================================================================
-- 6. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & THIẾT LẬP CHÍNH SÁCH BẢO MẬT
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- POLICY 1: SELECT (Hồ sơ công khai)
-- Ghi chú kiến trúc:
-- Cho phép mọi client (authenticated và anon) đọc profiles để hiển thị tên, avatar
-- của đối thủ trong ván đấu, phòng chờ và bảng xếp hạng (chuẩn bị cho P2.2 & P5.1).
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- POLICY 2: UPDATE (Chỉ chính chủ)
-- Chỉ người dùng sở hữu user_id mới được cập nhật profile của mình
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated, anon
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- CHÚ THÍCH BẢO MẬT:
-- TUYỆT ĐỐI KHÔNG tạo Policy INSERT hoặc DELETE cho client.
-- - Việc INSERT hồ sơ do Trigger SECURITY DEFINER (on_auth_user_created) thực hiện.
-- - Việc DELETE hồ sơ tự động được xử lý qua ràng buộc ON DELETE CASCADE khi auth.users bị xóa.

-- ==============================================================================
-- 7. TỰ ĐỘNG BACKFILL PROFILE CHO CÁC TÀI KHOẢN ĐÃ TỒN TẠI TỪ TRƯỚC
-- ==============================================================================
-- Ghi chú vận hành:
-- Khi chạy migration trên project đã có sẵn tài khoản từ các phase trước (P2.1b),
-- lệnh này đảm bảo 100% user trong auth.users đều có bản ghi profile hợp lệ ngay lập tức.
INSERT INTO public.profiles (user_id, display_name, avatar_url, role, is_anonymous, created_at, updated_at)
SELECT
  u.id,
  COALESCE(
    NULLIF(substr(trim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), 1, 20), ''),
    'Khách-' || substr(replace(u.id::text, '-', ''), 1, 6)
  ) AS display_name,
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') AS avatar_url,
  'player' AS role,
  COALESCE(u.is_anonymous, (u.raw_app_meta_data->>'provider' = 'anonymous'), false) AS is_anonymous,
  COALESCE(u.created_at, now()) AS created_at,
  now() AS updated_at
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

