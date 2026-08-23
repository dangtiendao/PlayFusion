import type { GameDefinition } from '../types/index.ts';

/**
 * ==============================================================================
 * CARO GAME MANIFEST (TỜ KHAI NĂNG LỰC GAME CỜ CARO CHÍNH THỨC)
 * ==============================================================================
 *
 * ⚠️ NGUYÊN TẮC BẤT BIẾN:
 * - `id`: 'caro' (Bất biến vĩnh viễn toàn hệ thống, database & registry).
 * - `modes`: ['vs_ai', 'local_pvp'] (Chế độ online PvP sẽ được bổ sung ở Phase P3.x).
 * - `loadEngine`: Dynamic import trả về engine thuần của Caro.
 * - Tuân thủ tuyệt đối chuẩn `GameDefinition` và vượt qua `validateGameDefinition()`.
 */

export const caroManifest: GameDefinition = {
  id: 'caro',
  name: 'Cờ Caro',
  description:
    'Trò chơi cờ Caro truyền thống bàn cờ 15x15 luật Việt Nam (chặn 2 đầu không thắng). Hỗ trợ chơi với AI 3 cấp độ và đấu 2 người trên cùng thiết bị.',
  category: 'board',
  players: {
    min: 2,
    max: 2,
  },
  modes: [
    'vs_ai', // Đấu với máy (AI Minimax Alpha-Beta Worker P1.2)
    'local_pvp', // Đấu 2 người trên cùng máy (Local Pass & Play P1.3)
    'online_1v1', // Đấu 1v1 trực tuyến qua phòng mã 6 ký tự (P3.3: online mở)
    'online_correspondence', // Đấu theo lượt kiểu thư tín qua phòng mã (P3.6)
  ],
  turnBased: true,
  ranked: true,
  scoring: 'win_loss',
  ratingSystem: 'elo',
  hasDraw: true,
  avgMatchSeconds: 300,
  aiLevels: ['easy', 'medium', 'hard'],
  themeColor: '#06b6d4',
  // Cấu hình đồng hồ kiểm soát thời gian (P3.4a): 5 phút cơ bản + 5s cộng thêm mỗi nước
  // GHI CHÚ: Giá trị THẬT của ván đấu do server đọc system_config lúc init, manifest chỉ để UI mô tả chế độ.
  timeControl: {
    baseSeconds: 300,
    incrementSeconds: 5,
  },
  loadEngine: async () => {
    const { caroEngine } = await import('./engine');
    return caroEngine;
  },
};

export default caroManifest;
