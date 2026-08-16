# Data Repositories (`src/repositories/`)

Tầng trừu tượng hóa việc truy xuất dữ liệu từ Backend Supabase và Client Storage:

- **Trách nhiệm**: Đóng gói các truy vấn Postgres, gọi Edge Functions bảo mật (ghi sổ cái, nạp/rút xu, kết toán trận đấu), và quản lý RLS.
- **Nguyên tắc**: Bắt buộc gắn `game_id` làm chiều dữ liệu chuẩn trong mọi truy vấn bảng đa game (triển khai tại P2.5).
