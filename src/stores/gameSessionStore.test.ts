import { describe, it, expect, beforeEach } from 'vitest';
import { useGameSessionStore } from './gameSessionStore';

describe('GameSessionStore Unit Tests (src/stores/gameSessionStore.ts)', () => {
  beforeEach(() => {
    useGameSessionStore.getState().exitGame();
  });

  it('1. Trạng thái khởi tạo mặc định: isInGame=false, isPaused=false', () => {
    const state = useGameSessionStore.getState();
    expect(state.isInGame).toBe(false);
    expect(state.isPaused).toBe(false);
  });

  it('2. enterGame: Chuyển isInGame sang true và reset isPaused', () => {
    useGameSessionStore.getState().enterGame();
    const state = useGameSessionStore.getState();
    expect(state.isInGame).toBe(true);
    expect(state.isPaused).toBe(false);
  });

  it('3. pause & resume: Điều khiển cờ isPaused', () => {
    useGameSessionStore.getState().enterGame();
    expect(useGameSessionStore.getState().isPaused).toBe(false);

    useGameSessionStore.getState().pause();
    expect(useGameSessionStore.getState().isPaused).toBe(true);

    useGameSessionStore.getState().resume();
    expect(useGameSessionStore.getState().isPaused).toBe(false);
  });

  it('4. exitGame: Khôi phục toàn bộ cờ về false', () => {
    useGameSessionStore.getState().enterGame();
    useGameSessionStore.getState().pause();

    useGameSessionStore.getState().exitGame();
    const state = useGameSessionStore.getState();
    expect(state.isInGame).toBe(false);
    expect(state.isPaused).toBe(false);
  });
});
