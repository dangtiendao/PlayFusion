-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0009_rls_hardening.sql
-- ==============================================================================
-- Mục tiêu: Vá các điểm bảo mật tiềm ẩn và thắt chặt Row Level Security (RLS)
--          trên toàn bộ 15 bảng cơ sở dữ liệu theo docs/security/rls-matrix.md.
--
-- Các điểm vá bảo mật (Security Hardening):
-- 1. BẢO VỆ CỘT `is_anonymous` TRÊN `public.profiles`:
--    Nâng cấp trigger protect_profile_system_fields để chặn đứng hành vi người dùng
--    authenticated tự ý gửi lệnh `UPDATE profiles SET is_anonymous = false` từ client.
-- 2. TƯỜNG MINH HÓA ROLE `TO authenticated` CHO CÁC DỮ LIỆU RIÊNG TƯ:
--    Chuyển đổi các chính sách SELECT trên các bảng tài chính/cá nhân (wallets,
--    wallet_transactions, user_inventory, purchases, orders) thành rõ ràng
--    `TO authenticated USING (auth.uid() = user_id)`, loại trừ role `anon` tường minh.
-- 3. BẢO ĐẢM 100% 15 BẢNG ĐỀU BẬT RLS (IDEMPOTENT CHECK).
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV và PROD).
-- ==============================================================================

-- ==============================================================================
-- 1. VÁ BẢO VỆ CỘT HỆ THỐNG TRÊN PUBLIC.PROFILES
-- ==============================================================================
-- Lý do vá: Chặn người dùng tự ý thăng hạng role hoặc tự gỡ nhãn Ẩn danh (is_anonymous)
-- từ client mà không thông qua luồng liên kết tài khoản Google từ trigger Auth.
CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Lỗi bảo mật: Bạn không có quyền thay đổi vai trò (role) của tài khoản.';
  END IF;

  IF (NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Lỗi bảo mật: Không thể thay đổi định danh (user_id) của tài khoản.';
  END IF;

  -- Chặn client tự ý đổi trạng thái is_anonymous (chỉ trigger auth SECURITY DEFINER mới được phép)
  IF (NEW.is_anonymous IS DISTINCT FROM OLD.is_anonymous AND current_user <> 'postgres' AND auth.role() = 'authenticated') THEN
    RAISE EXCEPTION 'Lỗi bảo mật: Không thể tự ý thay đổi trạng thái xác thực (is_anonymous) từ client.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tái đăng ký trigger trên bảng profiles
DROP TRIGGER IF EXISTS on_profile_protect_system_fields ON public.profiles;
CREATE TRIGGER on_profile_protect_system_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_system_fields();

-- ==============================================================================
-- 2. TƯỜNG MINH HÓA RLS POLICIES DỮ LIỆU RIÊNG TƯ (TO authenticated)
-- ==============================================================================
-- Lý do vá: Loại trừ role `anon` ngay từ danh sách target roles của policy
-- để đảm bảo an toàn tuyệt đối và tường minh theo ma trận rls-matrix.md.

-- 2.1. wallets
DROP POLICY IF EXISTS "Users can view their own wallet" ON public.wallets;
CREATE POLICY "Users can view their own wallet"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2.2. wallet_transactions
DROP POLICY IF EXISTS "Users can view their own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view their own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2.3. user_inventory
DROP POLICY IF EXISTS "Users can view their own inventory" ON public.user_inventory;
CREATE POLICY "Users can view their own inventory"
  ON public.user_inventory FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2.4. purchases
DROP POLICY IF EXISTS "Users can view their own purchases" ON public.purchases;
CREATE POLICY "Users can view their own purchases"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2.5. orders
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- 3. BẢO ĐẢM KÍCH HOẠT ROW LEVEL SECURITY TRÊN TOÀN BỘ 15 BẢNG
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_equipped ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
