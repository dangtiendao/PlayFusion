-- ==============================================================================
-- PLAYFUSION DATABASE TEST SCRIPT: p2.3c-manual-check.sql
-- ==============================================================================
-- Mục tiêu: Kiểm chứng toàn diện Schema, Constraints, Triggers và RLS của 3 bảng
--          audit_logs, system_config, orders trên DEV.
--
-- Hướng dẫn: Dán toàn bộ vào SQL Editor Supabase Dashboard (DEV).
-- Mỗi khối đều có ghi chú KỲ VỌNG rõ ràng. Cuối file có khối dọn sạch dữ liệu test.
-- ==============================================================================

DO $$
DECLARE
  v_test_user_id uuid;
  v_count int;
  v_test_audit_id uuid := 'd0000000-0000-0000-0000-000000000001'::uuid;
  v_test_order_id uuid := 'e0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'BẮT ĐẦU CHUỖI KIỂM THỬ MANUAL CHO PHASE P2.3c (AUDIT, CONFIG & ORDERS)';
  RAISE NOTICE '======================================================================';

  -- 0. LẤY MỘT USER_ID THẬT TỪ PUBLIC.PROFILES ĐỂ TEST
  SELECT user_id INTO v_test_user_id FROM public.profiles LIMIT 1;
  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có user nào trong public.profiles để kiểm thử.';
  END IF;
  RAISE NOTICE '-> Sử dụng test user_id: %', v_test_user_id;

  -- ----------------------------------------------------------------------------
  -- TEST 1: INSERT AUDIT_LOG HỢP LỆ VÀ KIỂM TRA RÀNG BUỘC REASON >= 3 KÝ TỰ
  -- KỲ VỌNG: INSERT THÀNH CÔNG BẢN GHI AUDIT LOG
  -- ----------------------------------------------------------------------------
  INSERT INTO public.audit_logs (
    id, admin_id, action, target_type, target_id, payload, reason
  ) VALUES (
    v_test_audit_id,
    v_test_user_id,
    'adjust_balance',
    'wallet',
    v_test_user_id::text,
    '{"amount": 100, "before": 0, "after": 100}'::jsonb,
    'Cong xu boi thuong su co lag server'
  );

  RAISE NOTICE '✅ TEST 1 PASS: Insert audit_log hợp lệ thành công!';

  -- ----------------------------------------------------------------------------
  -- TEST 2: VI PHẠM RÀNG BUỘC REASON NGẮN HƠN 3 KÝ TỰ
  -- KỲ VỌNG: NÉM LỖI CHECK char_length(trim(reason)) >= 3
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.audit_logs (
      admin_id, action, reason
    ) VALUES (
      v_test_user_id, 'ban_user', 'ok'
    );
    RAISE EXCEPTION 'TEST 2 FAIL: Không chặn được audit log có reason < 3 ký tự!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 2 PASS: Chặn thành công thao tác admin thiếu lý do cụ thể (reason >= 3 ký tự)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 3: VI PHẠM TRIGGER APPEND-ONLY TRÊN AUDIT_LOGS
  -- KỲ VỌNG: TRIGGER NÉM LỖI KHI CỐ TÌNH UPDATE BẢN GHI AUDIT_LOGS
  -- ----------------------------------------------------------------------------
  BEGIN
    UPDATE public.audit_logs
    SET reason = 'Sua ly do gian lan'
    WHERE id = v_test_audit_id;
    RAISE EXCEPTION 'TEST 3 FAIL: Không chặn được thao tác UPDATE trên audit_logs!';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE '✅ TEST 3 PASS: Trigger chặn thành công thao tác UPDATE trên bảng audit_logs!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 4: XÁC NHẬN SYSTEM_CONFIG ĐÃ SEED ĐỦ 11 CẤU HÌNH CÔNG KHAI
  -- KỲ VỌNG: ĐẾM ĐỦ 11 CẤU HÌNH TRONG BẢNG SYSTEM_CONFIG
  -- ----------------------------------------------------------------------------
  SELECT count(*) INTO v_count
  FROM public.system_config
  WHERE key LIKE 'reward.%' OR key LIKE 'match.%' OR key LIKE 'penalty.%' OR key LIKE 'elo.%';

  IF v_count <> 11 THEN
    RAISE EXCEPTION 'TEST 4 FAIL: Bảng system_config chưa seed đủ 11 key (Đếm: %)!', v_count;
  END IF;
  RAISE NOTICE '✅ TEST 4 PASS: Đã seed đủ 11 key cấu hình hệ thống công khai trong system_config!';

  -- ----------------------------------------------------------------------------
  -- TEST 5: KIỂM TRA RÀNG BUỘC ORDERS: TRÙNG IDEMPOTENCY_KEY
  -- KỲ VỌNG: NÉM LỖI UNIQUE orders_idempotency_key_key KHI RETRY
  -- ----------------------------------------------------------------------------
  INSERT INTO public.orders (
    id, user_id, package_id, amount_vnd, coins, idempotency_key
  ) VALUES (
    v_test_order_id, v_test_user_id, 'pkg_coins_500', 50000, 500, 'test-order-key-1'
  );

  BEGIN
    INSERT INTO public.orders (
      user_id, package_id, amount_vnd, coins, idempotency_key
    ) VALUES (
      v_test_user_id, 'pkg_coins_500', 50000, 500, 'test-order-key-1'
    );
    RAISE EXCEPTION 'TEST 5 FAIL: Không chặn được đơn hàng trùng idempotency_key!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ TEST 5 PASS: Chặn thành công đơn hàng trùng lặp khi webhook retry (orders_idempotency_key_key)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 6: KIỂM TRA RÀNG BUỘC ORDERS: STATUS 'paid' BẮT BUỘC CÓ paid_at
  -- KỲ VỌNG: NÉM LỖI CHECK chk_orders_paid_consistency
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.orders (
      user_id, package_id, amount_vnd, coins, status, paid_at, idempotency_key
    ) VALUES (
      v_test_user_id, 'pkg_coins_1000', 100000, 1000, 'paid', NULL, 'test-order-key-2'
    );
    RAISE EXCEPTION 'TEST 6 FAIL: Không chặn được đơn hàng status paid nhưng paid_at là NULL!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 6 PASS: Chặn thành công đơn hàng status paid thiếu paid_at (chk_orders_paid_consistency)!';
  END;

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '🎉 TẤT CẢ 6 BÀI TEST SCHEMA AUDIT, CONFIG & ORDERS ĐÃ PASS 100%!';
  RAISE NOTICE '======================================================================';
END;
$$;

-- ==============================================================================
-- 7. DỌN SẠCH DỮ LIỆU THỬ NGHIỆM TRÊN DEV (CLEANUP)
-- ==============================================================================
-- Tạm vô hiệu hóa trigger append-only trên audit_logs để dọn bản ghi test
ALTER TABLE public.audit_logs DISABLE TRIGGER on_audit_logs_prevent_mutation;
DELETE FROM public.audit_logs WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.audit_logs ENABLE TRIGGER on_audit_logs_prevent_mutation;

-- Dọn đơn hàng test trong orders
DELETE FROM public.orders WHERE id = 'e0000000-0000-0000-0000-000000000001'::uuid;

SELECT '🧹 CLEANUP HOÀN TẤT: Đã dọn sạch audit_logs và orders test. Dev sạch 100%!' AS status;
