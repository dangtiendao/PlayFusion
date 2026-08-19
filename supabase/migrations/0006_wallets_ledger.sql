-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0006_wallets_ledger.sql
-- ==============================================================================
-- Mục tiêu: Thiết lập hệ thống tiền tệ và sổ cái tài chính nghiêm ngặt của dự án.
--
-- 4 NGUYÊN TẮC BẤT BIẾN CỐT LÕI (ENFORCED TẠI TẦNG DB):
-- 1. SỔ CÁI CHỈ INSERT (APPEND-ONLY):
--    - Trigger BEFORE UPDATE OR DELETE trên wallet_transactions ném lỗi chặn đứng
--      mọi hành vi sửa/xóa sổ cái. Sửa sai DUY NHẤT bằng giao dịch bù.
-- 2. SỐ NGUYÊN (BIGINT):
--    - balance, amount, balance_after đều dùng bigint (64-bit integer), không bao giờ float.
-- 3. IDEMPOTENCY KEY UNIQUE:
--    - Khóa idempotency_key UNIQUE trên wallet_transactions chống ghi trùng khi retry.
-- 4. ĐỐI SOÁT ĐƯỢC (RECONCILABLE):
--    - wallets.balance là ảnh chụp để đọc nhanh; wallet_transactions là nguồn chân lý.
--    - Hàm audit_wallet_balance() phục vụ đối soát độc lập balance = SUM(amount).
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV; PROD gộp ở P2.3c).
-- ==============================================================================

-- 1. BẢNG PUBLIC.WALLETS (Ảnh chụp số dư ví người chơi)
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),   -- Không cho phép âm ví ở tầng DB
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger cập nhật updated_at tự động
DROP TRIGGER IF EXISTS on_wallets_updated_at ON public.wallets;
CREATE TRIGGER on_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger tự động khởi tạo ví khi có Profile mới (SECURITY DEFINER, Idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_profile_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_create_wallet ON public.profiles;
CREATE TRIGGER on_profile_created_create_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_wallet();

-- Backfill ví cho toàn bộ profiles hiện có chưa có ví
INSERT INTO public.wallets (user_id, balance)
SELECT user_id, 0
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- ==============================================================================
-- 2. BẢNG PUBLIC.WALLET_TRANSACTIONS (Sổ cái giao dịch Append-Only)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id), -- KHÔNG CASCADE: Sổ cái là chứng từ kế toán vĩnh viễn
  amount bigint NOT NULL CHECK (amount <> 0),                -- Dương = cộng, Âm = trừ, cấm giao dịch 0 vô nghĩa
  balance_after bigint NOT NULL CHECK (balance_after >= 0),  -- Số dư sau giao dịch không âm
  type text NOT NULL CHECK (type IN (
    'match_reward', 'match_penalty', 'daily_bonus', 'admin_adjust', 'purchase', 'topup', 'refund'
  )),
  ref_type text NULL CHECK (ref_type IS NULL OR ref_type IN ('match', 'order', 'purchase', 'audit')),
  ref_id uuid NULL,
  idempotency_key text NOT NULL UNIQUE,                      -- Khóa chống ghi trùng khi retry (DoD gốc P2.3)
  created_at timestamptz NOT NULL DEFAULT now(),

  -- CHECK NHẤT QUÁN: ref_type và ref_id bắt buộc đi cùng nhau
  CONSTRAINT chk_wallet_transactions_ref_consistency CHECK ((ref_type IS NULL) = (ref_id IS NULL))
);

-- KHẮC LUẬT APPEND-ONLY VÀO DB: Cấm tuyệt đối mọi thao tác UPDATE hoặc DELETE trên sổ cái
CREATE OR REPLACE FUNCTION public.prevent_wallet_transactions_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger is append-only: UPDATE and DELETE operations are strictly prohibited on wallet_transactions.';
END;
$$;

DROP TRIGGER IF EXISTS on_wallet_transactions_prevent_mutation ON public.wallet_transactions;
CREATE TRIGGER on_wallet_transactions_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_wallet_transactions_mutation();

-- ==============================================================================
-- 3. CÁC INDEX TỐI ƯU TRUY VẤN SỔ CÁI
-- ==============================================================================

-- Index a: Lịch sử biến động số dư của 1 người chơi (UI Ví P4.5, Admin P5.5)
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

-- Index b: Thống kê nguồn thu/chi xu theo loại giao dịch (Admin P5.5, Cân bằng kinh tế P6.x)
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type_created
  ON public.wallet_transactions (type, created_at DESC);

-- ==============================================================================
-- 4. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & THIẾT LẬP BẢO MẬT
-- ==============================================================================
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Policy SELECT cho public.wallets: CHỈ CHÍNH CHỦ mới xem được số dư của mình (Số dư là riêng tư)
DROP POLICY IF EXISTS "Users can view their own wallet" ON public.wallets;
CREATE POLICY "Users can view their own wallet"
  ON public.wallets
  FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = user_id);

-- Policy SELECT cho public.wallet_transactions: CHỈ CHÍNH CHỦ mới xem được lịch sử giao dịch
DROP POLICY IF EXISTS "Users can view their own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view their own wallet transactions"
  ON public.wallet_transactions
  FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = user_id);

-- CHÚ THÍCH BẢO MẬT (DENY-WRITE BY DEFAULT):
-- TUYỆT ĐỐI KHÔNG cấp Policy INSERT / UPDATE / DELETE cho client (anon / authenticated).
-- Toàn bộ biến động số dư do Server Edge Functions (settle_match P4.2, purchase_item P6.2)
-- hoặc DB Functions thực hiện qua service_role.

-- ==============================================================================
-- 5. HÀM ĐỐI SOÁT ĐỘC LẬP (AUDIT RECONCILIATION FUNCTION)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.audit_wallet_balance(p_user_id uuid)
RETURNS TABLE(wallet_balance bigint, ledger_sum bigint, is_consistent boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_bal bigint := 0;
  v_ledger_sum bigint := 0;
BEGIN
  SELECT balance INTO v_wallet_bal
  FROM public.wallets
  WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_ledger_sum
  FROM public.wallet_transactions
  WHERE user_id = p_user_id;

  v_wallet_bal := COALESCE(v_wallet_bal, 0);

  RETURN QUERY
  SELECT
    v_wallet_bal,
    v_ledger_sum,
    (v_wallet_bal = v_ledger_sum);
END;
$$;

-- Chỉ cấp quyền gọi hàm đối soát cho service_role / postgres
REVOKE EXECUTE ON FUNCTION public.audit_wallet_balance(uuid) FROM PUBLIC, anon, authenticated;
