# Realtime Transport (`src/transport/`)

Tầng kết nối mạng thời gian thực (Realtime Transport Layer) qua Supabase WebSocket:

- **Trách nhiệm**: Đóng gói các kết nối WebSocket Realtime Broadcast và Presence theo từng ván đấu, bọc phong bì dữ liệu `TransportEnvelope (v=1)`, và quản lý trạng thái đồng bộ người chơi.
- **Kỷ luật Free Tier**: Tuyệt đối KHÔNG duy trì kết nối thường trực toàn app. Chỉ tạo channel khi vào trận đấu và ngắt kết nối dọn dẹp sạch sẽ (`untrack` $\rightarrow$ `unsubscribe` $\rightarrow$ `removeChannel`) ngay khi thoát. Khống chế `eventsPerSecond: 10`.
- **Nguyên tắc bảo mật**: Tầng Transport là ống truyền dẫn dữ liệu thuần túy (Dumb Pipe). Mọi thông điệp nhận được chỉ phục vụ hiển thị UI; các hành động thay đổi trạng thái có hệ quả pháp lý (nước đi, kết quả ván đấu, xếp hạng) bắt buộc phải qua thẩm định của Edge Function Trọng Tài Server-side (P3.2).
- **Quy ước tầng**: Các module bên ngoài chỉ được import API công khai từ `src/transport/index.ts` hoặc `@/transport`. Cấm import sâu vào các file nội bộ.
