# Web Game Hub (PlayFusion)

[![CI Quality Gate](https://github.com/dangtiendao/PlayFusion/actions/workflows/ci.yml/badge.svg)](https://github.com/dangtiendao/PlayFusion/actions/workflows/ci.yml)

Nền tảng Web Game Hub chơi game online & offline xây dựng trên React + Vite + TypeScript.

## Yêu cầu môi trường

- **Node.js**: `>= 20.0.0` (Khóa phiên bản Node 20 LTS theo `.nvmrc`)
- **npm**: `>= 9.0.0`

---

## Hướng dẫn cài đặt & Chạy cục bộ

### 1. Cài đặt dependencies

```bash
npm install
# hoặc cài đặt sạch như trên CI:
npm ci
```

### 2. Chạy môi trường phát triển (Dev)

```bash
npm run dev
```

### 3. Kiểm tra chất lượng & Kiến trúc

```bash
# Kiểm tra TypeScript typecheck toàn bộ monorepo (1 lệnh duy nhất)
npm run typecheck

# Kiểm tra quy tắc linting & hàng rào import thuần
npm run lint

# Kiểm tra chuẩn hóa định dạng code
npm run format:check

# Kiểm tra phân tầng kiến trúc một chiều & cấm circular dependency
npm run check:deps

# Chạy toàn bộ Unit Tests trong môi trường Node
npm run test
```

### 4. Build sản phẩm (Production build)

```bash
npm run build
npm run preview
```

---

## CI & 6 Cổng Kiểm Soát Chất Lượng (Quality Gates)

Mỗi lần `push` hoặc tạo `Pull Request` lên GitHub, workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) sẽ tự động kích hoạt runner Ubuntu để kiểm tra tuần tự qua **6 cổng chất lượng**:

1. **Cổng 1 (Linting)**: `npm run lint` — ESLint 9 Flat Config + Chặn `packages/engines` import React/UI.
2. **Cổng 2 (Format)**: `npm run format:check` — Prettier kiểm tra tính nhất quán định dạng code.
3. **Cổng 3 (Typecheck)**: `npm run typecheck` — `tsc -b` cô lập `lib: ["ES2022"]` không DOM cho engine.
4. **Cổng 4 (Architecture)**: `npm run check:deps` — `dependency-cruiser` cấm circular và cấm phụ thuộc ngược tầng.
5. **Cổng 5 (Unit Tests)**: `npm run test` — Vitest thực thi toàn bộ test cases pure engine trong Node.
6. **Cổng 6 (Production Build)**: `npm run build` — Đảm bảo Vite compile bundle thành công và upload artifact `dist/`.

### Cách theo dõi kết quả CI trên GitHub

- Mở tab **Actions** trên GitHub repository $\rightarrow$ Chọn workflow run tương ứng.
- Nếu có bất kỳ bước nào báo ❌ Đỏ, nhấp vào bước đó để xem log chi tiết lỗi và sửa tại local trước khi commit lại.

---

## Triển khai Cloudflare Pages

Ứng dụng Frontend được lưu trữ và triển khai tự động qua **Cloudflare Pages** (Free-tier, không giới hạn bandwidth):

### 1. Cơ chế Auto Deploy

- Cloudflare Pages kết nối trực tiếp với GitHub repo và tự động kích hoạt build mỗi khi có commit mới trên nhánh chính (`master` / `main`).
- **Preview Deployments**: Mọi nhánh tính năng (feature branches) hoặc Pull Request đều được Cloudflare tự động cấp một URL Preview độc lập dạng `https://<branch-name>.<project-name>.pages.dev` để kiểm thử trước khi merge.
- Quá trình deploy của Cloudflare Pages diễn ra **hoàn toàn độc lập** với GitHub Actions workflow CI (CI chịu trách nhiệm quality gate, Cloudflare Pages chịu trách nhiệm hosting).

### 2. Cấu hình định tuyến & Caching

- **SPA Fallback Routing**: Cloudflare Pages tự động hỗ trợ cơ chế Single Page Application (SPA) nguyên bản — mọi request không trùng với static file trong `dist/` sẽ tự động được phục vụ `index.html` với mã HTTP 200.
- [`public/_headers`](public/_headers): Cấu hình cache `immutable` 1 năm cho assets có hash (`/assets/*`), chống cache cho `/index.html` để cập nhật phiên bản mới tức thì, và các security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`).

---

## Backend Supabase & Biến môi trường

Dự án sử dụng **Supabase** (PostgreSQL, Auth, Realtime, Edge Functions) làm Backend-as-a-Service:

### 1. Mô hình 2 Project độc lập (Dev / Prod)

- **`webgamehub-dev`**: Phục vụ phát triển cục bộ (`localhost`) và các bản Preview branch trên Cloudflare Pages.
- **`webgamehub-prod`**: Phục vụ môi trường chạy thật cho người dùng cuối (Production).
- _Region khuyến nghị_: `Singapore (ap-southeast-1)` để đạt độ trễ mạng thấp nhất cho người dùng Việt Nam (~20-40ms).

### 2. Cấu hình chạy cục bộ (Local Development)

1. Sao chép file mẫu biến môi trường:
   ```bash
   cp .env.example .env.local
   ```
2. Mở file `.env.local` và điền URL cùng anon key từ Supabase Dashboard (`webgamehub-dev` -> **Project Settings** -> **API**):
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. Khởi động môi trường phát triển:
   ```bash
   npm run dev
   ```

### 3. Nguyên tắc bảo mật cốt lõi

- **`anon` / `public` key**: Khóa công khai an toàn để nhúng vào frontend client nhờ cơ chế phân quyền cấp hàng **Row Level Security (RLS)** trên database.
- **`service_role` key**: Khóa đặc quyền tối cao bỏ qua RLS. **TUYỆT ĐỐI KHÔNG BAO GIỜ** nhúng vào frontend hay commit lên Git repository.
- **Quy tắc cổng thoát hiểm (`src/repositories/`)**: Mọi tương tác với Supabase client bắt buộc phải bọc qua tầng Repository (`src/repositories/`). Tuyệt đối cấm các tầng UI/Store/Engine import trực tiếp `@supabase/supabase-js` (được kiểm soát tự động bởi `npm run check:deps`).
