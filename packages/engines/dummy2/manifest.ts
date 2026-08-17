import type { GameDefinition } from '../types';

/**
 * ==============================================================================
 * DUMMY 2 GAME MANIFEST (KIỂM CHỨNG BÀI TEST "THÊM GAME = 1 DÒNG REGISTRY")
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Game giả kiểm chứng kiến trúc — sẽ gỡ khi có 2 game thật (dự kiến sau P8.3),
 *   xem docs/phases/P0.7.md.
 * - Mục đích: Chứng minh khả năng tự sinh card, tự sinh chip lọc thể loại 'puzzle',
 *   tự động điều hướng và lazy-load code-splitting mà không cần sửa bất kỳ dòng UI nào.
 * ==============================================================================
 */

export const dummy2Manifest: GameDefinition = {
  id: 'dummy2',
  name: 'Dummy 2 Puzzle',
  description:
    'Trò chơi kiểm chứng kiến trúc thứ hai với thể loại Puzzle để kiểm tra bộ lọc tự sinh.',
  category: 'puzzle',
  players: {
    min: 1,
    max: 2,
  },
  modes: ['solo', 'local_pvp'],
  turnBased: true,
  ranked: false,
  scoring: 'win_loss',
  ratingSystem: 'leaderboard_only',
  hasDraw: false,
  avgMatchSeconds: 90,
  themeColor: '#10b981',
  loadEngine: async () => {
    const { dummyEngine } = await import('../dummy/engine');
    return dummyEngine;
  },
};

export default dummy2Manifest;
