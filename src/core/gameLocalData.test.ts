import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStats,
  recordResult,
  getLastConfig,
  setLastConfig,
  clearGameData,
  buildGameDataKey,
  createDefaultStats,
} from './gameLocalData';
import { storage } from './storage';

describe('Generic Game Local Data Module (gameLocalData.ts - P1.5a)', () => {
  beforeEach(() => {
    // Dọn sạch dữ liệu test trước mỗi bài kiểm thử
    clearGameData('test_game_1');
    clearGameData('test_game_2');
  });

  it('1. Trả về đối tượng thống kê mặc định khi chưa có dữ liệu', () => {
    const stats = getStats('test_game_1');
    expect(stats.totalMatches).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.draws).toBe(0);
    expect(stats.byMode).toEqual({});
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(0);
    expect(typeof stats.updatedAt).toBe('string');
  });

  it('2. recordResult: Cộng dồn chính xác tổng số trận, phân nhóm byMode và chuỗi thắng/thua', () => {
    const gameId = 'test_game_1';

    // Trận 1: Thắng ở mode 'vs_ai:easy'
    const s1 = recordResult(gameId, 'vs_ai:easy', 'win');
    expect(s1.totalMatches).toBe(1);
    expect(s1.wins).toBe(1);
    expect(s1.losses).toBe(0);
    expect(s1.currentStreak).toBe(1);
    expect(s1.bestStreak).toBe(1);
    expect(s1.byMode['vs_ai:easy']).toEqual({ matches: 1, wins: 1, losses: 0, draws: 0 });

    // Trận 2: Thắng tiếp ở mode 'vs_ai:hard' -> Chuỗi thắng tăng lên 2
    const s2 = recordResult(gameId, 'vs_ai:hard', 'win');
    expect(s2.totalMatches).toBe(2);
    expect(s2.wins).toBe(2);
    expect(s2.currentStreak).toBe(2);
    expect(s2.bestStreak).toBe(2);
    expect(s2.byMode['vs_ai:hard']).toEqual({ matches: 1, wins: 1, losses: 0, draws: 0 });

    // Trận 3: Thắng tiếp ở mode 'vs_ai:hard' -> Chuỗi thắng đạt 3
    const s3 = recordResult(gameId, 'vs_ai:hard', 'win');
    expect(s3.totalMatches).toBe(3);
    expect(s3.wins).toBe(3);
    expect(s3.currentStreak).toBe(3);
    expect(s3.bestStreak).toBe(3);
    expect(s3.byMode['vs_ai:hard']).toEqual({ matches: 2, wins: 2, losses: 0, draws: 0 });

    // Trận 4: Thua ở mode 'vs_ai:hard' -> currentStreak reset về 0, bestStreak giữ 3
    const s4 = recordResult(gameId, 'vs_ai:hard', 'loss');
    expect(s4.totalMatches).toBe(4);
    expect(s4.losses).toBe(1);
    expect(s4.currentStreak).toBe(0);
    expect(s4.bestStreak).toBe(3);
    expect(s4.byMode['vs_ai:hard']).toEqual({ matches: 3, wins: 2, losses: 1, draws: 0 });

    // Trận 5: Hòa ở mode 'vs_ai:easy' -> currentStreak giữ nguyên (0), bestStreak giữ 3
    const s5 = recordResult(gameId, 'vs_ai:easy', 'draw');
    expect(s5.totalMatches).toBe(5);
    expect(s5.draws).toBe(1);
    expect(s5.currentStreak).toBe(0);
    expect(s5.bestStreak).toBe(3);

    // Trận 6: outcome = 'none' (local PvP) -> Chỉ tăng matches, không ảnh hưởng win/loss/streak
    const s6 = recordResult(gameId, 'local_pvp', 'none');
    expect(s6.totalMatches).toBe(6);
    expect(s6.wins).toBe(3);
    expect(s6.losses).toBe(1);
    expect(s6.draws).toBe(1);
    expect(s6.currentStreak).toBe(0);
    expect(s6.byMode['local_pvp']).toEqual({ matches: 1, wins: 0, losses: 0, draws: 0 });
  });

  it('3. Tự phục hồi an toàn khi dữ liệu trong Storage bị hỏng cấu trúc', () => {
    const gameId = 'test_game_1';
    const key = buildGameDataKey(gameId, 'stats');

    // Cố tình ghi dữ liệu sai cấu trúc
    storage.setItem(key, { corrupted: true, totalMatches: 'not_a_number' });

    // Khi đọc lại: Tự dọn sạch và trả về default stats
    const stats = getStats(gameId);
    expect(stats).toEqual(expect.objectContaining(createDefaultStats()));
  });

  it('4. getLastConfig và setLastConfig: Lưu và đọc cấu hình ván đấu generic', () => {
    const gameId = 'test_game_1';

    expect(getLastConfig(gameId)).toBeNull();

    interface MockConfig {
      mode: string;
      level: string;
      difficulty: number;
    }

    const testConfig: MockConfig = {
      mode: 'vs_ai',
      level: 'hard',
      difficulty: 99,
    };

    setLastConfig(gameId, testConfig);

    const loaded = getLastConfig<MockConfig>(gameId);
    expect(loaded).toEqual(testConfig);
  });

  it('5. clearGameData: Xóa sạch toàn bộ dữ liệu của game', () => {
    const gameId = 'test_game_1';

    recordResult(gameId, 'mode_a', 'win');
    setLastConfig(gameId, { test: 123 });

    expect(getStats(gameId).totalMatches).toBe(1);
    expect(getLastConfig(gameId)).not.toBeNull();

    clearGameData(gameId);

    expect(getStats(gameId).totalMatches).toBe(0);
    expect(getLastConfig(gameId)).toBeNull();
  });

  it('6. Cách ly dữ liệu hoàn hảo giữa các gameId khác nhau', () => {
    recordResult('test_game_1', 'mode_1', 'win');
    recordResult('test_game_2', 'mode_2', 'loss');

    const stats1 = getStats('test_game_1');
    const stats2 = getStats('test_game_2');

    expect(stats1.totalMatches).toBe(1);
    expect(stats1.wins).toBe(1);
    expect(stats1.losses).toBe(0);

    expect(stats2.totalMatches).toBe(1);
    expect(stats2.wins).toBe(0);
    expect(stats2.losses).toBe(1);
  });
});
