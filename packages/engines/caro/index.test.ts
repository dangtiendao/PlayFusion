import { describe, it, expect } from 'vitest';
import * as CaroModule from './index';

describe('Caro Module Index Barrel Export', () => {
  it('xuất đầy đủ các hàm, types, engine và AI helpers từ barrel file index.ts', () => {
    expect(CaroModule.caroEngine).toBeDefined();
    expect(CaroModule.DEFAULT_CARO_OPTIONS).toBeDefined();
    expect(CaroModule.idx).toBeTypeOf('function');
    expect(CaroModule.xy).toBeTypeOf('function');
    expect(CaroModule.inBounds).toBeTypeOf('function');
    expect(CaroModule.checkWinAt).toBeTypeOf('function');
    expect(CaroModule.checkWinFullScan).toBeTypeOf('function');
    // AI Module exports
    expect(CaroModule.PATTERN_SCORES).toBeDefined();
    expect(CaroModule.scanLineAt).toBeTypeOf('function');
    expect(CaroModule.evaluateBoard).toBeTypeOf('function');
    expect(CaroModule.evaluateMove).toBeTypeOf('function');
    expect(CaroModule.generateCandidates).toBeTypeOf('function');
    expect(CaroModule.AI_LEVELS).toBeDefined();
    expect(CaroModule.getAiLevelConfig).toBeTypeOf('function');
    expect(CaroModule.findBestMove).toBeTypeOf('function');
    expect(CaroModule.createSeededPrng).toBeTypeOf('function');
    expect(CaroModule.hashStringToSeed).toBeTypeOf('function');
  });
});
