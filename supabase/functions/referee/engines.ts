/**
 * ==============================================================================
 * SERVER-SIDE GAME ENGINE REGISTRY (SUPABASE/FUNCTIONS/REFEREE/ENGINES.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & QUY TẮC BẤT BIẾN:
 * 1. Đây là Bảng Ánh Xạ Registry phía server — Thêm game online mới = Thêm 1 dòng tại đây
 *    kèm client registry (src/games/registry.ts); Tuyệt đối KHÔNG dùng `if (gameId === ...)` rải rác.
 * 2. Đảm bảo triết lý Kiến trúc Plugin trong giới hạn bundling của Deno runtime.
 * ==============================================================================
 */

import type { Engine, MovesCodec } from '../../../packages/engines/types/index.ts';
import { caroEngine } from '../../../packages/engines/caro/engine.ts';
import { CaroMovesCodec } from '../../../packages/engines/caro/moves-codec.ts';
import { DEFAULT_CARO_OPTIONS } from '../../../packages/engines/caro/types.ts';

export interface GameEngineModule<S = unknown, M = unknown> {
  readonly engine: Engine<S, M>;
  readonly movesCodec: MovesCodec<M>;
  readonly defaultOptions?: Record<string, unknown>;
  readonly parseMove: (moveSerialized: string) => M;
}

const caroMovesCodec = new CaroMovesCodec();

const SERVER_ENGINE_REGISTRY: Record<string, GameEngineModule<unknown, unknown>> = {
  caro: {
    engine: caroEngine as Engine<unknown, unknown>,
    movesCodec: caroMovesCodec as MovesCodec<unknown>,
    defaultOptions: DEFAULT_CARO_OPTIONS,
    parseMove: (moveSerialized: string): unknown => {
      const trimmed = moveSerialized.trim();
      if (!/^\d+$/.test(trimmed)) {
        throw new Error(
          `Nước đi cờ Caro không hợp lệ: "${moveSerialized}". Yêu cầu chỉ số ô cờ nguyên không âm.`,
        );
      }
      return parseInt(trimmed, 10);
    },
  },
};

/**
 * Nạp module Game Engine phía server theo gameId.
 * @returns GameEngineModule hoặc null nếu gameId chưa được đăng ký.
 */
export function getGameEngineModule(gameId: string): GameEngineModule | null {
  return SERVER_ENGINE_REGISTRY[gameId] ?? null;
}
