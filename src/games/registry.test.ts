import { describe, it, expect } from 'vitest';
import {
  GAMES,
  getGameById,
  getAllGames,
  getGamesByCategory,
  validateRegistry,
  assertRegistryValid,
} from './registry';
import type { RegistryEntry } from './types';
import type { GameDefinition } from '@engines/types';
import { dummyManifest } from '@engines/dummy/manifest';

describe('Game Registry Unit Tests (src/games/registry.ts)', () => {
  it('1. assertRegistryValid: Phải pass 100% với danh sách GAMES hiện tại', () => {
    expect(() => assertRegistryValid(GAMES)).not.toThrow();
    const errors = validateRegistry(GAMES);
    expect(errors).toHaveLength(0);
  });

  it("2. getGameById: Trả đúng RegistryEntry khi id là 'dummy'", () => {
    const game = getGameById('dummy');
    expect(game).toBeDefined();
    expect(game?.definition.id).toBe('dummy');
    expect(game?.definition.name).toBe(dummyManifest.name);
    expect(typeof game?.loadView).toBe('function');
  });

  it('3. getGameById: Trả undefined khi truyền vào ID không tồn tại', () => {
    const game = getGameById('non_existent_game_xyz');
    expect(game).toBeUndefined();
  });

  it('4. getAllGames: Trả về danh sách chứa toàn bộ game đã đăng ký', () => {
    const allGames = getAllGames();
    expect(allGames.length).toBeGreaterThanOrEqual(1);
    expect(allGames.some((g) => g.definition.id === 'dummy')).toBe(true);
  });

  it("5. getGamesByCategory: Lọc chính xác theo thể loại 'board'", () => {
    const boardGames = getGamesByCategory('board');
    expect(boardGames.length).toBeGreaterThanOrEqual(1);
    expect(boardGames.every((g) => g.definition.category === 'board')).toBe(true);

    const arcadeGames = getGamesByCategory('arcade');
    expect(arcadeGames).toHaveLength(0);
  });

  it('6. Fail-Fast: Phải bắt lỗi khi có 2 game bị trùng ID trong registry', () => {
    const mockDuplicateEntries: RegistryEntry[] = [
      {
        definition: dummyManifest,
        loadView: async () => ({ default: () => null }),
      },
      {
        definition: {
          ...dummyManifest,
          name: 'Bản sao bị trùng ID',
        },
        loadView: async () => ({ default: () => null }),
      },
    ];

    const errors = validateRegistry(mockDuplicateEntries);
    expect(errors.some((err) => err.includes('bị trùng lặp'))).toBe(true);

    expect(() => assertRegistryValid(mockDuplicateEntries)).toThrowError(/bị trùng lặp/);
  });

  it("7. Fail-Fast: Phải bắt lỗi khi manifest vi phạm logic (ví dụ: có 'vs_ai' nhưng thiếu aiLevels)", () => {
    const invalidManifest: GameDefinition = {
      ...dummyManifest,
      id: 'invalid-ai-game',
      modes: ['vs_ai'],
      aiLevels: undefined,
    };

    const mockInvalidEntries: RegistryEntry[] = [
      {
        definition: invalidManifest,
        loadView: async () => ({ default: () => null }),
      },
    ];

    const errors = validateRegistry(mockInvalidEntries);
    expect(errors.some((err) => err.includes('aiLevels'))).toBe(true);
    expect(errors.some((err) => err.includes('invalid-ai-game'))).toBe(true);

    expect(() => assertRegistryValid(mockInvalidEntries)).toThrowError(/aiLevels/);
  });

  it('8. Fail-Fast: Phải bắt lỗi khi loadView không phải là hàm', () => {
    const mockInvalidEntries = [
      {
        definition: dummyManifest,
        loadView: 'not-a-function' as unknown as RegistryEntry['loadView'],
      },
    ];

    const errors = validateRegistry(mockInvalidEntries);
    expect(errors.some((err) => err.includes('loadView'))).toBe(true);

    expect(() => assertRegistryValid(mockInvalidEntries)).toThrowError(/loadView/);
  });
});
