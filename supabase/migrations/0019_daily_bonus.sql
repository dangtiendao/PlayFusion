-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0019_daily_bonus.sql
-- ==============================================================================
-- Mục tiêu: Tạo RPC `claim_daily_bonus()` cho phép client (authenticated) điểm danh
--          nhận thưởng xu hàng ngày (+20 xu) với tính lũy suy (Idempotency) tuyệt đối.
--
-- Ghi chú kiến trúc & Bảo mật:
-- 1. CHUẨN BẢO MẬT RPC P2.4c:
--    - SECURITY DEFINER + SET search_path = ''
--    - REVOKE toàn bộ quyền từ PUBLIC và anon; chỉ GRANT EXECUTE cho authenticated (và service_role).
-- 2. MÚI GIỜ VIỆT NAM (ASIA/HO_CHI_MINH) NHẤT QUÁN VỚI P4.5a:
--    - Mốc ngày được xác định theo 'Asia/Ho_Chi_Minh': to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD').
--    - Khóa lũy suy duy nhất: 'daily:' || auth.uid() || ':' || today.
-- 3. XỬ LÝ CHỐNG TRÙNG LẶP & ĐUA CONCURRENT (IDEMPOTENT FAIL-SOFT):
--    - Kiểm tra và bắt lỗi unique_violation trên idempotency_key -> trả về {"claimed": false, "already": true, "balance": cur_bal}.
--    - Tuyệt đối KHÔNG RAISE EXCEPTION khi gọi lại, vì bấm nhiều lần hoặc mở nhiều tab là hành vi bình thường.
-- 4. TRẦN NGÀY MATCH_REWARD ĐỘC LẬP:
--    - daily_bonus là phần thưởng đăng nhập hệ thống, KHÔNG bị tính vào trần 500 xu của match_reward (P4.5a).
-- ==============================================================================

-- 1. SEED SYSTEM CONFIG: CẤU HÌNH THƯỞNG ĐIỂM DANH HÀNG NGÀY
INSERT INTO public.system_config (key, value, description)
VALUES (
  'reward.daily_login',
  '{"coins": 20}'::jsonb,
  'Phần thưởng xu khi điểm danh hàng ngày (mỗi ngày 1 lần theo giờ Việt Nam).'
)
ON CONFLICT (key) DO NOTHING;

-- 2. TẠO STORED FUNCTION claim_daily_bonus
CREATE OR REPLACE FUNCTION public.claim_daily_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_coins bigint;
  v_today text;
  v_idempotency_key text;
  v_cur_balance bigint;
  v_new_balance bigint;
BEGIN
  -- a. Kiểm tra xác thực người dùng
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '42501';
  END IF;

  -- b. Đọc cấu hình reward.daily_login từ system_config (fallback an toàn 20 xu)
  SELECT COALESCE((value->>'coins')::bigint, 20)
  INTO v_coins
  FROM public.system_config
  WHERE key = 'reward.daily_login';

  IF v_coins IS NULL OR v_coins <= 0 THEN
    v_coins := 20; -- Fail-soft nếu cấu hình bị hỏng hoặc âm
  END IF;

  -- c. Xác định ngày hôm nay theo múi giờ Việt Nam (Asia/Ho_Chi_Minh) - Đồng bộ với P4.5a
  v_today := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
  v_idempotency_key := 'daily:' || v_user_id::text || ':' || v_today;

  -- d. Khởi tạo ví nếu chưa có và khóa dòng ví bằng SELECT FOR UPDATE
  INSERT INTO public.wallets (user_id, balance)
  VALUES (v_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_cur_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- e. Kiểm tra xem hôm nay đã nhận thưởng điểm danh chưa
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE idempotency_key = v_idempotency_key
  ) THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'already', true,
      'balance', v_cur_balance
    );
  END IF;

  -- f. Áp dụng cộng xu và ghi sổ cái bất biến (bọc bắt lỗi unique_violation chống đua song song)
  v_new_balance := v_cur_balance + v_coins;

  BEGIN
    INSERT INTO public.wallet_transactions (
      user_id,
      amount,
      balance_after,
      type,
      ref_type,
      ref_id,
      idempotency_key
    ) VALUES (
      v_user_id,
      v_coins,
      v_new_balance,
      'daily_bonus',
      NULL,
      NULL,
      v_idempotency_key
    );

    UPDATE public.wallets
    SET balance = v_new_balance
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'claimed', true,
      'coins', v_coins,
      'balance', v_new_balance
    );
  EXCEPTION WHEN unique_violation THEN
    -- Trường hợp 2 request gửi đồng thời (Promise.all race): Giao dịch thứ 2 gặp trùng key -> Trả về already
    RETURN jsonb_build_object(
      'claimed', false,
      'already', true,
      'balance', v_cur_balance
    );
  END;
END;
$$;

-- 3. PHÂN QUYỀN STORED FUNCTION
REVOKE ALL ON FUNCTION public.claim_daily_bonus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus() TO authenticated, service_role;
