/**
 * ==============================================================================
 * DUMMY GAME ENGINE (VẬT KIỂM CHỨNG HẠ TẦNG PHÂN TẦNG)
 * ==============================================================================
 * LƯU Ý KIẾN TRÚC:
 * 1. File này là TypeScript thuần túy (Pure TS), KHÔNG import React, DOM, hay browser APIs.
 * 2. Đây là máy trạng thái tối giản phục vụ kiểm chứng hạ tầng (Phase P0.2c).
 * 3. Sẽ được chuẩn hóa và thay thế bởi interface Engine<S, M> chính thức tại Phase P0.6.
 * ==============================================================================
 */

export type DummyPlayer = 'player1' | 'player2';

export interface DummyMove {
  readonly player: DummyPlayer;
  readonly points: number;
}

export interface DummyState {
  readonly turn: number;
  readonly maxTurns: number;
  readonly currentPlayer: DummyPlayer;
  readonly scores: {
    readonly player1: number;
    readonly player2: number;
  };
  readonly isTerminal: boolean;
  readonly winner: DummyPlayer | 'draw' | null;
  readonly moveHistory: readonly DummyMove[];
}

/**
 * Khởi tạo trạng thái ban đầu của Dummy Engine.
 */
export function createDummyInitialState(maxTurns = 6): DummyState {
  return {
    turn: 1,
    maxTurns,
    currentPlayer: 'player1',
    scores: {
      player1: 0,
      player2: 0,
    },
    isTerminal: false,
    winner: null,
    moveHistory: [],
  };
}

/**
 * Áp dụng một nước đi vào state, trả về state mới (Pure & Immutable).
 */
export function applyDummyMove(state: DummyState, move: DummyMove): DummyState {
  if (state.isTerminal) {
    return state;
  }

  // Xác thực người chơi đúng lượt
  if (move.player !== state.currentPlayer) {
    throw new Error(
      `Không đúng lượt: Lượt hiện tại là ${state.currentPlayer}, nhưng nhận được move từ ${move.player}`,
    );
  }

  const nextScores = {
    ...state.scores,
    [move.player]: state.scores[move.player] + Math.max(0, move.points),
  };

  const isNextTerminal = state.turn >= state.maxTurns;
  const nextPlayer: DummyPlayer = state.currentPlayer === 'player1' ? 'player2' : 'player1';

  let nextWinner: DummyPlayer | 'draw' | null = null;
  if (isNextTerminal) {
    if (nextScores.player1 > nextScores.player2) {
      nextWinner = 'player1';
    } else if (nextScores.player2 > nextScores.player1) {
      nextWinner = 'player2';
    } else {
      nextWinner = 'draw';
    }
  }

  return {
    turn: state.turn + 1,
    maxTurns: state.maxTurns,
    currentPlayer: nextPlayer,
    scores: nextScores,
    isTerminal: isNextTerminal,
    winner: nextWinner,
    moveHistory: [...state.moveHistory, move],
  };
}

/**
 * Kiểm tra xem ván chơi đã kết thúc chưa.
 */
export function isDummyTerminal(state: DummyState): boolean {
  return state.isTerminal;
}

/**
 * Lấy kết quả người chiến thắng.
 */
export function getDummyWinner(state: DummyState): DummyPlayer | 'draw' | null {
  return state.winner;
}
