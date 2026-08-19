-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0010_hardening.sql
-- ==============================================================================
-- Mục tiêu: Khóa toàn diện các góc khuất ngoài RLS (Thu hồi quyền anon, thiết lập
--          ALTER DEFAULT PRIVILEGES, chống Search Path Hijacking, và thu hồi quyền
--          EXECUTE các hàm hệ thống nhạy cảm khỏi client).
--
-- Ghi chú kiến trúc:
-- 1. THU HỒI QUYỀN CỦA VAI TRÒ ANON:
--    - Toàn bộ người chơi trong Web Game Hub đều hoạt động dưới phiên xác thực
--      (cả tài khoản Google và tài khoản Ẩn danh đều có vai trò 'authenticated').
--    - Khách chưa xác thực (anon) bị thu hồi 100% quyền SELECT/INSERT/UPDATE/DELETE.
--    - Khóa ALTER DEFAULT PRIVILEGES để đảm bảo mọi bảng/sequence tạo mới trong tương
--      lai không bao giờ tự động cấp quyền cho anon.
-- 2. CHỐNG SEARCH PATH HIJACKING & CÔ LẬP HÀM:
--    - Khóa cứng 'SET search_path = public' cho toàn bộ 10 functions tự tạo để ngăn chặn
--      tấn công ghi đè hàm qua search_path không an toàn.
--    - Thu hồi quyền EXECUTE các hàm trigger và hàm đối soát tài chính audit_wallet_balance
--      khỏi vai trò anon và authenticated (chỉ cho phép service_role gọi đối soát).
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV và PROD).
-- ==============================================================================

-- 1. THU HỒI TOÀN BỘ QUYỀN TRUY CẬP CỦA VAI TRÒ ANON TRÊN SCHEMA PUBLIC
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Khóa quyền mặc định cho các bảng, sequence, routine tạo mới trong tương lai
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;

-- ==============================================================================
-- 2. CHUẨN HÓA SEARCH_PATH VÀ THU HỒI EXECUTE CHO CÁC FUNCTIONS HỆ THỐNG
-- ==============================================================================

-- 2.1. Functions Trigger Auth (SECURITY DEFINER)
ALTER FUNCTION public.handle_new_user() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.handle_user_update() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_user_update() FROM PUBLIC, anon, authenticated;

-- 2.2. Functions Trigger Hồ sơ, Ví & Starter Cosmetics (SECURITY DEFINER)
ALTER FUNCTION public.handle_new_profile_wallet() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_wallet() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.handle_new_profile_starter_cosmetics() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_starter_cosmetics() FROM PUBLIC, anon, authenticated;

-- 2.3. Hàm Đối Soát Số Dư Ví (SECURITY DEFINER - Chỉ Server service_role được gọi)
ALTER FUNCTION public.audit_wallet_balance(uuid) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.audit_wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_wallet_balance(uuid) TO service_role;

-- 2.4. Functions Trigger Tiện Ích & Append-Only (SECURITY INVOKER)
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.protect_profile_system_fields() SET search_path = public;
ALTER FUNCTION public.prevent_wallet_transactions_mutation() SET search_path = public;
ALTER FUNCTION public.prevent_purchases_mutation() SET search_path = public;
ALTER FUNCTION public.prevent_audit_logs_mutation() SET search_path = public;
