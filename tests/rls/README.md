# BỘ TEST TỰ ĐỘNG KIỂM TRA ROW LEVEL SECURITY (RLS TEST SUITE)

Tài liệu hướng dẫn vận hành bộ kiểm thử tự động phân quyền cơ sở dữ liệu cho dự án Web Game Hub (PlayFusion).

---

## 1. MỤC TIÊU & NGUYÊN TẮC HOẠT ĐỘNG

- **Mục tiêu**: Biến toàn bộ các ô trong ma trận phân quyền [`docs/security/rls-matrix.md`](../../docs/security/rls-matrix.md) thành bằng chứng máy tự động chạy qua mạng trực tiếp trên môi trường **DEV**.
- **Nguyên tắc tách biệt**:
  - `npm run test` (CI Offline): Chạy 44 unit test files nội bộ không cần mạng.
  - `npm run test:rls` (DEV Live): Chạy trực tiếp 6 file test RLS kết nối tới Supabase DEV.

---

## 2. HƯỚNG DẪN CẤU HÌNH VÀ CHẠY TEST

> [!CAUTION] > **CẢNH BÁO BẢO MẬT & DỮ LIỆU**:
>
> - TUYỆT ĐỐI KHÔNG điền key của môi trường **PRODUCTION**.
> - Test suite sẽ tự động khởi tạo user test và dọn dẹp sau khi hoàn tất.

### Bước 1: Tạo file cấu hình `.env.rls.local`

Sao chép `.env.rls.example` thành `.env.rls.local` tại thư mục gốc:

```bash
VITE_DEV_SUPABASE_URL=https://<your-dev-project>.supabase.co
VITE_DEV_SUPABASE_ANON_KEY=<your-dev-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-dev-service-role-key>
```

### Bước 2: Chạy test

```bash
npm run test:rls
```

---

## 3. CÁCH DỌN DẸP DỮ LIỆU NẾU TEST BỊ NGẮT ĐỘT NGỘT (MANUAL CLEANUP)

Nếu test suite bị ngắt đột ngột (ví dụ mất điện, crash mạng) khiến khối `afterAll()` chưa kịp chạy:

Mở **SQL Editor** trên Supabase Dashboard (DEV) và chạy lệnh dọn sạch:

```sql
-- Dọn các user test và dữ liệu liên quan
DELETE FROM auth.users WHERE email LIKE 'rls-test-%';

-- Dọn các item test nếu có
DELETE FROM public.shop_items WHERE id LIKE 'rls_test_%';
DELETE FROM public.system_config WHERE key LIKE 'rls.test.%';
```
