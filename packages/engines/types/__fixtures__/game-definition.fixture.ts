import type { GameDefinition } from '../game-definition';
import type { Engine } from '../engine';

/**
 * ==============================================================================
 * GAME DEFINITION FIXTURES (KIỂM CHỨNG TYPE & UNIT TESTS)
 * ==============================================================================
 *
 * GHI CHÚ:
 * - Đây là các đối tượng giả lập (Fixtures) phục vụ kiểm chứng tính toàn vẹn của kiểu dữ liệu (Type-test)
 *   và viết Unit Tests cho Validator.
 * - ĐÂY KHÔNG PHẢI LÀ GAME THẬT. Các game thật sẽ được triển khai tại `src/games/*` từ Phase P1.x.
 * ==============================================================================
 */

// Dummy engine mock dùng cho fixture
const mockEngine: Engine<unknown, unknown> = {
  init: () => ({ board: [] }),
  legalMoves: () => [],
  applyMove: (state) => state,
  currentPlayer: () => 0,
  isTerminal: () => ({ over: false }),
  serialize: () => '{}',
  deserialize: () => ({ board: [] }),
};

/**
 * Fixture Mẫu 1: Game cờ đối kháng 2 người, theo lượt, có xếp hạng Elo, có Bot AI, có Shop Skin.
 */
export const caroGameFixture: GameDefinition = {
  id: 'caro',
  name: 'Cờ Caro (Gomoku)',
  description: 'Trò chơi cờ caro truyền thống 5 quân thắng, luật thi đấu đối kháng quốc tế.',
  category: 'board',
  players: {
    min: 2,
    max: 2,
  },
  modes: ['vs_ai', 'local_pvp', 'online_1v1'],
  turnBased: true,
  ranked: true,
  scoring: 'win_loss',
  ratingSystem: 'elo',
  hasDraw: true,
  avgMatchSeconds: 300,
  aiLevels: ['easy', 'medium', 'hard'],
  cosmeticSlots: [
    { id: 'board_theme', name: 'Giao diện bàn cờ' },
    { id: 'piece_effect', name: 'Hiệu ứng quân cờ X/O' },
  ],
  timeControl: {
    baseSeconds: 300,
    incrementSeconds: 3,
  },
  themeColor: '#2563eb',
  icon: '/assets/games/caro/icon.svg',
  minAppVersion: '0.5.0',
  loadEngine: async () => mockEngine,
};

/**
 * Fixture Mẫu 2: Game solo giải đố tính thời gian hoàn thành (Speedrun), có seed ngẫu nhiên, xếp hạng Leaderboard.
 */
export const puzzleGameFixture: GameDefinition = {
  id: 'slide-puzzle',
  name: 'Xếp Hình Trượt (15-Puzzle)',
  description: 'Trò chơi giải đố sắp xếp các ô số theo thứ tự tăng dần trong thời gian ngắn nhất.',
  category: 'puzzle',
  players: {
    min: 1,
    max: 1,
  },
  modes: ['solo'],
  turnBased: false,
  ranked: false,
  scoring: 'time',
  scoreDirection: 'asc', // Thời gian hoàn thành ngắn nhất xếp vị trí số 1
  ratingSystem: 'leaderboard_only',
  hasDraw: false,
  avgMatchSeconds: 120,
  seeded: true, // Nhận PRNG seed từ server để tạo đề bài giải đố
  themeColor: '#10b981',
  loadEngine: async () => mockEngine,
};
