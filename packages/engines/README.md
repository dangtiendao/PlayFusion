# Packages: Game Engines (`packages/engines/`)

Thư mục chứa logic game TypeScript thuần túy (Pure TS) và type definitions dùng chung:

- **Nguyên tắc bất biến**: Tuyệt đối không import React, DOM, hoặc bất kỳ UI/browser API nào.
- **Khả năng chạy**: Độc lập 100% trên Client (Web Worker, Main Thread), Supabase Edge Functions (Deno), và Node CLI/Test.
- **Nội dung tương lai**: Cung cấp interface `Engine<S, M>`, rule calculation, state transitions cho từng game (triển khai tại P0.6).
