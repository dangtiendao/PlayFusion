import type { GameDefinition } from '../types';

/**
 * ==============================================================================
 * DUMMY GAME MANIFEST (KHUÔN THAM CHIẾU CẤU TRÚC GAME DEFINITION)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. Đây là khuôn tham chiếu cấu trúc manifest chuẩn mực — mọi game thật từ Phase P1.x (Caro P1.1)
 *    sẽ copy cấu trúc từ file này.
 * 2. Dummy game KHÔNG hiển thị trong menu Sảnh chính thức (Registry P0.7 sẽ quyết định danh sách nạp).
 * ==============================================================================
 */

export const dummyManifest: GameDefinition = {
  id: 'dummy',
  name: 'Dummy Test Game',
  description:
    'Engine kiểm chứng hạ tầng phân tầng và khuôn mẫu tham chiếu cho các game chính thức.',
  category: 'board',
  players: {
    min: 2,
    max: 2,
  },
  modes: ['local_pvp'],
  turnBased: true,
  ranked: false,
  scoring: 'win_loss',
  ratingSystem: 'leaderboard_only',
  hasDraw: true,
  avgMatchSeconds: 60,
  themeColor: '#3b82f6',
  loadEngine: async () => {
    const { dummyEngine } = await import('./engine');
    return dummyEngine;
  },
};

export default dummyManifest;
