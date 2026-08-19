-- ==============================================================================
-- PLAYFUSION DATABASE MIGRATION: 0007_shop.sql
-- ==============================================================================
-- Mục tiêu: Tạo 4 bảng Cửa Hàng & Kho Đồ (shop_items, user_inventory,
--          user_equipped, purchases), cấu hình RLS bảo mật và seed vật phẩm mặc định.
--
-- Ghi chú kiến trúc:
-- 1. TRIẾT LÝ "SHOP KHÔNG BIẾT VẬT PHẨM LÀ GÌ":
--    - Mọi vật phẩm phân loại qua item_type, game_id (NULL = toàn hệ thống) và slot.
--    - Thêm game mới hoặc slot skin mới KHÔNG bao giờ phải sửa schema DB.
-- 2. DYNAMIC SLOT KEY:
--    - slot_key trong user_equipped là chuỗi tự do ('avatar', 'avatar_frame', 'title',
--      'game:{gameId}:{slotId}'). Slot theo game tự sinh từ manifest cosmeticSlots.
-- 3. POLICY GHI ĐẦU TIÊN MỞ CHO CLIENT (user_equipped):
--    - Thao tác mặc/đổi trang bị là hành vi UI tức thì, cho phép client gọi trực tiếp
--      qua Supabase Client mà không tốn Edge Function invocation.
--    - RLS WITH CHECK (EXISTS (SELECT 1 FROM user_inventory ...)) đảm bảo 100% người dùng
--      chỉ có thể mặc món đồ mà họ ĐÃ SỞ HỮU.
-- 4. PURCHASES LÀ SỔ CHỨNG TỪ (APPEND-ONLY, KHÔNG CASCADE):
--    - Lưu vết lịch sử mua sắm, liên kết với wallet_transactions. Trigger chặn UPDATE/DELETE
--      và không CASCADE khi xóa user để bảo toàn chứng từ kế toán.
--
-- Áp dụng: Chạy thủ công trên SQL Editor Supabase Dashboard (DEV; PROD gộp ở P2.3c).
-- ==============================================================================

-- 1. BẢNG PUBLIC.SHOP_ITEMS (Danh mục vật phẩm Cửa Hàng & Phần Thưởng)
CREATE TABLE IF NOT EXISTS public.shop_items (
  id text PRIMARY KEY,                                       -- 'avatar_default_1', 'frame_basic', 'caro_piece_flower'
  item_type text NOT NULL CHECK (item_type IN (
    'avatar', 'avatar_frame', 'profile_effect', 'chat_effect', 'victory_effect', 'game_skin', 'title'
  )),
  game_id text NULL REFERENCES public.games(id),             -- NULL = Toàn hệ thống
  slot text NULL,                                            -- 'piece_style', 'board_theme'...
  name text NOT NULL,
  description text NULL,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  price_coins bigint NULL CHECK (price_coins IS NULL OR price_coins > 0), -- NULL = Không bán (quà sự kiện/mùa)
  asset_key text NOT NULL,                                   -- Đường dẫn asset tĩnh trên Cloudflare Pages
  is_active boolean NOT NULL DEFAULT true,
  available_from timestamptz NULL,
  available_until timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,               -- Config màu sắc, hiệu ứng animation
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- CHECK NHẤT QUÁN: game_skin bắt buộc phải gắn với game_id và slot; loại khác thì không
  CONSTRAINT chk_shop_items_game_skin CHECK (
    (item_type = 'game_skin' AND game_id IS NOT NULL AND slot IS NOT NULL) OR
    (item_type <> 'game_skin' AND game_id IS NULL AND slot IS NULL)
  ),

  -- CHECK THỜI GIAN BÁN: available_from phải trước available_until
  CONSTRAINT chk_shop_items_availability CHECK (
    available_from IS NULL OR available_until IS NULL OR available_from < available_until
  )
);

DROP TRIGGER IF EXISTS on_shop_items_updated_at ON public.shop_items;
CREATE TRIGGER on_shop_items_updated_at
  BEFORE UPDATE ON public.shop_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 2. BẢNG PUBLIC.USER_INVENTORY (Kho đồ người chơi - Sở hữu vĩnh viễn)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_inventory (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES public.shop_items(id),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('purchase', 'season_reward', 'event', 'admin_grant', 'default')),

  -- KHÓA CHÍNH: Mỗi user chỉ sở hữu 1 bản ghi cho mỗi vật phẩm (tự chặn mua trùng ở DB)
  PRIMARY KEY (user_id, item_id)
);

-- ==============================================================================
-- 3. BẢNG PUBLIC.USER_EQUIPPED (Trang bị đang mặc trên người)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_equipped (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  slot_key text NOT NULL,                                    -- 'avatar', 'avatar_frame', 'title', 'game:caro:piece_style'
  item_id text NOT NULL REFERENCES public.shop_items(id),
  equipped_at timestamptz NOT NULL DEFAULT now(),

  -- KHÓA CHÍNH: Mỗi slot chỉ được trang bị duy nhất 1 vật phẩm tại một thời điểm
  PRIMARY KEY (user_id, slot_key)
);

-- ==============================================================================
-- 4. BẢNG PUBLIC.PURCHASES (Lịch sử giao dịch mua sắm - Sổ chứng từ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id), -- KHÔNG CASCADE: Sổ chứng từ tài chính
  item_id text NOT NULL REFERENCES public.shop_items(id),
  price_paid bigint NOT NULL CHECK (price_paid >= 0),        -- Giá tại thời điểm mua (bảo toàn lịch sử)
  wallet_txn_id uuid NULL REFERENCES public.wallet_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger Append-Only cho purchases: Cấm sửa hoặc xóa chứng từ mua hàng
CREATE OR REPLACE FUNCTION public.prevent_purchases_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Purchases ledger is append-only: UPDATE and DELETE operations are strictly prohibited on purchases.';
END;
$$;

DROP TRIGGER IF EXISTS on_purchases_prevent_mutation ON public.purchases;
CREATE TRIGGER on_purchases_prevent_mutation
  BEFORE UPDATE OR DELETE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_purchases_mutation();

-- ==============================================================================
-- 5. CÁC INDEX TỐI ƯU TRUY VẤN CỬA HÀNG & KHO ĐỒ
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_shop_items_type_active
  ON public.shop_items (item_type, is_active);

CREATE INDEX IF NOT EXISTS idx_shop_items_game_id
  ON public.shop_items (game_id)
  WHERE game_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_user_created
  ON public.purchases (user_id, created_at DESC);

-- ==============================================================================
-- 6. KÍCH HOẠT ROW LEVEL SECURITY (RLS) & CHÍNH SÁCH BẢO MẬT
-- ==============================================================================
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_equipped ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- 6.1. shop_items: Cho phép xem các vật phẩm đang active và trong khung giờ bán
DROP POLICY IF EXISTS "Active shop items are viewable by everyone" ON public.shop_items;
CREATE POLICY "Active shop items are viewable by everyone"
  ON public.shop_items FOR SELECT
  TO authenticated, anon
  USING (
    is_active = true
    AND (available_from IS NULL OR available_from <= now())
    AND (available_until IS NULL OR available_until >= now())
  );

-- 6.2. user_inventory: Chỉ chính chủ xem kho đồ; cấm ghi trực tiếp từ client
DROP POLICY IF EXISTS "Users can view their own inventory" ON public.user_inventory;
CREATE POLICY "Users can view their own inventory"
  ON public.user_inventory FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = user_id);

-- 6.3. user_equipped: MỞ QUYỀN GHI CHO CLIENT CÓ KIỂM TRA SỞ HỮU (WITH CHECK)
-- Xem trang bị: Công khai (phục vụ hiển thị avatar, khung trong game và leaderboard)
DROP POLICY IF EXISTS "Equipped items are viewable by everyone" ON public.user_equipped;
CREATE POLICY "Equipped items are viewable by everyone"
  ON public.user_equipped FOR SELECT
  TO authenticated, anon
  USING (true);

-- Mặc / Đổi / Tháo trang bị: Chỉ chính chủ VÀ bắt buộc ĐÃ SỞ HỮU trong user_inventory
DROP POLICY IF EXISTS "Users can insert their own equipped items" ON public.user_equipped;
CREATE POLICY "Users can insert their own equipped items"
  ON public.user_equipped FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.user_inventory ui
      WHERE ui.user_id = auth.uid()
        AND ui.item_id = user_equipped.item_id
    )
  );

DROP POLICY IF EXISTS "Users can update their own equipped items" ON public.user_equipped;
CREATE POLICY "Users can update their own equipped items"
  ON public.user_equipped FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.user_inventory ui
      WHERE ui.user_id = auth.uid()
        AND ui.item_id = user_equipped.item_id
    )
  );

DROP POLICY IF EXISTS "Users can delete their own equipped items" ON public.user_equipped;
CREATE POLICY "Users can delete their own equipped items"
  ON public.user_equipped FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6.4. purchases: Chỉ chính chủ xem lịch sử mua hàng; cấm ghi trực tiếp từ client
DROP POLICY IF EXISTS "Users can view their own purchases" ON public.purchases;
CREATE POLICY "Users can view their own purchases"
  ON public.purchases FOR SELECT
  TO authenticated, anon
  USING (auth.uid() = user_id);

-- ==============================================================================
-- 7. SEED VẬT PHẨM MẶC ĐỊNH & TRIGGER PROFILE MỚI
-- ==============================================================================
INSERT INTO public.shop_items (
  id, item_type, game_id, slot, name, description, rarity, price_coins, asset_key, is_active
) VALUES
  ('avatar_default_1', 'avatar', NULL, NULL, 'Avatar Cơ Bản 1', 'Avatar mặc định cho người chơi mới', 'common', NULL, '/avatars/default_1.webp', true),
  ('avatar_default_2', 'avatar', NULL, NULL, 'Avatar Cơ Bản 2', 'Avatar phong cách cổ điển', 'common', NULL, '/avatars/default_2.webp', true),
  ('frame_basic', 'avatar_frame', NULL, NULL, 'Khung Cơ Bản', 'Khung viền gỗ tinh tế', 'common', 500, '/frames/basic.webp', true)
ON CONFLICT (id) DO NOTHING;

-- Mở rộng trigger khởi tạo Profile: Tự động cấp avatar mặc định & equip sẵn
CREATE OR REPLACE FUNCTION public.handle_new_profile_starter_cosmetics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cấp phát avatar mặc định vào inventory
  INSERT INTO public.user_inventory (user_id, item_id, source)
  VALUES (NEW.user_id, 'avatar_default_1', 'default')
  ON CONFLICT (user_id, item_id) DO NOTHING;

  -- Tự động mặc avatar vào slot 'avatar'
  INSERT INTO public.user_equipped (user_id, slot_key, item_id)
  VALUES (NEW.user_id, 'avatar', 'avatar_default_1')
  ON CONFLICT (user_id, slot_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_grant_starter_cosmetics ON public.profiles;
CREATE TRIGGER on_profile_created_grant_starter_cosmetics
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_starter_cosmetics();

-- Backfill cho tất cả profiles hiện có
INSERT INTO public.user_inventory (user_id, item_id, source)
SELECT user_id, 'avatar_default_1', 'default'
FROM public.profiles
ON CONFLICT (user_id, item_id) DO NOTHING;

INSERT INTO public.user_equipped (user_id, slot_key, item_id)
SELECT user_id, 'avatar', 'avatar_default_1'
FROM public.profiles
ON CONFLICT (user_id, slot_key) DO NOTHING;
