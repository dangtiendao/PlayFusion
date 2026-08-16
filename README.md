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

- [`public/_redirects`](public/_redirects): Khai báo fallback rule `/* /index.html 200` đảm bảo không bị lỗi 404 khi hard-refresh trên các route con của SPA.
- [`public/_headers`](public/_headers): Cấu hình cache `immutable` 1 năm cho assets có hash (`/assets/*`), chống cache cho `/index.html` để cập nhật phiên bản mới tức thì, và các security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`).
