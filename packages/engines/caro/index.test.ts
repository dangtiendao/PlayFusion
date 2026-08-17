import { describe, it, expect } from 'vitest';
import * as CaroModule from './index';

describe('Caro Module Index Barrel Export', () => {
  it('xuất đầy đủ các hàm, types và engine từ barrel file index.ts', () => {
    expect(CaroModule.caroEngine).toBeDefined();
    expect(CaroModule.DEFAULT_CARO_OPTIONS).toBeDefined();
    expect(CaroModule.idx).toBeTypeOf('function');
    expect(CaroModule.xy).toBeTypeOf('function');
    expect(CaroModule.inBounds).toBeTypeOf('function');
    expect(CaroModule.checkWinAt).toBeTypeOf('function');
    expect(CaroModule.checkWinFullScan).toBeTypeOf('function');
  });
});
