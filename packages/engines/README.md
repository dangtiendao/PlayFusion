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

## CHECKLIST VIẾT ENGINE MỚI (BẮT BUỘC TUÂN THỦ)

Khi triển khai một trò chơi mới từ Phase P1.x (ví dụ: Caro, Cờ Tướng, Cờ Vua):

1. **Implement Interface `Engine<S, M>`**: Export đối tượng engine tuân thủ 100% interface `Engine<S, M>` từ `@engines/types`.
2. **State & Move chuẩn mực**:
   - `State` và `Move` phải là Plain Object / JSON-serializable (không dùng Map, Set, Class instance có methods).
   - Hàm `applyMove` phải là Pure Function, trả về state mới (Immutable), tuyệt đối không mutate state cũ.
3. **Xử lý lỗi với `EngineError`**:
   - Throw `new EngineError('WRONG_TURN', message)` khi người chơi đi sai lượt.
   - Throw `new EngineError('ILLEGAL_MOVE', message)` khi nước đi phạm luật cờ.
   - Throw `new EngineError('GAME_OVER', message)` khi cố gắng đi sau khi ván đã kết thúc.
   - Throw `new EngineError('INVALID_STATE', message)` khi deserialize thất bại.
4. **Tính toàn vẹn Round-trip**:
   - `serialize(state)` phải nén gọn nhẹ (tiết kiệm DB quota 500MB).
   - `deserialize(serialize(state))` bắt buộc phục hồi tương đương 100% `state` gốc.
5. **Khai báo `manifest.ts` chuẩn `GameDefinition`**:
   - Khai báo đầy đủ 12 trường bắt buộc (ID kebab-case, players, modes, turnBased, ranked, scoring, ratingSystem...).
   - Bắt buộc vượt qua `validateGameDefinition(manifest)` với 0 lỗi (kiểm tra bằng unit test).
6. **Bộ Unit Tests bắt buộc**:
   - Test khởi tạo `init`.
   - Test `legalMoves`.
   - Test tính bất biến (Immutability).
   - Test ném đúng các mã `EngineError`.
   - Test nhận diện kết thúc `isTerminal`.
   - Test round-trip `serialize` $\leftrightarrow$ `deserialize`.
   - File type-test `expectTypeOf(engine).toMatchTypeOf<Engine<S, M>>()`.
