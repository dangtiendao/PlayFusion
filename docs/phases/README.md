# Quy trình Quản lý & Nghiệm thu Phase (`docs/phases/`)

Thư mục chứa các báo cáo nghiệm thu và nhật ký kỹ thuật cho từng phase thi công của dự án **Web Game Hub**.

---

## 1. Quy trình 3 Prompt Tiêu Chuẩn

Mỗi phase phát triển trong dự án tuân thủ nghiêm ngặt quy trình 3 prompt:

### Prompt 1: Kế hoạch & Thi công (Implementation)

- **Đầu vào**: Đặc tả phase, mục tiêu, đầu vào có sẵn, deliverables, tiêu chí DoD, và danh sách ngoài phạm vi (out of scope).
- **Thực hiện**:
  1. Kỹ sư phân tích yêu cầu, đối chiếu các ràng buộc kiến trúc bất biến (Stack, Plugin Isolation, Free-tier guards).
  2. Lập danh sách các file sẽ tạo / sửa kèm lý do kỹ thuật.
  3. Lập danh sách lệnh terminal theo đúng thứ tự.
  4. Viết code hoàn chỉnh, không có `// TODO` trong phạm vi phase.

### Prompt 2: Kiểm thử & Nghiệm thu (Review & Verification)

- **Thực hiện**:
  1. Chạy toàn bộ các lệnh kiểm thử độc lập: `typecheck`, `lint`, `format:check`, `test`, `coverage`, và `build`.
  2. Kiểm tra trực tiếp trên giao diện trình duyệt hoặc DevTools (đối với UI/mobile viewport).
  3. Đối chiếu từng hạng mục trong **Definition of Done (DoD)** và lập bảng đối chiếu kết quả.
  4. Chụp lại log thực thi hoặc output terminal làm bằng chứng.

### Prompt 3: Tổng kết & Cập nhật Tài liệu (Finalization)

- **Thực hiện**:
  1. Đóng gói kết quả nghiệm thu thành file tài liệu trong `docs/phases/`.
  2. Ghi nhận các quyết định kỹ thuật quan trọng và lưu ý cho phase tiếp theo.
  3. Xác nhận sẵn sàng bước vào phase kế tiếp.

---

## 2. Quy ước đặt tên file tài liệu Phase

Các file nghiệm thu trong thư mục này được đặt tên theo quy tắc chuẩn:

```
P<Mã_Phase>-<ten-khong-dau-ngan-gon>.md
```

### Ví dụ:

- `P0.1a-khoi-tao-vite-react-ts.md`
- `P0.1b-cai-dat-tailwind-css.md`
- `P0.1c-eslint-prettier-rule-kien-truc.md`
- `P0.1d-vitest-cau-truc-thu-muc.md`
- `P0.2-co-so-du-lieu-supabase.md`
- `P0.6-engine-interfaces.md`
- `P1.1-game-caro.md`
