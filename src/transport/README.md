# Realtime Transport Layer (`src/transport/`)

Tầng truyền thông thời gian thực và đồng bộ nước đi cho các trận đấu nhiều người chơi:

- **Trách nhiệm**: Đóng gói kênh Supabase Realtime / WebRTC / WebSockets để phát và nhận moves.
- **Ràng buộc Free-Tier**: Chỉ mở kết nối Realtime khi người dùng đã chính thức bước vào phòng đấu, tự động ngắt kết nối khi kết thúc trận hoặc quay về sảnh chính (triển khai tại P3.1).
