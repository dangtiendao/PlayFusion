import { describe, it, expect } from 'vitest';
import { findBestMove } from './search';
import { caroEngine } from '../engine';
import { createBoardFromAscii } from '../test-utils';
import type { CaroState } from '../types';

describe('Caro AI Search Benchmark (benchmark.test.ts - P1.2b)', () => {
  it('thế cờ giữa ván ~20 quân: AI Hard tính toán xong trong <= 2000ms', () => {
    const baseState = caroEngine.init({
      playerCount: 2,
      options: { boardSize: 15, winLength: 5 },
    });

    // Dựng thế cờ giữa ván gồm 20 quân cờ tập trung quanh trung tâm (7,7)
    const ascii = [
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . x o . . . . . . . .',
      '. . . . x x o o . . . . . . .',
      '. . . . o x x o . . . . . . .',
      '. . . . o o x x o . . . . . .',
      '. . . . x o o x x . . . . . .',
      '. . . . . x o o . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
      '. . . . . . . . . . . . . . .',
    ];
    const board = createBoardFromAscii(ascii, 15);
    const state: CaroState = {
      ...baseState,
      board,
      moveCount: 20,
      currentPlayer: 0,
    };

    const startTime = Date.now();
    const result = findBestMove(state, {
      level: 'hard',
      seed: 'benchmark-seed-2026',
      timeBudgetMs: 1500,
    });
    const actualElapsed = Date.now() - startTime;

    console.log(
      `[AI Benchmark] Hard Level (Midgame 20 pieces) -> Nước đi: ${result.move} | Điểm: ${result.score} | Độ sâu: ${result.depth} | Số nodes: ${result.nodes} | Thời gian: ${actualElapsed}ms (Search elapsedMs: ${result.elapsedMs.toFixed(1)}ms)`,
    );

    expect(result.move).toBeGreaterThanOrEqual(0);
    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(actualElapsed).toBeLessThanOrEqual(2000);
  });
});
