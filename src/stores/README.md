# Client State Stores (`src/stores/`)

Thư mục chứa các state stores toàn cục xây dựng bằng Zustand:

- **Trách nhiệm**: Quản lý trạng thái phiên đăng nhập (AuthStore), cài đặt giao diện/âm thanh (SettingsStore), ví tiền tạm thời (WalletStore), và trạng thái ghép phòng/lobby (LobbyStore).
- **Nguyên tắc**: Giữ store tinh gọn, tách biệt rõ ràng giữa state UI tạm thời và state vĩnh viễn trên Supabase DB.
