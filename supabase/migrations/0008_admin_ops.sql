-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0008_admin_ops.sql
-- ==============================================================================
-- Mục tiêu: Tạo 3 bảng Quản trị & Vận hành (audit_logs, system_config, orders),
--          nạp 11 cấu hình kinh tế/luật chơi ban đầu và thiết lập RLS.
--
-- Ghi chú kiến trúc:
-- 1. AUDIT_LOGS (CHỨNG TỪ HÀNH ĐỘNG ADMIN):
--    - Ghi nhận mọi can thiệp đặc quyền của Admin (khóa user, cộng/trừ xu, sửa config).
--    - Cột reason bắt buộc >= 3 ký tự (thao tác admin không lý do là vô giá trị khi tranh chấp).
--    - Khắc luật Append-Only (trigger chặn UPDATE/DELETE) và không CASCADE khi xóa user.
--    - RLS khóa trắng 100% đối với client (chỉ service_role hoặc Admin dashboard P5.1 đọc/ghi).
-- 2. SYSTEM_CONFIG (CẤU HÌNH KHÔNG CẦN DEPLOY):
--    - Cấu trúc Key-Value lưu giá trị jsonb kèm description tiếng Việt bắt buộc.
--    - Đổi mức thưởng, hệ số K Elo, thời gian reconnect trực tiếp mà không cần sửa code bundle.
--    - RLS SELECT chỉ cho phép client đọc các key có tiền tố 'reward.', 'match.', 'penalty.', 'elo.'.
-- 3. ORDERS (KHUNG NẠP TIỀN TƯƠNG LAI):
--    - Khung giao dịch thanh toán qua cổng ví điện tử (MoMo, ZaloPay, VNPay).
--    - ĐẶC BIỆT CHÚ Ý: Bảng này chỉ khai báo sẵn khung dữ liệu (chưa tích hợp cổng thanh toán).
--      Phase P6.x+ mới chính thức kích hoạt kèm tư vấn pháp lý.
--    - idempotency_key UNIQUE chống trùng khi webhook retry.
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV và PROD).
-- ==============================================================================

-- 1. BẢNG PUBLIC.AUDIT_LOGS (Chứng từ nhật ký hành động Admin)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(user_id), -- KHÔNG CASCADE
  action text NOT NULL,                                       -- 'ban_user', 'adjust_balance', 'update_config'... (để mở không check enum)
  target_type text NULL,
  target_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 3),-- Bắt buộc có lý do >= 3 ký tự
  created_at timestamptz NOT NULL DEFAULT now(),

  -- CHECK NHẤT QUÁN: target_type và target_id bắt buộc đi cùng nhau
  CONSTRAINT chk_audit_logs_target_consistency CHECK ((target_type IS NULL) = (target_id IS NULL))
);

-- Trigger Append-Only: Cấm tuyệt đối sửa hoặc xóa nhật ký audit
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only: UPDATE and DELETE operations are strictly prohibited on audit_logs.';
END;
$$;

DROP TRIGGER IF EXISTS on_audit_logs_prevent_mutation ON public.audit_logs;
CREATE TRIGGER on_audit_logs_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_mutation();

-- ==============================================================================
-- 2. BẢNG PUBLIC.SYSTEM_CONFIG (Bảng cấu hình hệ thống Key-Value)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.system_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text NOT NULL,                                 -- Bắt buộc mô tả ý nghĩa config
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles(user_id)
);

DROP TRIGGER IF EXISTS on_system_config_updated_at ON public.system_config;
CREATE TRIGGER on_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 3. BẢNG PUBLIC.ORDERS (Khung nạp tiền tương lai - Kích hoạt ở Phase P6.x+)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id), -- KHÔNG CASCADE
  package_id text NOT NULL,
  amount_vnd int NOT NULL CHECK (amount_vnd > 0),
  coins bigint NOT NULL CHECK (coins > 0),
  provider text NULL CHECK (provider IS NULL OR provider IN ('momo', 'zalopay', 'vnpay')),
  provider_txn_id text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  idempotency_key text NOT NULL UNIQUE,                      -- Khóa chống trùng khi webhook retry
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL,

  -- CHECK NHẤT QUÁN: Trạng thái paid bắt buộc phải có thời điểm paid_at
  CONSTRAINT chk_orders_paid_consistency CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);

-- Partial Unique Index: 1 mã giao dịch của cổng thanh toán chỉ khớp duy nhất 1 đơn hàng
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_provider_txn
  ON public.orders (provider, provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;

-- ==============================================================================
-- 4. CÁC INDEX TỐI ƯU TRUY VẤN
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_created
  ON public.audit_logs (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (target_type, target_id)
  WHERE target_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_pending
  ON public.orders (status)
  WHERE status = 'pending';

-- ==============================================================================
-- 5. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & CHÍNH SÁCH BẢO MẬT
-- ==============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 5.1. audit_logs: KHÓA TRẮNG HOÀN TOÀN với client (chỉ service_role đọc/ghi, mở cho admin ở P5.1)

-- 5.2. system_config: Cho phép client đọc các key công khai theo tiền tố
DROP POLICY IF EXISTS "Public system configs are viewable by everyone" ON public.system_config;
CREATE POLICY "Public system configs are viewable by everyone"
  ON public.system_config FOR SELECT
  TO authenticated, anon
  USING (
    key LIKE 'reward.%'
    OR key LIKE 'match.%'
    OR key LIKE 'penalty.%'
    OR key LIKE 'elo.%'
  );

-- 5.3. orders: Chỉ chính chủ xem đơn hàng của mình; cấm ghi trực tiếp từ client
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = user_id);

-- ==============================================================================
-- 6. SEED 11 CẤU HÌNH KINH TẾ & TRẬN ĐẤU BAN ĐẦU
-- ==============================================================================
INSERT INTO public.system_config (key, value, description)
VALUES
  ('reward.win_ranked', '{"coins": 50}'::jsonb, 'Thưởng xu khi thắng trận đấu xếp hạng'),
  ('reward.loss_ranked', '{"coins": 5}'::jsonb, 'Thưởng an ủi khi thua trận đấu xếp hạng'),
  ('reward.draw_ranked', '{"coins": 20}'::jsonb, 'Thưởng xu khi hòa trận đấu xếp hạng'),
  ('reward.win_vs_ai_hard', '{"coins": 10}'::jsonb, 'Thưởng xu khi thắng Bot AI cấp độ Khó'),
  ('reward.daily_login', '{"coins": 20}'::jsonb, 'Thưởng xu điểm danh đăng nhập hàng ngày'),
  ('reward.daily_cap', '{"coins": 500}'::jsonb, 'Giới hạn số xu tối đa nhận từ chơi game trong 1 ngày'),
  ('penalty.abandon', '{"coins": -20}'::jsonb, 'Phạt trừ xu khi thoát trận giữa chừng'),
  ('elo.k_placement', '{"k": 60}'::jsonb, 'Hệ số K Elo trong giai đoạn định hạng (<15 trận)'),
  ('elo.k_normal', '{"k": 32}'::jsonb, 'Hệ số K Elo chuẩn cho người chơi thông thường'),
  ('elo.k_high', '{"k": 16, "threshold": 2000}'::jsonb, 'Hệ số K Elo cho kỳ thủ có điểm rank >= 2000'),
  ('match.reconnect_window_seconds', '{"seconds": 60}'::jsonb, 'Thời gian chờ kết nối lại mạng (giây) trước khi xử thua')
ON CONFLICT (key) DO NOTHING;
