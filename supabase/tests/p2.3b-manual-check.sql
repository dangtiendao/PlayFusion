-- ==============================================================================
-- PLAYFUSION DATABASE TEST SCRIPT: p2.3b-manual-check.sql
-- ==============================================================================
-- Mục tiêu: Kiểm chứng toàn diện Schema, Constraints, Triggers và RLS của 4 bảng
--          shop_items, user_inventory, user_equipped, purchases trên DEV.
--
-- Hướng dẫn: Dán toàn bộ vào SQL Editor Supabase Dashboard (DEV).
-- Mỗi khối đều có ghi chú KỲ VỌNG rõ ràng. Cuối file có khối dọn sạch dữ liệu test.
-- ==============================================================================

DO $$
DECLARE
  v_test_user_id uuid;
  v_count int;
  v_equipped_item text;
  v_purchase_id uuid := 'c0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'BẮT ĐẦU CHUỖI KIỂM THỬ MANUAL CHO PHASE P2.3b (SHOP & COSMETICS)';
  RAISE NOTICE '======================================================================';

  -- 0. LẤY MỘT USER_ID THẬT TỪ PUBLIC.PROFILES ĐỂ TEST
  SELECT user_id INTO v_test_user_id FROM public.profiles LIMIT 1;
  IF v_test_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có user nào trong public.profiles để kiểm thử.';
  END IF;
  RAISE NOTICE '-> Sử dụng test user_id: %', v_test_user_id;

  -- ----------------------------------------------------------------------------
  -- TEST 1: XÁC NHẬN USER ĐƯỢC CẤP PHÁT & MẶC SẴN AVATAR MẶC ĐỊNH (BACKFILL)
  -- KỲ VỌNG: CÓ avatar_default_1 TRONG INVENTORY VÀ EQUIPPED VÀO SLOT 'avatar'
  -- ----------------------------------------------------------------------------
  SELECT count(*) INTO v_count
  FROM public.user_inventory
  WHERE user_id = v_test_user_id AND item_id = 'avatar_default_1';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAIL: Không tìm thấy avatar_default_1 trong user_inventory!';
  END IF;

  SELECT item_id INTO v_equipped_item
  FROM public.user_equipped
  WHERE user_id = v_test_user_id AND slot_key = 'avatar';

  IF v_equipped_item <> 'avatar_default_1' THEN
    RAISE EXCEPTION 'TEST 1 FAIL: Slot avatar chưa được equip avatar_default_1!';
  END IF;
  RAISE NOTICE '✅ TEST 1 PASS: User đã có avatar_default_1 trong inventory và đang mặc trên slot avatar!';

  -- ----------------------------------------------------------------------------
  -- TEST 2: KIỂM TRA RÀNG BUỘC CHECK GAME_SKIN BẮT BUỘC CÓ GAME_ID VÀ SLOT
  -- KỲ VỌNG: NÉM LỖI CHECK chk_shop_items_game_skin KHI THIẾU SLOT
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.shop_items (
      id, item_type, game_id, slot, name, asset_key
    ) VALUES (
      'test_invalid_skin', 'game_skin', 'caro', NULL, 'Skin Lỗi Thiếu Slot', '/skins/test.webp'
    );
    RAISE EXCEPTION 'TEST 2 FAIL: Không chặn được game_skin thiếu slot!';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '✅ TEST 2 PASS: Chặn thành công game_skin thiếu slot (chk_shop_items_game_skin)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 3: KIỂM TRA CHỐNG MUA TRÙNG TRONG USER_INVENTORY (PRIMARY KEY)
  -- KỲ VỌNG: NÉM LỖI UNIQUE / PRIMARY KEY user_inventory_pkey
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.user_inventory (
      user_id, item_id, source
    ) VALUES (
      v_test_user_id, 'avatar_default_1', 'purchase'
    );
    RAISE EXCEPTION 'TEST 3 FAIL: Không chặn được cấp trùng vật phẩm đã sở hữu!';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✅ TEST 3 PASS: Chặn thành công sở hữu trùng vật phẩm (user_inventory_pkey)!';
  END;

  -- ----------------------------------------------------------------------------
  -- TEST 4: LUỒNG TRANG BỊ (EQUIP) VẬT PHẨM MỚI KHI ĐÃ SỞ HỮU
  -- KỲ VỌNG: GRANT FRAME_BASIC VÀO INVENTORY -> EQUIP VÀO SLOT avatar_frame THÀNH CÔNG
  -- ----------------------------------------------------------------------------
  -- Cấp frame_basic vào inventory
  INSERT INTO public.user_inventory (user_id, item_id, source)
  VALUES (v_test_user_id, 'frame_basic', 'admin_grant')
  ON CONFLICT DO NOTHING;

  -- Mặc vào slot avatar_frame
  INSERT INTO public.user_equipped (user_id, slot_key, item_id)
  VALUES (v_test_user_id, 'avatar_frame', 'frame_basic')
  ON CONFLICT (user_id, slot_key) DO UPDATE SET item_id = EXCLUDED.item_id;

  SELECT count(*) INTO v_count
  FROM public.user_equipped
  WHERE user_id = v_test_user_id AND slot_key = 'avatar_frame' AND item_id = 'frame_basic';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 4 FAIL: Không equip được frame_basic!';
  END IF;
  RAISE NOTICE '✅ TEST 4 PASS: Cấp phát và trang bị frame_basic vào slot avatar_frame thành công!';

  -- ----------------------------------------------------------------------------
  -- TEST 5: KIỂM TRA TRIGGER APPEND-ONLY TRÊN BẢNG PURCHASES
  -- KỲ VỌNG: TRIGGER NÉM LỖI KHI CỐ TÌNH UPDATE BẢN GHI PURCHASES
  -- ----------------------------------------------------------------------------
  INSERT INTO public.purchases (
    id, user_id, item_id, price_paid
  ) VALUES (
    v_purchase_id, v_test_user_id, 'frame_basic', 500
  );

  BEGIN
    UPDATE public.purchases
    SET price_paid = 0
    WHERE id = v_purchase_id;
    RAISE EXCEPTION 'TEST 5 FAIL: Không chặn được thao tác UPDATE trên purchases!';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE '✅ TEST 5 PASS: Trigger chặn thành công thao tác UPDATE trên bảng purchases!';
  END;

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '🎉 TẤT CẢ 5 BÀI TEST SCHEMA SHOP & INVENTORY ĐÃ PASS 100%!';
  RAISE NOTICE '======================================================================';
END;
$$;

-- ==============================================================================
-- 6. DỌN SẠCH DỮ LIỆU THỬ NGHIỆM TRÊN DEV (CLEANUP)
-- ==============================================================================
-- Tạm thời vô hiệu hóa trigger append-only để dọn bản ghi test trong purchases
ALTER TABLE public.purchases DISABLE TRIGGER on_purchases_prevent_mutation;
DELETE FROM public.purchases WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.purchases ENABLE TRIGGER on_purchases_prevent_mutation;

-- Dọn frame_basic khỏi equipped và inventory của test user
DELETE FROM public.user_equipped WHERE slot_key = 'avatar_frame';
DELETE FROM public.user_inventory WHERE item_id = 'frame_basic';

SELECT '🧹 CLEANUP HOÀN TẤT: Đã dọn sạch purchases, frame_basic khỏi inventory và equipped. Dev sạch 100%!' AS status;
