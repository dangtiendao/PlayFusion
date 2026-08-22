/**
 * ==============================================================================
 * KIỂM THỬ NGUYÊN THỦY GAME ENGINE TRONG DENO (SUPABASE/FUNCTIONS/TESTS/ENGINE-IN-DENO.TEST.TS)
 * ==============================================================================
 *
 * BẰNG CHỨNG KIẾN TRÚC 3 MÔI TRƯỜNG:
 * - Engine TypeScript thuần túy (`packages/engines/caro`) chạy NGUYÊN VẸN trên Deno Runtime
 *   mà không cần sửa đổi bất kỳ dòng code nào.
 * - Chạy bằng lệnh: `deno test supabase/functions/tests/` (hoặc `npm run test:deno`).
 * ==============================================================================
 */

function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      msg || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`,
    );
  }
}

function assertNotEquals<T>(actual: T, expected: T, msg?: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new Error(msg || `Expected values to differ, but both were ${JSON.stringify(actual)}`);
  }
}

import { caroEngine } from '../../../packages/engines/caro/engine.ts';
import { CaroMovesCodec } from '../../../packages/engines/caro/moves-codec.ts';
import { checkWinAt } from '../../../packages/engines/caro/win-check.ts';
import { DEFAULT_CARO_OPTIONS } from '../../../packages/engines/caro/types.ts';

Deno.test('1. [Deno Engine] Khởi tạo bàn cờ Caro 15x15 thành công', () => {
  const state = caroEngine.init({
    playerCount: 2,
    options: DEFAULT_CARO_OPTIONS,
  });

  assertEquals(state.options.boardSize, 15);
  assertEquals(state.board.length, 225);
  assertEquals(state.currentPlayer, 0);
  assertEquals(state.moveCount, 0);
  assertEquals(state.lastMove, null);
  assertEquals(caroEngine.isTerminal(state).over, false);
});

Deno.test('2. [Deno Engine] Đánh 5 nước đi luân phiên hợp lệ', () => {
  let state = caroEngine.init({
    playerCount: 2,
    options: DEFAULT_CARO_OPTIONS,
  });

  const moves = [
    { cell: 112, player: 0 },
    { cell: 113, player: 1 },
    { cell: 97, player: 0 },
    { cell: 98, player: 1 },
    { cell: 127, player: 0 },
  ] as const;

  for (const { cell, player } of moves) {
    state = caroEngine.applyMove(state, cell, player);
  }

  assertEquals(state.moveCount, 5);
  assertEquals(state.lastMove, 127);
  assertEquals(state.currentPlayer, 1); // 5 nước: 0 -> 1 -> 0 -> 1 -> 0 -> 1
  assertEquals(state.board[112], 0);
  assertEquals(state.board[113], 1);
  assertEquals(state.board[97], 0);
  assertEquals(state.board[98], 1);
  assertEquals(state.board[127], 0);
});

Deno.test('3. [Deno Engine] Thẩm định 5 quân thắng hàng ngang (Win Check & Terminal)', () => {
  let state = caroEngine.init({
    playerCount: 2,
    options: {
      boardSize: 15,
      winLength: 5,
      blockedTwoEndsRule: false,
      allowOverline: true,
    },
  });

  // Seat 0: hàng 7 (ô 105, 106, 107, 108, 109)
  // Seat 1: hàng 8 (ô 120, 121, 122, 123)
  state = caroEngine.applyMove(state, 105, 0); // X: (7, 0)
  state = caroEngine.applyMove(state, 120, 1); // O: (8, 0)
  state = caroEngine.applyMove(state, 106, 0); // X: (7, 1)
  state = caroEngine.applyMove(state, 121, 1); // O: (8, 1)
  state = caroEngine.applyMove(state, 107, 0); // X: (7, 2)
  state = caroEngine.applyMove(state, 122, 1); // O: (8, 2)
  state = caroEngine.applyMove(state, 108, 0); // X: (7, 3)
  state = caroEngine.applyMove(state, 123, 1); // O: (8, 3)
  state = caroEngine.applyMove(state, 109, 0); // X: (7, 4) -> 5 quân liên tiếp!

  const terminal = caroEngine.isTerminal(state);
  assertEquals(terminal.over, true);
  assertEquals(terminal.outcomes?.[0].outcome, 'win');
  assertEquals(terminal.outcomes?.[1].outcome, 'loss');

  // Kiểm tra hàm checkWinAt độc lập
  const winResult = checkWinAt(state.board, 15, 109, state.options);
  assertNotEquals(winResult, null);
  assertEquals(winResult?.winner, 0);
  assertEquals(winResult?.line.length, 5);
});

Deno.test('4. [Deno Engine] Tuần tự hóa nén RLE (Serialize / Deserialize Round-trip)', () => {
  let state = caroEngine.init({
    playerCount: 2,
    options: DEFAULT_CARO_OPTIONS,
  });

  state = caroEngine.applyMove(state, 112, 0);
  state = caroEngine.applyMove(state, 113, 1);
  state = caroEngine.applyMove(state, 97, 0);

  const serialized = caroEngine.serialize(state);
  assertNotEquals(serialized.length, 0);

  const restoredState = caroEngine.deserialize(serialized);

  assertEquals(restoredState.options.boardSize, state.options.boardSize);
  assertEquals(restoredState.moveCount, state.moveCount);
  assertEquals(restoredState.lastMove, state.lastMove);
  assertEquals(restoredState.currentPlayer, state.currentPlayer);
  assertEquals(Array.from(restoredState.board), Array.from(state.board));
});

Deno.test('5. [Deno MovesCodec] Mã hóa và giải mã chuỗi nước đi CSV', () => {
  const codec = new CaroMovesCodec();
  const rawMoves = [112, 113, 97, 98, 127];

  const encoded = codec.encodeMoves(rawMoves);
  assertEquals(encoded, '112,113,97,98,127');

  const decoded = codec.decodeMoves(encoded);
  assertEquals(decoded, rawMoves);

  // Chuỗi rỗng cho ván 0 nước đi
  assertEquals(codec.encodeMoves([]), '');
  assertEquals(codec.decodeMoves(''), []);
});
