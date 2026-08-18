import { describe, it, expect } from 'vitest';
import { AI_LEVELS, getAiLevelConfig } from './levels';

describe('Caro AI Difficulty Levels (levels.ts - P1.2b)', () => {
  it('định nghĩa đầy đủ 3 cấp độ easy, medium, hard với các thông số chuẩn xác', () => {
    expect(AI_LEVELS.easy.maxDepth).toBe(1);
    expect(AI_LEVELS.easy.noiseProbability).toBe(0.3);
    expect(AI_LEVELS.easy.forgetBlockProbability).toBe(0.3);

    expect(AI_LEVELS.medium.maxDepth).toBe(2);
    expect(AI_LEVELS.medium.noiseProbability).toBe(0);
    expect(AI_LEVELS.medium.forgetBlockProbability).toBe(0);

    expect(AI_LEVELS.hard.maxDepth).toBe(4);
    expect(AI_LEVELS.hard.timeBudgetMs).toBe(1500);
    expect(AI_LEVELS.hard.noiseProbability).toBe(0);
    expect(AI_LEVELS.hard.forgetBlockProbability).toBe(0);
  });

  it('getAiLevelConfig trả về đúng cấu hình hoặc fallback hợp lệ', () => {
    expect(getAiLevelConfig('easy')).toEqual(AI_LEVELS.easy);
    expect(getAiLevelConfig('medium')).toEqual(AI_LEVELS.medium);
    expect(getAiLevelConfig('hard')).toEqual(AI_LEVELS.hard);

    // Fallback cho level không hợp lệ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getAiLevelConfig('invalid' as any)).toEqual(AI_LEVELS.medium);
  });
});
