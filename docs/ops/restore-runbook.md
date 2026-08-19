# RUNBOOK DIỄN TẬP KHÔI PHỤC & PHỤC HỒI THẢM HỌA (DISASTER RECOVERY RUNBOOK)

- **Dự án**: Web Game Hub (PlayFusion)
- **Mã tài liệu**: `OPS-P2.7-RESTORE-01`
- **Phiên bản**: `1.0.0` | **Ngày ban hành**: `19/08/2026`
- **Áp dụng cho**: Môi trường Dev & Production (Supabase PostgreSQL)

---

## PHẦN 1: KỊCH BẢN DIỄN TẬP RESTORE CỤC BỘ (LOCAL DOCKER DRY-RUN)

> [!NOTE] > **Mục đích**: Diễn tập khôi phục bản sao lưu mã hóa `.dump.enc` vào một PostgreSQL container độc lập trên máy local để kiểm tra tính toàn vẹn của dữ liệu và bảng đối chiếu mà không gây ảnh hưởng tới database đang chạy.

### 1. Chuẩn Bị Môi Trường Cục Bộ

#### Bước 1.1: Xác định phiên bản PostgreSQL của Supabase

Mở **Supabase Dashboard $\rightarrow$ SQL Editor** và chạy câu lệnh:

```sql
SELECT version();
```

_(Kết quả thông thường: `PostgreSQL 15.x` hoặc `PostgreSQL 16.x`)_.

#### Bước 1.2: Khởi chạy PostgreSQL Container trên Docker

Mở terminal trên máy local và chạy lệnh tạo container Postgres tạm thời (ví dụ bản Postgres 15):

```bash
# Khởi động PostgreSQL 15 container tạm thời
docker run --name playfusion-restore-test \
  -e POSTGRES_PASSWORD=restore_secret_pass \
  -p 5439:5432 \
  -d postgres:15-alpine

# Chờ 3 giây và kiểm tra container đang chạy:
docker ps --filter "name=playfusion-restore-test"
```

---

### 2. Tải & Giải Mã Bản Sao Lưu

#### Bước 2.1: Tải file `.dump.enc` mới nhất

Tải file backup mã hóa từ repository `webgamehub-backups` (thư mục `prod/`), ví dụ: `webgamehub-prod-20260819-2000.dump.enc`.

#### Bước 2.2: Giải mã bằng script dự án

```bash
# Cấp quyền thực thi và giải mã
chmod +x scripts/decrypt-backup.sh

# Chạy giải mã (nhập Passphrase khi được nhắc):
./scripts/decrypt-backup.sh webgamehub-prod-20260819-2000.dump.enc

# File đầu ra được tạo: webgamehub-prod-20260819-2000.dump
```

---

### 3. Thực Hiện `pg_restore` Vào Container

#### Bước 3.1: Tạo Database Trống và Phân Quyền Mock

```bash
# Tạo database trống tên 'playfusion_recovery'
docker exec -i playfusion-restore-test createdb -U postgres playfusion_recovery

# Tạo sẵn các role đặc thù của Supabase để tránh warning phân quyền:
docker exec -i playfusion-restore-test psql -U postgres -d playfusion_recovery -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END
  \$\$;
"
```

#### Bước 3.2: Khôi phục Dữ liệu bằng `pg_restore`

```bash
# Copy file .dump vào container và khôi phục
docker cp webgamehub-prod-20260819-2000.dump playfusion-restore-test:/tmp/restore.dump

docker exec -i playfusion-restore-test pg_restore \
  -U postgres \
  -d playfusion_recovery \
  --no-owner \
  --no-privileges \
  /tmp/restore.dump
```

> [!TIP] > **Các thông báo Warning CHẤP NHẬN ĐƯỢC**:
>
> - `warning: errors ignored on restore: ...` liên quan đến extension `uuid-ossp` hoặc `pgcrypto` đã có sẵn trong container.
> - Bất kỳ warning nào về `GRANT/REVOKE` do sử dụng cờ `--no-privileges`.
>
> ❌ **Lỗi THẬT (Blocker)**: Báo lỗi cú pháp SQL table hoặc thiếu cột dữ liệu/vi phạm NOT NULL.

---

### 4. BẢNG ĐỐI CHIẾU SỐ LIỆU BẮT BUỘC (VERIFICATION CHECKLIST)

Chạy các câu lệnh SQL dưới đây trên **CẢ 2 PHÍA**:

1. **Phía Container Local**: `docker exec -i playfusion-restore-test psql -U postgres -d playfusion_recovery -c "<SQL>"`
2. **Phía Supabase Prod**: Supabase SQL Editor.

#### A. Đếm Tổng Số Bảng trong schema `public` (Kỳ vọng: 15 bảng)

```sql
SELECT count(*) AS total_public_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

#### B. Thống Kê Số Lượng Bản Ghi Từng Bảng (15 Bảng)

```sql
SELECT
  'games' AS table_name, count(*) AS row_count FROM public.games UNION ALL
SELECT 'seasons', count(*) FROM public.seasons UNION ALL
SELECT 'matches', count(*) FROM public.matches UNION ALL
SELECT 'match_participants', count(*) FROM public.match_participants UNION ALL
SELECT 'player_ratings', count(*) FROM public.player_ratings UNION ALL
SELECT 'rating_history', count(*) FROM public.rating_history UNION ALL
SELECT 'profiles', count(*) FROM public.profiles UNION ALL
SELECT 'wallets', count(*) FROM public.wallets UNION ALL
SELECT 'transactions', count(*) FROM public.transactions UNION ALL
SELECT 'shop_items', count(*) FROM public.shop_items UNION ALL
SELECT 'inventory', count(*) FROM public.inventory UNION ALL
SELECT 'game_assets', count(*) FROM public.game_assets UNION ALL
SELECT 'system_config', count(*) FROM public.system_config UNION ALL
SELECT 'security_audit_log', count(*) FROM public.security_audit_log UNION ALL
SELECT 'audit_logs', count(*) FROM public.audit_logs;
```

#### C. Đếm Số Lượng RLS Policies

```sql
SELECT count(*) AS total_rls_policies
FROM pg_policies
WHERE schemaname = 'public';
```

#### D. Đếm Số Lượng Trigger Do Ứng Dụng Tự Tạo

```sql
SELECT count(*) AS total_app_triggers
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

#### E. Đếm Số Lượng Custom Functions trong schema `public`

```sql
SELECT count(*) AS total_functions
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
```

---

### 5. SMOKE TEST DỮ LIỆU NGHIỆP VỤ (3 QUERIES)

Thực thi 3 câu lệnh sau trong container để chứng minh tính toàn vẹn nghiệp vụ:

#### Query 1: Lấy 1 trận đấu gần nhất kèm thông tin người tham gia

```sql
SELECT m.id, m.game_id, m.mode, m.created_at, mp.seat_index, mp.user_id, mp.result
FROM public.matches m
JOIN public.match_participants mp ON m.id = mp.match_id
ORDER BY m.created_at DESC
LIMIT 2;
```

#### Query 2: Đối chiếu toàn vẹn số dư ví (Wallet Audit Integrity)

```sql
-- Lấy 1 ví bất kỳ và chạy hàm audit số dư
SELECT id, user_id, balance, audit_wallet_balance(id) AS audit_check
FROM public.wallets
LIMIT 1;
-- Kết quả audit_check = true khẳng định số dư khớp 100% với lịch sử giao dịch.
```

#### Query 3: Kiểm tra cấu hình hệ thống đủ 11 keys

```sql
SELECT count(*) AS config_keys_count FROM public.system_config;
-- Kết quả kỳ vọng: 11 keys cấu hình.
```

---

### 6. Dọn Dẹp Môi Trường Sau Khi Diễn Tập

```bash
# Xóa container test
docker stop playfusion-restore-test && docker rm playfusion-restore-test

# XÓA FILE THÔ ĐÃ GIẢI MÃ ĐỂ BẢO VỆ AN TOÀN DỮ LIỆU
rm -f webgamehub-prod-20260819-2000.dump
```

---

### 7. BIÊN BẢN DIỄN TẬP RESTORE (MẪU NGHIỆM THU)

| Mục kiểm tra                    | Giá trị Supabase Prod | Giá trị Container Restore | Đánh giá | Ghi chú                |
| :------------------------------ | :-------------------: | :-----------------------: | :------: | :--------------------- |
| **Tổng số bảng (Public)**       |         `15`          |           `15`            | ✅ KHỚP  | Đủ 15 bảng P2.2 & P2.3 |
| **Bảng `games`**                |          `1`          |            `1`            | ✅ KHỚP  | Caro Game              |
| **Bảng `system_config`**        |         `11`          |           `11`            | ✅ KHỚP  | Đủ 11 keys hệ thống    |
| **Bảng `wallets` & `profiles`** |    _Khớp số user_     |      _Khớp số user_       | ✅ KHỚP  | Dữ liệu người chơi     |
| **Số lượng RLS Policies**       |      _Ví dụ: 28_      |           _28_            | ✅ KHỚP  | Toàn bộ Policy bảo tồn |
| **Số lượng Triggers**           |      _Ví dụ: 12_      |           _12_            | ✅ KHỚP  | Triggers tự động hóa   |
| **Smoke Test Audit Wallet**     |        `true`         |          `true`           | ✅ KHỚP  | Sổ cái giao dịch chuẩn |

- **Ngày thực hiện diễn tập**: `19/08/2026`
- **File sao lưu sử dụng**: `webgamehub-prod-20260819-2000.dump.enc`
- **Người thực hiện**: Technical Lead / DevOps
- **Kết luận**: ✅ **DIỄN TẬP THÀNH CÔNG (PASSED)**.

---

## PHẦN 2: RUNBOOK PHỤC HỒI THẢM HỌA (DISASTER RECOVERY KHI PROD MẤT SẠCH)

Kịch bản: _Toàn bộ project Supabase Production bị xóa hoặc hỏng không thể cứu vãn._

### Quy Trình 5 Bước Phục Hồi:

```mermaid
flowchart TD
    A[1. Tạo Project Supabase Mới] --> B[2. Chạy Migrations 0001->0011 Tạo Schema Chuẩn]
    B --> C[3. Restore Data-Only từ Backup Nén]
    C --> D[4. Cập nhật Biến Môi Trường App & Cloudflare]
    D --> E[5. Thông Báo Người Dùng Đăng Nhập Lại Google]
```

#### Bước 1: Tạo Project Supabase Production Mới

1. Truy cập Supabase Dashboard $\rightarrow$ **New project** $\rightarrow$ Tên `webgamehub-prod`.
2. Chọn Region `Singapore (ap-southeast-1)`.
3. Đặt Database Password mạnh và lưu vào Password Manager.

#### Bước 2: Chạy Toàn Bộ Migrations từ Code Repo

Mở SQL Editor trên Project mới (hoặc dùng Supabase CLI), chạy tuần tự toàn bộ 11 file migrations trong thư mục `supabase/migrations/`:

- `0001_core_schema.sql` $\rightarrow$ `0011_stats_and_profile.sql`.
- _Lý do_: Chạy migration đảm bảo 100% schema, RLS, functions, constraints và triggers được tái tạo chuẩn chỉnh theo phiên bản mã nguồn mới nhất.

#### Bước 3: Khôi phục Dữ Liệu DATA-ONLY từ Bản Backup

Lấy connection string Session Pooler của project mới và thực hiện lệnh:

```bash
# Tải và giải mã bản backup mới nhất ra file prod.dump
./scripts/decrypt-backup.sh latest-backup.dump.enc prod.dump

# Chạy pg_restore ở chế độ DATA-ONLY và tạm tắt triggers:
pg_restore \
  -d "postgresql://postgres.[NEW-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  --data-only \
  --disable-triggers \
  --schema=public \
  prod.dump

# Xóa ngay file dump sau khi hoàn tất
rm -f prod.dump
```

#### Bước 4: Cập Nhật Cấu Hình Biến Môi Trường

1. **Cloudflare Pages**: Cập nhật Environment Variables `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trỏ sang project mới.
2. **GitHub Secrets**: Cập nhật `KEEPALIVE_SUPABASE_URL_PROD`, `KEEPALIVE_SERVICE_ROLE_PROD`, `BACKUP_DB_URL_PROD`.

#### Bước 5: Xử Lý Giới Hạn Tài Khoản `auth.users`

> [!IMPORTANT] > **Hạn chế kỹ thuật & Cách khắc phục**:
>
> - Bản backup `pg_dump` không chứa schema `auth.users` do giới hạn phân quyền Managed Supabase.
> - **Dữ liệu người chơi**: Các bảng `profiles`, `wallets`, `inventory`, `player_ratings` **VẪN ĐƯỢC BẢO TOÀN NGUYÊN VẸN** theo `userId` (UUID).
> - **Hành động người chơi**: Người dùng chỉ cần bấm **"Đăng Nhập Với Google"** với đúng tài khoản Google cũ. Hệ thống Supabase Auth sẽ cấp lại session và tự động liên kết hoàn hảo với hồ sơ `profiles` và `wallets` cũ theo ID.
