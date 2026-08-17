import { describe, it, expect } from 'vitest';
import { validateGameDefinition } from './validate';
import { caroGameFixture, puzzleGameFixture } from './__fixtures__/game-definition.fixture';
import type { GameDefinition } from './game-definition';

describe('validateGameDefinition Unit Tests', () => {
  it('Case 1: Phải chấp nhận caroGameFixture hợp lệ (0 lỗi)', () => {
    const errors = validateGameDefinition(caroGameFixture);
    expect(errors).toHaveLength(0);
  });

  it('Case 2: Phải chấp nhận puzzleGameFixture hợp lệ (0 lỗi)', () => {
    const errors = validateGameDefinition(puzzleGameFixture);
    expect(errors).toHaveLength(0);
  });

  it("Case 3: Phải báo lỗi khi có chế độ 'vs_ai' nhưng thiếu aiLevels", () => {
    const invalidDef: GameDefinition = {
      ...caroGameFixture,
      modes: ['vs_ai'],
      aiLevels: undefined,
    };
    const errors = validateGameDefinition(invalidDef);
    expect(errors.some((err) => err.includes('aiLevels'))).toBe(true);
  });

  it("Case 4: Phải báo lỗi khi scoring là 'score' hoặc 'time' nhưng thiếu scoreDirection", () => {
    const invalidDef: GameDefinition = {
      ...puzzleGameFixture,
      scoring: 'time',
      scoreDirection: undefined,
    };
    const errors = validateGameDefinition(invalidDef);
    expect(errors.some((err) => err.includes('scoreDirection'))).toBe(true);
  });

  it('Case 5: Phải báo lỗi khi players.min > players.max hoặc players.min < 1', () => {
    const invalidDef1: GameDefinition = {
      ...caroGameFixture,
      players: { min: 3, max: 2 },
    };
    const errors1 = validateGameDefinition(invalidDef1);
    expect(errors1.some((err) => err.includes('không được lớn hơn'))).toBe(true);

    const invalidDef2: GameDefinition = {
      ...caroGameFixture,
      players: { min: 0, max: 2 },
    };
    const errors2 = validateGameDefinition(invalidDef2);
    expect(errors2.some((err) => err.includes('phải lớn hơn hoặc bằng 1'))).toBe(true);
  });

  it('Case 6: Phải báo lỗi khi ID không đúng định dạng kebab-case', () => {
    const invalidDef: GameDefinition = {
      ...caroGameFixture,
      id: 'Caro_Game_123!',
    };
    const errors = validateGameDefinition(invalidDef);
    expect(errors.some((err) => err.includes('kebab-case'))).toBe(true);
  });

  it("Case 7: Phải báo lỗi khi ranked = true đối kháng online nhưng ratingSystem = 'leaderboard_only'", () => {
    const invalidDef: GameDefinition = {
      ...caroGameFixture,
      ranked: true,
      modes: ['online_1v1'],
      ratingSystem: 'leaderboard_only',
    };
    const errors = validateGameDefinition(invalidDef);
    expect(errors.some((err) => err.includes('leaderboard_only'))).toBe(true);
  });

  it('Case 8: Phải báo lỗi khi avgMatchSeconds <= 0', () => {
    const invalidDef: GameDefinition = {
      ...caroGameFixture,
      avgMatchSeconds: 0,
    };
    const errors = validateGameDefinition(invalidDef);
    expect(errors.some((err) => err.includes('avgMatchSeconds'))).toBe(true);
  });
});
