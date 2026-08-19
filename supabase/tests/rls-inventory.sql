-- ==============================================================================
-- PLAYFUSION DATABASE SCRIPT: rls-inventory.sql
-- ==============================================================================
-- Mục tiêu: Kiểm kê tự động toàn bộ trạng thái Row Level Security (RLS), danh sách
--          Policies, vai trò áp dụng và Triggers Append-Only của 15 bảng DB.
--
-- Hướng dẫn: Dán toàn bộ vào SQL Editor Supabase Dashboard (DEV hoặc PROD).
-- Kết quả xuất ra dùng để đối chiếu mắt nhanh với docs/security/rls-matrix.md.
-- ==============================================================================

-- 1. KIỂM TRA TRẠNG THÁI BẬT/TẮT RLS TRÊN 15 BẢNG (KỲ VỌNG: 100% rls_enabled = true)
SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED (LỖI)' END AS rls_status,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'profiles', 'games', 'seasons', 'matches', 'match_participants', 'player_ratings',
    'wallets', 'wallet_transactions', 'shop_items', 'user_inventory', 'user_equipped',
    'purchases', 'audit_logs', 'system_config', 'orders'
  )
ORDER BY c.relname;

-- 2. LIỆT KÊ CHI TIẾT 100% RLS POLICIES (TÊN, LỆNH, ROLE, QUAL, WITH CHECK)
SELECT
  tablename AS table_name,
  policyname AS policy_name,
  cmd AS command,
  roles AS target_roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 3. LIỆT KÊ CÁC TRIGGER APPEND-ONLY BẢO VỆ SỔ CÁI BẤT BIẾN (KỲ VỌNG: 3 triggers)
SELECT
  event_object_table AS table_name,
  trigger_name,
  action_timing AS timing,
  event_manipulation AS event,
  action_statement AS action
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%prevent%mutation%'
ORDER BY event_object_table;

-- 4. TỔNG HỢP NHANH (SUMMARY DASHBOARD)
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND c.relname IN ('profiles', 'games', 'seasons', 'matches', 'match_participants', 'player_ratings', 'wallets', 'wallet_transactions', 'shop_items', 'user_inventory', 'user_equipped', 'purchases', 'audit_logs', 'system_config', 'orders')) AS tables_with_rls_enabled,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS total_active_policies,
  (SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name LIKE '%prevent%mutation%') AS total_append_only_triggers;
