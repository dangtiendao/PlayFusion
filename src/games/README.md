# Game Plugins (`src/games/`)

Thư mục chứa các plugin trò chơi độc lập được tích hợp vào Game Hub:

- **Cấu trúc mỗi plugin**: `manifest.ts` (metadata), `engine.ts` (re-export logic thuần), `View.tsx` (giao diện React), `ai.ts` (bot chơi).
- **Đăng ký tập trung**: Mọi game được đăng ký tự động qua `registry.ts`.
- **Nguyên tắc bất biến**: CẤM viết `if (gameId === ...)` bên ngoài thư mục riêng của từng game (bắt đầu triển khai từ P1.x).
