import type { Engine, EngineInitConfig, PlayerIndex, TerminalResult } from '../types';
import { EngineError } from '../types';
import type { CaroMove, CaroOptions, CaroState } from './types';
import { DEFAULT_CARO_OPTIONS } from './types';

/**
 * ==============================================================================
 * CARO GAME ENGINE (ENGINE CỜ CARO / GOMOKU THUẦN TÚY)
 * ==============================================================================
 *
 * TÀI LIỆU KỸ THUẬT & QUY TẮC BẤT BIẾN:
 * 1. File này là TypeScript thuần túy (Pure TS), KHÔNG import React, DOM hay browser APIs.
 * 2. Triển khai interface `Engine<CaroState, CaroMove>` từ `@engines/types`.
 * 3. Chạy được trên cả 3 môi trường:
 *    - Client UI (React View P1.3)
 *    - Web Worker AI (P1.2)
 *    - Server Edge Function Supabase / Deno (P3.2 Trọng tài xác thực)
 *
 * ĐỊNH DẠNG TUẦN TỰ HÓA NÉN (SERIALIZATION SPECIFICATION):
 * Chuỗi nén trạng thái gồm 9 phần ngăn cách bởi dấu hai chấm `:`:
 *   v1:<boardSize>:<winLength>:<blockedTwoEnds>:<allowOverline>:<currentPlayer>:<moveCount>:<lastMove>:<boardRLE>
 *
 * - v1: Tiền tố phiên bản định dạng.
 * - boardSize: Kích thước cạnh bàn cờ vuông (5..25).
 * - winLength: Số quân liên tiếp để thắng (3..boardSize).
 * - blockedTwoEnds: Cờ chặn 2 đầu (1 = bật, 0 = tắt).
 * - allowOverline: Cờ cho phép 6+ quân thắng (1 = bật, 0 = tắt).
 * - currentPlayer: Chỉ số ghế người chơi đến lượt (0 hoặc 1).
 * - moveCount: Tổng số nước đi đã thực hiện.
 * - lastMove: Flat index của nước đi gần nhất (-1 nếu chưa có nước nào).
 * - boardRLE: Chuỗi mã hóa độ dài loạt (Run-Length Encoding) của mảng bàn cờ:
 *     '.' = ô trống (-1), 'x' = quân Seat 0 (0), 'o' = quân Seat 1 (1).
 *     Cú pháp: <số lượng><ký tự> (nếu > 1) hoặc <ký tự> (nếu = 1).
 *     Ví dụ: "225." biểu diễn bàn 15x15 trống 225 ô; "50.x2.o171." biểu diễn 2 quân cờ.
 * ==============================================================================
 */

/**
 * Triển khai Caro Game Engine.
 */
export const caroEngine: Engine<CaroState, CaroMove> = {
  /**
   * Khởi tạo trạng thái bàn cờ ban đầu.
   */
  init(config: EngineInitConfig): CaroState {
    // 1. Kiểm tra số lượng người chơi (Cờ Caro bắt buộc là 2 người đối kháng)
    if (config.playerCount !== 2) {
      throw new EngineError(
        'INVALID_STATE',
        `Cờ Caro chỉ hỗ trợ chính xác 2 người chơi (playerCount = 2), nhận được: ${config.playerCount}.`,
      );
    }

    // 2. Trích xuất cấu hình tùy chọn với giá trị mặc định
    const boardSize =
      typeof config.options?.boardSize === 'number'
        ? config.options.boardSize
        : DEFAULT_CARO_OPTIONS.boardSize;
    const winLength =
      typeof config.options?.winLength === 'number'
        ? config.options.winLength
        : DEFAULT_CARO_OPTIONS.winLength;
    const blockedTwoEndsRule =
      typeof config.options?.blockedTwoEndsRule === 'boolean'
        ? config.options.blockedTwoEndsRule
        : DEFAULT_CARO_OPTIONS.blockedTwoEndsRule;
    const allowOverline =
      typeof config.options?.allowOverline === 'boolean'
        ? config.options.allowOverline
        : DEFAULT_CARO_OPTIONS.allowOverline;

    // 3. Kiểm định tính hợp lệ của options
    if (!Number.isInteger(boardSize) || boardSize < 5 || boardSize > 25) {
      throw new EngineError(
        'INVALID_STATE',
        `Kích thước bàn cờ (boardSize) phải là số nguyên từ 5 đến 25, nhận được: ${boardSize}.`,
      );
    }

    if (!Number.isInteger(winLength) || winLength < 3 || winLength > boardSize) {
      throw new EngineError(
        'INVALID_STATE',
        `Chiều dài chuỗi thắng (winLength) phải là số nguyên từ 3 đến ${boardSize}, nhận được: ${winLength}.`,
      );
    }

    const options: CaroOptions = {
      boardSize,
      winLength,
      blockedTwoEndsRule,
      allowOverline,
    };

    // 4. Khởi tạo mảng bàn cờ 1D toàn bộ ô trống (-1)
    const totalCells = boardSize * boardSize;
    const board = new Array<number>(totalCells).fill(-1);

    return {
      board,
      currentPlayer: 0,
      moveCount: 0,
      lastMove: null,
      options,
    };
  },

  /**
   * Lấy chỉ số ghế của người chơi đang đến lượt đi.
   */
  currentPlayer(state: CaroState): PlayerIndex {
    return state.currentPlayer;
  },

  /**
   * Liệt kê danh sách các nước đi hợp lệ.
   * Lưu ý kiến trúc: Sẽ được hoàn thiện tại Phase P1.1b.
   */
  legalMoves(): CaroMove[] {
    throw new EngineError('INVALID_STATE', 'Chưa triển khai — P1.1b');
  },

  /**
   * Thực hiện nước đi và trả về trạng thái bàn cờ mới (Immutable).
   * Lưu ý kiến trúc: Sẽ được hoàn thiện tại Phase P1.1b.
   */
  applyMove(): CaroState {
    throw new EngineError('INVALID_STATE', 'Chưa triển khai — P1.1b');
  },

  /**
   * Kiểm tra ván cờ đã kết thúc hay chưa và tính toán kết quả chi tiết.
   * Lưu ý kiến trúc: Sẽ được hoàn thiện tại Phase P1.1c.
   */
  isTerminal(): TerminalResult {
    throw new EngineError('INVALID_STATE', 'Chưa triển khai — P1.1c');
  },

  /**
   * Nén trạng thái bàn cờ thành chuỗi string siêu gọn nhẹ (Header + RLE Board).
   */
  serialize(state: CaroState): string {
    const { boardSize, winLength, blockedTwoEndsRule, allowOverline } = state.options;

    // 1. Nén mảng 1D của bàn cờ bằng thuật toán Run-Length Encoding (RLE)
    let rle = '';
    let currentChar = '';
    let count = 0;

    for (const cell of state.board) {
      const char = cell === 0 ? 'x' : cell === 1 ? 'o' : '.';
      if (char === currentChar) {
        count++;
      } else {
        if (currentChar !== '') {
          rle += count > 1 ? `${count}${currentChar}` : currentChar;
        }
        currentChar = char;
        count = 1;
      }
    }
    if (currentChar !== '') {
      rle += count > 1 ? `${count}${currentChar}` : currentChar;
    }

    // 2. Định dạng header
    const lastMoveFormatted = state.lastMove !== null ? state.lastMove : -1;
    const blockedFormatted = blockedTwoEndsRule ? 1 : 0;
    const overlineFormatted = allowOverline ? 1 : 0;

    return `v1:${boardSize}:${winLength}:${blockedFormatted}:${overlineFormatted}:${state.currentPlayer}:${state.moveCount}:${lastMoveFormatted}:${rle}`;
  },

  /**
   * Giải mã chuỗi string nén trở lại thành CaroState với kiểm thực toàn vẹn chặt chẽ.
   */
  deserialize(data: string): CaroState {
    if (typeof data !== 'string' || data.trim().length === 0) {
      throw new EngineError('INVALID_STATE', 'Chuỗi dữ liệu giải mã không được để trống.');
    }

    const parts = data.split(':');
    if (parts.length !== 9) {
      throw new EngineError(
        'INVALID_STATE',
        `Chuỗi serialization sai cấu trúc header (yêu cầu 9 trường, nhận được ${parts.length}).`,
      );
    }

    const [
      version,
      sizeStr,
      winStr,
      blockedStr,
      overlineStr,
      playerStr,
      moveCountStr,
      lastMoveStr,
      rleStr,
    ] = parts;

    // 1. Kiểm tra version
    if (version !== 'v1') {
      throw new EngineError(
        'INVALID_STATE',
        `Phiên bản serialization không được hỗ trợ: '${version}'.`,
      );
    }

    // 2. Parse & kiểm tra các thông số cấu hình và trạng thái
    const boardSize = Number(sizeStr);
    const winLength = Number(winStr);
    const blockedVal = Number(blockedStr);
    const overlineVal = Number(overlineStr);
    const currentPlayerVal = Number(playerStr);
    const moveCount = Number(moveCountStr);
    const lastMoveVal = Number(lastMoveStr);

    if (!Number.isInteger(boardSize) || boardSize < 5 || boardSize > 25) {
      throw new EngineError('INVALID_STATE', `Kích thước bàn cờ không hợp lệ: ${sizeStr}.`);
    }

    if (!Number.isInteger(winLength) || winLength < 3 || winLength > boardSize) {
      throw new EngineError('INVALID_STATE', `Chiều dài chuỗi thắng không hợp lệ: ${winStr}.`);
    }

    if (blockedVal !== 0 && blockedVal !== 1) {
      throw new EngineError('INVALID_STATE', `Cờ blockedTwoEndsRule phải là 0 hoặc 1.`);
    }

    if (overlineVal !== 0 && overlineVal !== 1) {
      throw new EngineError('INVALID_STATE', `Cờ allowOverline phải là 0 hoặc 1.`);
    }

    if (currentPlayerVal !== 0 && currentPlayerVal !== 1) {
      throw new EngineError(
        'INVALID_STATE',
        `Chỉ số người chơi hiện tại phải là 0 hoặc 1, nhận được: ${playerStr}.`,
      );
    }

    if (!Number.isInteger(moveCount) || moveCount < 0) {
      throw new EngineError(
        'INVALID_STATE',
        `Tổng số nước đi (moveCount) phải là số nguyên không âm: ${moveCountStr}.`,
      );
    }

    const totalCells = boardSize * boardSize;
    if (
      lastMoveVal !== -1 &&
      (!Number.isInteger(lastMoveVal) || lastMoveVal < 0 || lastMoveVal >= totalCells)
    ) {
      throw new EngineError('INVALID_STATE', `lastMove không hợp lệ: ${lastMoveStr}.`);
    }

    // 3. Giải nén chuỗi RLE của bàn cờ
    if (rleStr === undefined || rleStr.length === 0) {
      throw new EngineError('INVALID_STATE', 'Chuỗi RLE bàn cờ bị trống.');
    }

    const board: number[] = [];
    let numBuf = '';
    let countX = 0;
    let countO = 0;

    for (const ch of rleStr) {
      if (ch >= '0' && ch <= '9') {
        numBuf += ch;
      } else if (ch === '.' || ch === 'x' || ch === 'o') {
        const repeat = numBuf === '' ? 1 : parseInt(numBuf, 10);
        numBuf = '';
        if (repeat <= 0 || !Number.isInteger(repeat)) {
          throw new EngineError('INVALID_STATE', 'Số lần lặp RLE không hợp lệ.');
        }

        const cellVal = ch === 'x' ? 0 : ch === 'o' ? 1 : -1;
        if (cellVal === 0) countX += repeat;
        else if (cellVal === 1) countO += repeat;

        for (let r = 0; r < repeat; r++) {
          board.push(cellVal);
        }
      } else {
        throw new EngineError('INVALID_STATE', `Ký tự không hợp lệ trong chuỗi RLE: '${ch}'.`);
      }
    }

    if (numBuf !== '') {
      throw new EngineError(
        'INVALID_STATE',
        'Chuỗi RLE kết thúc dở dang với chữ số không có ký tự theo sau.',
      );
    }

    // 4. Kiểm tra độ dài bàn cờ
    if (board.length !== totalCells) {
      throw new EngineError(
        'INVALID_STATE',
        `Số ô cờ sau giải nén (${board.length}) không khớp kích thước bàn ${boardSize}x${boardSize} (${totalCells}).`,
      );
    }

    // 5. Kiểm tra tính bảo toàn số quân cờ so với moveCount
    const totalPieces = countX + countO;
    if (totalPieces !== moveCount) {
      throw new EngineError(
        'INVALID_STATE',
        `Tổng số quân cờ trên bàn (${totalPieces}) không khớp với moveCount (${moveCount}).`,
      );
    }

    // 6. Kiểm tra tính tương thích giữa tỷ lệ quân X/O và lượt đi (Seat 0 đi trước)
    if (currentPlayerVal === 0) {
      if (countX !== countO) {
        throw new EngineError(
          'INVALID_STATE',
          `Lượt đi là Player 0 nhưng số quân X (${countX}) không bằng số quân O (${countO}).`,
        );
      }
    } else {
      if (countX !== countO + 1) {
        throw new EngineError(
          'INVALID_STATE',
          `Lượt đi là Player 1 nhưng số quân X (${countX}) không nhiều hơn O (${countO}) đúng 1 quân.`,
        );
      }
    }

    // 7. Kiểm tra tính hợp lệ của lastMove đối chiếu với bàn cờ
    if (moveCount === 0) {
      if (lastMoveVal !== -1) {
        throw new EngineError(
          'INVALID_STATE',
          `Ván cờ chưa có nước đi (moveCount = 0) nhưng lastMove lại khác -1.`,
        );
      }
    } else if (lastMoveVal !== -1) {
      const pieceAtLastMove = board[lastMoveVal];
      if (pieceAtLastMove === -1) {
        throw new EngineError(
          'INVALID_STATE',
          `Vị trí lastMove (${lastMoveVal}) là ô trống trên bàn cờ.`,
        );
      }
      // Nước đi trước đó phải thuộc về đối thủ của currentPlayer hiện tại
      const previousPlayer = currentPlayerVal === 0 ? 1 : 0;
      if (pieceAtLastMove !== previousPlayer) {
        throw new EngineError(
          'INVALID_STATE',
          `Quân cờ tại lastMove (${lastMoveVal}) không thuộc về người vừa đánh (Player ${previousPlayer}).`,
        );
      }
    }

    return {
      board,
      currentPlayer: currentPlayerVal as PlayerIndex,
      moveCount,
      lastMove: lastMoveVal === -1 ? null : lastMoveVal,
      options: {
        boardSize,
        winLength,
        blockedTwoEndsRule: blockedVal === 1,
        allowOverline: overlineVal === 1,
      },
    };
  },
};
