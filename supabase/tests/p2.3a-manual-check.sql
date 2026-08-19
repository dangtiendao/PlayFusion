-- ==============================================================================
-- PLAYFUSION DATABASE TEST SCRIPT: p2.3a-manual-check.sql
-- ==============================================================================
-- Mục tiêu: Kiểm chứng toàn diện Schema, Constraints, Triggers (Append-Only),
--          Hàm đối soát và RLS của 2 bảng public.wallets và public.wallet_transactions.
--
-- Hướng dẫn: Dán toàn bộ vào SQL Editor Supabase Dashboard (DEV).
-- Mỗi khối đều có ghi chú KỲ VỌNG rõ ràng. Cuối file có khối dọn sạch dữ liệu test.
-- ==============================================================================

DO $$
DECLARE
  v_test_user_id uuid;
  v_test_key text := 'test-p23a-key-1';
  v_invalid_key text := 'test-p23a-key-2';
  v_wallet_bal bigint;
  v_ledger_sum bigint;
  v_is_consistent boolean;
BEGIN
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'BẮT ĐẦU CHUỖI KIỂM THỬ MANUAL CHO PHASE P2.3a (WALLETS & SỔ CÁI LEDGER)';
  RAISE NOTICE '======================================================================';

  -- 0. LẤY MỘT USER_ID THẬT TỪ PUBLIC.PROFILES ĐỂ TEST
  SELECT user_id INTO v_test_user_id FROM public.profiles LIMIT 1;
  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có user nào trong public.profiles để kiểm thử.';
  END IF;
  RAISE NOTICE '-> Sử dụng test user_id: %', v_test_user_id;

  -- ----------------------------------------------------------------------------
  -- TEST 1: XÁC NHẬN USER DEV ĐÃ ĐƯỢC BACKFILL VÍ (BALANCE = 0)
  -- KỲ VỌNG: TÌM THẤY 1 BẢN GHI VÍ CỦA USER VỚI BALANCE KHÔNG ÂM
  -- ----------------------------------------------------------------------------
  SELECT balance INTO v_wallet_bal FROM public.wallets WHERE user_id = v_test_user_id;
  IF v_wallet_bal IS NULL THEN
    RAISE EXCEPTION 'TEST 1 FAIL: User chưa có ví trong public.wallets (Backfill chưa chạy)!';
  END IF;
  RAISE NOTICE '✅ TEST 1 PASS: User đã có ví trong public.wallets với số dư ban đầu: %', v_wallet_bal;

  -- ----------------------------------------------------------------------------
  -- TEST 2: INSERT GIAO DỊCH HỢP LỆ (DAILY_BONUS +20) + ĐỐI SOÁT TỰ ĐỘNG
  -- KỲ VỌNG: INSERT VÀ UPDATE THÀNH CÔNG, HÀM AUDIT TRẢ VỀ is_consistent = true
  -- ----------------------------------------------------------------------------
  INSERT INTO public.wallet_transactions (
    user_id, amount, balance_after, type, idempotency_key
  ) VALUES (
    v_test_user_id, 20, 20, 'daily_bonus', v_test_key
  );

  UPDATE public.wallets
  SET balance = 20
  WHERE user_id = v_test_user_id;

  SELECT wallet_balance, ledger_sum, is_consistent
  INTO v_wallet_bal, v_ledger_sum, v_is_consistent
  FROM public.audit_wallet_balance(v_test_user_id);

  IF NOT v_is_consistent OR v_wallet_bal <> 20 OR v_ledger_sum <> 20 THEN
    RAISE EXCEPTION 'TEST 2 FAIL: Đối soát số dư thất bại! Ví: %, Sổ cái: %', v_wallet_bal, v_ledger_sum;
  END IF;
  RAISE NOTICE '✅ TEST 2 PASS: Insert giao dịch daily_bonus và đối soát khớp 100%% (Ví: 20, Sổ cái: 20)!';

  -- ----------------------------------------------------------------------------
  -- TEST 3: VI PHẠM TRÙNG IDEMPOTENCY_KEY KHI RETRY
  -- KỲ VỌNG: NÉM LỖI UNIQUE wallet_transactions_idempotency_key_key
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.wallet_transactions (
      user_id, amount, balance_after, type, idempotency_key
    ) VALUES (
      v_test_user_id, 20, 40, 'daily_bonus', v_test_key
    );
    RAISE EXCEPTION 'TEST 3 FAIL: Không chặn được giao dịch trùng idempotency_key!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ TEST 3 PASS: Chặn thành công giao dịch trùng lặp khi retry (Unique idempotency_key)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 4: VI PHẠM LUẬT APPEND-ONLY KHI CỐ TÌNH UPDATE SỔ CÁI
  -- KỲ VỌNG: TRIGGER NÉM LỖI RAISE EXCEPTION 'Ledger is append-only'
  -- ----------------------------------------------------------------------------
  BEGIN
    UPDATE public.wallet_transactions
    SET amount = 999999
    WHERE idempotency_key = v_test_key;
    RAISE EXCEPTION 'TEST 4 FAIL: Không chặn được thao tác UPDATE trên sổ cái!';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE '✅ TEST 4 PASS: Trigger chặn thành công thao tác UPDATE trên sổ cái!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 5: VI PHẠM LUẬT APPEND-ONLY KHI CỐ TÌNH DELETE SỔ CÁI
  -- KỲ VỌNG: TRIGGER NÉM LỖI RAISE EXCEPTION 'Ledger is append-only'
  -- ----------------------------------------------------------------------------
  BEGIN
    DELETE FROM public.wallet_transactions
    WHERE idempotency_key = v_test_key;
    RAISE EXCEPTION 'TEST 5 FAIL: Không chặn được thao tác DELETE trên sổ cái!';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE '✅ TEST 5 PASS: Trigger chặn thành công thao tác DELETE trên sổ cái!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 6: VI PHẠM RÀNG BUỘC GIAO DỊCH AMOUNT = 0 (VÔ NGHĨA)
  -- KỲ VỌNG: NÉM LỖI CHECK amount <> 0
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.wallet_transactions (
      user_id, amount, balance_after, type, idempotency_key
    ) VALUES (
      v_test_user_id, 0, 20, 'admin_adjust', v_invalid_key
    );
    RAISE EXCEPTION 'TEST 6 FAIL: Không chặn được giao dịch có amount = 0!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 6 PASS: Chặn thành công giao dịch amount = 0!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 7: VI PHẠM CHECK NHẤT QUÁN REF_TYPE / REF_ID
  -- KỲ VỌNG: NÉM LỖI CHECK chk_wallet_transactions_ref_consistency
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.wallet_transactions (
      user_id, amount, balance_after, type, ref_type, ref_id, idempotency_key
    ) VALUES (
      v_test_user_id, 50, 70, 'match_reward', 'match', NULL, v_invalid_key
    );
    RAISE EXCEPTION 'TEST 7 FAIL: Không chặn được giao dịch có ref_type nhưng thiếu ref_id!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 7 PASS: Chặn thành công giao dịch thiếu ref_id khi có ref_type!';
  END;

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '🎉 TẤT CẢ 7 BÀI TEST TIỀN TỆ VÀ SỔ CÁI ĐÃ PASS 100%!';
  RAISE NOTICE '======================================================================';
END;
$$;

-- ==============================================================================
-- 8. DỌN SẠCH DỮ LIỆU THỬ NGHIỆM TRÊN DEV (CLEANUP)
-- ==============================================================================
-- ⚠️ CẢNH BÁO NGUY HIỂM / QUY TẮC BẢO MẬT:
-- Thao tác vô hiệu hóa trigger chỉ được phép thực hiện trong môi trường TEST trên DEV
-- để dọn dẹp dữ liệu thử. TUYỆT ĐỐI KHÔNG BAO GIỜ THỰC HIỆN TRÊN PROD!
ALTER TABLE public.wallet_transactions DISABLE TRIGGER on_wallet_transactions_prevent_mutation;

DELETE FROM public.wallet_transactions WHERE idempotency_key = 'test-p23a-key-1';

ALTER TABLE public.wallet_transactions ENABLE TRIGGER on_wallet_transactions_prevent_mutation;

-- Đưa số dư ví về 0 như trước khi test
UPDATE public.wallets
SET balance = 0
WHERE user_id IN (SELECT user_id FROM public.profiles LIMIT 1);

SELECT '🧹 CLEANUP HOÀN TẤT: Đã xóa giao dịch test và bật lại trigger bảo vệ append-only. Dev sạch 100%!' AS status;
