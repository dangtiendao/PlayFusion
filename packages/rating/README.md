# Rating Module Core (`packages/rating/`)

Thư mục chứa toàn bộ logic tính toán điểm xếp hạng (Rating & Leaderboard) viết bằng **TypeScript thuần túy (Pure TS)**.

## 5 Quy Tắc Vàng (Bất Biến)

1. **Tuyệt đối KHÔNG DOM & Browser API**: Không dùng `window`, `document`, `localStorage`, `fetch`, `setTimeout`... (kiểm soát tự động bởi `packages/rating/tsconfig.json` với `lib: ["ES2022"]`).
2. **Tuyệt đối KHÔNG Framework**: Không import `react`, `react-dom`, hoặc bất kỳ UI framework nào (kiểm soát bởi ESLint `no-restricted-imports`).
3. **Tuyệt đối KHÔNG import ngược hoặc chéo**: Không import từ `@/*`, `src/*`, hay `packages/engines/*`. Hai package `engines` và `rating` độc lập tuyệt đối.
4. **Deterministic 100% & Không Side-Effect**: Cùng input luôn ra cùng output. Không đọc Database; toàn bộ cấu hình `system_config` được tiêm qua tham số hàm (sẵn sàng cho `settle_match` ở P4.2).
5. **Độc lập 3 môi trường chạy**: Cùng một file logic phải chạy mượt mà trên:
   - **Client UI** (Tính trước / hiển thị preview điểm nhận được sau trận).
   - **Supabase Edge Functions / Deno** (Trọng tài server `settle_match` kết toán rank chính thức).
   - **Test Runner** (Node.js Vitest và Deno CLI test).
