/**
 * Smoke test engine logic.
 * Pure TypeScript, zero external framework / browser dependencies.
 */
export interface SmokeState {
  readonly score: number;
  readonly multiplier: number;
}

export function createInitialSmokeState(): SmokeState {
  return {
    score: 0,
    multiplier: 1,
  };
}

export function applySmokeScore(state: SmokeState, points: number): SmokeState {
  return {
    ...state,
    score: state.score + points * state.multiplier,
  };
}
