import { describe, it, expect } from 'vitest';
import { validateRegistryDbSync } from './check-games-sync';
import type { GameDefinition } from '../packages/engines/types';

describe('Scripts: Check Games Sync (scripts/check-games-sync.ts - P2.2a)', () => {
  it('1. Trạng thái hiện tại: Toàn bộ game ranked trong Registry đều đã được seed vào DB', () => {
    const result = validateRegistryDbSync();

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.rankedGamesCount).toBe(1); // Caro
    expect(result.totalGamesCount).toBe(3); // Caro, Dummy, Dummy2
  });

  it('2. Các game test unranked (dummy, dummy2) không gây lỗi nhưng có ghi chú cảnh báo an toàn', () => {
    const result = validateRegistryDbSync();

    expect(result.warnings.some((w) => w.includes('dummy'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('dummy2'))).toBe(true);
  });

  it('3. Báo lỗi và trả về ok=false khi có game ranked mới trong Registry nhưng chưa được seed vào DB', () => {
    const mockGames: { definition: GameDefinition }[] = [
      {
        definition: {
          id: 'caro',
          name: 'Cờ Caro',
          description: 'Caro test',
          category: 'board',
          players: { min: 2, max: 2 },
          modes: ['vs_ai'],
          turnBased: true,
          ranked: true,
          scoring: 'win_loss',
          ratingSystem: 'elo',
          hasDraw: true,
          avgMatchSeconds: 300,
          loadEngine: async () => ({}) as never,
        },
      },
      {
        definition: {
          id: 'co_tuong',
          name: 'Cờ Tướng',
          description: 'Cờ tướng test',
          category: 'board',
          players: { min: 2, max: 2 },
          modes: ['online_pvp'],
          turnBased: true,
          ranked: true, // Game ranked nhưng thiếu trong seed
          scoring: 'win_loss',
          ratingSystem: 'elo',
          hasDraw: true,
          avgMatchSeconds: 600,
          loadEngine: async () => ({}) as never,
        },
      },
    ];

    const result = validateRegistryDbSync(mockGames, ['caro']);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Cờ Tướng');
    expect(result.errors[0]).toContain('co_tuong');
  });

  it('4. Cảnh báo khi có game trong DB Seed nhưng không tồn tại trong Frontend Registry', () => {
    const mockGames: { definition: GameDefinition }[] = [
      {
        definition: {
          id: 'caro',
          name: 'Cờ Caro',
          description: 'Caro test',
          category: 'board',
          players: { min: 2, max: 2 },
          modes: ['vs_ai'],
          turnBased: true,
          ranked: true,
          scoring: 'win_loss',
          ratingSystem: 'elo',
          hasDraw: true,
          avgMatchSeconds: 300,
          loadEngine: async () => ({}) as never,
        },
      },
    ];

    const result = validateRegistryDbSync(mockGames, ['caro', 'legacy_game_deleted']);

    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('legacy_game_deleted'))).toBe(true);
  });
});
