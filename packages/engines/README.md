# Game Engines Core (`packages/engines/`)

Thư mục chứa toàn bộ logic trò chơi cốt lõi (Game Engine) viết bằng **TypeScript thuần túy (Pure TS)**.

## 5 Quy Tắc Vàng (Bất Biến)

1. **Tuyệt đối KHÔNG DOM & Browser API**: Không dùng `window`, `document`, `localStorage`, `fetch`, `setTimeout`... (được kiểm soát tự động bởi `packages/engines/tsconfig.json` với `lib: ["ES2022"]`).
2. **Tuyệt đối KHÔNG Framework**: Không import `react`, `react-dom`, hoặc bất kỳ UI framework nào (được kiểm soát bởi ESLint `no-restricted-imports`).
3. **Tuyệt đối KHÔNG import ngược**: Không import từ `@/*`, `src/*`, hay relative path ra ngoài `packages/engines`.
4. **Deterministic 100%**: Cùng `(State, Move, RandomSeed)` đầu vào $\rightarrow$ BẮT BUỘC trả về cùng `(NextState, Result)` đầu ra.
5. **Độc lập 3 môi trường chạy**: Cùng một file `engine.ts` phải chạy mượt mà trên:
   - **Client UI** (React Component render bàn cờ)
   - **Web Worker** (AI Bot tính toán nước đi không nghẽn main thread)
   - **Supabase Edge Functions / Deno** (Trọng tài server xác thực nước đi và kết toán trận đấu)

---

## Lưu Ý Về Engine Dummy (`dummy/engine.ts`)

- Module `packages/engines/dummy/engine.ts` hiện tại là **khuôn tham chiếu kiểm chứng hạ tầng** (phục vụ Phase P0.2c chứng minh engine chạy được cả trên Node test lẫn Client React).
- Dummy engine **KHÔNG** phải game thật và sẽ được chuẩn hóa, thay thế bằng interface `Engine<S, M>` và `GameDefinition` chính thức tại **Phase P0.6**.
