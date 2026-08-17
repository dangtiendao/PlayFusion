import type { Engine, EngineInitConfig, PlayerIndex, TerminalResult, MatchOutcome } from '../types';
import { EngineError } from '../types';

/**
 * ==============================================================================
 * DUMMY GAME ENGINE (KHUÔN MẪU THAM CHIẾU CHUẨN ENGINE<S, M>)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & QUY TẮC BẮT BUỘC:
 * 1. File này là TypeScript thuần túy (Pure TS), KHÔNG import React, DOM hay browser APIs.
 * 2. Implement đầy đủ 100% hợp đồng `Engine<DummyState, DummyMove>` đã khóa sổ tại Phase P0.6a.
 * 3. Đây là KHUÔN THAM CHIẾU chuẩn để mọi game thật từ Phase P1.x (như Caro P1.1) copy cấu trúc:
 *    - State phải JSON-serializable và Immutable.
 *    - Toàn bộ hàm xử lý logic phải thuần túy (Pure functions) và deterministic.
 *    - Ném lỗi bằng class `EngineError` với các mã chuẩn ('ILLEGAL_MOVE', 'WRONG_TURN', 'GAME_OVER').
 *    - Serialize / Deserialize phải bảo toàn round-trip 100%.
 * ==============================================================================
 */

/**
 * Kiểu dữ liệu một nước đi trong Dummy Game.
 */
export interface DummyMove {
  /** Ghế của người chơi thực hiện nước đi (0 hoặc 1) */
  readonly playerIndex: PlayerIndex;
  /** Số điểm cộng thêm của nước đi (hợp lệ là 3 hoặc 5 điểm) */
  readonly points: number;
}

/**
 * Trạng thái bàn cờ của Dummy Game (JSON-serializable).
 */
export interface DummyState {
  /** Lượt đi hiện tại (bắt đầu từ 1) */
  readonly turn: number;
  /** Tổng số lượt tối đa trước khi kết thúc trận (mặc định 6 lượt) */
  readonly maxTurns: number;
  /** Ghế người chơi đang đến lượt (0 hoặc 1) */
  readonly currentPlayer: PlayerIndex;
  /** Điểm số tích lũy của 2 người chơi [Player 0, Player 1] */
  readonly scores: readonly [number, number];
  /** Lịch sử các nước đi đã thực hiện */
  readonly moveHistory: readonly DummyMove[];
}

/**
 * IMPLEMENTATION CHUẨN CỦA DUMMY ENGINE
 */
export const dummyEngine: Engine<DummyState, DummyMove> = {
  /**
   * Khởi tạo trạng thái ban đầu của ván đấu.
   */
  init(config: EngineInitConfig): DummyState {
    const maxTurns = typeof config.options?.maxTurns === 'number' ? config.options.maxTurns : 6;
    return {
      turn: 1,
      maxTurns,
      currentPlayer: 0,
      scores: [0, 0],
      moveHistory: [],
    };
  },

  /**
   * Liệt kê các nước đi hợp lệ cho người chơi.
   */
  legalMoves(state: DummyState, playerIndex: PlayerIndex): DummyMove[] {
    const terminal = this.isTerminal(state);
    if (terminal.over) {
      return [];
    }

    // Chỉ người chơi đang đến lượt mới có nước đi hợp lệ
    if (playerIndex !== state.currentPlayer) {
      return [];
    }

    return [
      { playerIndex, points: 3 },
      { playerIndex, points: 5 },
    ];
  },

  /**
   * Áp dụng nước đi và sinh ra State mới (Pure Function & Immutable).
   */
  applyMove(state: DummyState, move: DummyMove, playerIndex: PlayerIndex): DummyState {
    // 1. Kiểm tra nếu trận đấu đã kết thúc
    if (this.isTerminal(state).over) {
      throw new EngineError('GAME_OVER', 'Không thể thực hiện nước đi khi ván đấu đã kết thúc.');
    }

    // 2. Kiểm tra đúng lượt người chơi
    if (playerIndex !== state.currentPlayer || move.playerIndex !== playerIndex) {
      throw new EngineError(
        'WRONG_TURN',
        `Sai lượt: Lượt hiện tại là người chơi ${state.currentPlayer}, nhưng nhận được nước đi từ người chơi ${playerIndex}.`,
      );
    }

    // 3. Kiểm tra tính hợp lệ của nước đi
    if (move.points !== 3 && move.points !== 5) {
      throw new EngineError(
        'ILLEGAL_MOVE',
        `Nước đi không hợp lệ: Điểm số nhận được là ${move.points} (chỉ chấp nhận 3 hoặc 5 điểm).`,
      );
    }

    // 4. Tính toán điểm số mới an toàn với noUncheckedIndexedAccess (Immutable)
    const p0 = state.scores[0] ?? 0;
    const p1 = state.scores[1] ?? 0;
    const nextScores: [number, number] =
      playerIndex === 0 ? [p0 + move.points, p1] : [p0, p1 + move.points];

    // 5. Chuyển lượt sang đối thủ (0 -> 1 hoặc 1 -> 0)
    const nextPlayer: PlayerIndex = state.currentPlayer === 0 ? 1 : 0;

    return {
      turn: state.turn + 1,
      maxTurns: state.maxTurns,
      currentPlayer: nextPlayer,
      scores: nextScores,
      moveHistory: [...state.moveHistory, move],
    };
  },

  /**
   * Lấy chỉ số ghế của người chơi đang đến lượt.
   */
  currentPlayer(state: DummyState): PlayerIndex {
    return state.currentPlayer;
  },

  /**
   * Kiểm tra trạng thái kết thúc ván đấu và tính toán kết quả chi tiết.
   */
  isTerminal(state: DummyState): TerminalResult {
    const over = state.turn > state.maxTurns;
    if (!over) {
      return { over: false };
    }

    const p0 = state.scores[0] ?? 0;
    const p1 = state.scores[1] ?? 0;

    let outcome0: MatchOutcome = 'draw';
    let outcome1: MatchOutcome = 'draw';

    if (p0 > p1) {
      outcome0 = 'win';
      outcome1 = 'loss';
    } else if (p1 > p0) {
      outcome0 = 'loss';
      outcome1 = 'win';
    }

    return {
      over: true,
      outcomes: [
        { playerIndex: 0, outcome: outcome0, score: p0 },
        { playerIndex: 1, outcome: outcome1, score: p1 },
      ],
    };
  },

  /**
   * Nén State thành chuỗi string gọn nhẹ (JSON round-trip).
   */
  serialize(state: DummyState): string {
    return JSON.stringify(state);
  },

  /**
   * Phục hồi State từ chuỗi string nén.
   */
  deserialize(data: string): DummyState {
    try {
      const parsed = JSON.parse(data) as DummyState;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof parsed.turn !== 'number' ||
        !Array.isArray(parsed.scores)
      ) {
        throw new Error('Cấu trúc dữ liệu không hợp lệ');
      }
      return parsed;
    } catch (err) {
      throw new EngineError(
        'INVALID_STATE',
        `Không thể giải mã trạng thái bàn cờ: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
};
