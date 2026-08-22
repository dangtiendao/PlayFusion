/**
 * ==============================================================================
 * HELLO REFEREE EDGE FUNCTION (SUPABASE/FUNCTIONS/HELLO-REFEREE/INDEX.TS)
 * ==============================================================================
 *
 * MỤC TIÊU & KIỂM CHỨNG (PHASE P3.2A):
 * 1. XÁC THỰC JWT: Yêu cầu Header Authorization Bearer token hợp lệ.
 * 2. KIỂM CHỨNG ENGINE TRONG DENO:
 *    - Import trực tiếp Game Engine TS thuần từ `packages/engines/caro/engine.ts`.
 *    - Khởi tạo bàn cờ 15x15 và thực hiện 1 nước đi mẫu.
 *    - Trả về JSON chuẩn `{ ok: true, data: { userId, moveCount, lastMove, deno } }`.
 * 3. GHI CHÚ NỢ KỸ THUẬT:
 *    - Function mẫu này dùng để nghiệm thu kết nối Deno & Engine ở P3.2a,
 *      sẽ được kế thừa và thay thế bởi Edge Function `submit_move` thật ở Phase P3.2c.
 * ==============================================================================
 */

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { getUserFromRequest } from '../_shared/supabaseAdmin.ts';
import { caroEngine } from '../../../packages/engines/caro/engine.ts';
import { DEFAULT_CARO_OPTIONS } from '../../../packages/engines/caro/types.ts';

Deno.serve(async (req: Request) => {
  // 1. Xử lý preflight CORS request
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 2. Xác thực JWT người dùng từ Authorization Header
    const { user, error: authError } = await getUserFromRequest(req);
    if (!user) {
      return errorResponse(
        'UNAUTHORIZED',
        authError || 'Yêu cầu Bearer JWT token hợp lệ để truy cập.',
        401,
      );
    }

    // 3. Thực thi kiểm chứng Game Engine trực tiếp trong Deno Runtime
    const initialState = caroEngine.init({
      playerCount: 2,
      options: DEFAULT_CARO_OPTIONS,
    });

    // Đi thử nước cờ đầu tiên tại trung tâm bàn cờ (ô 112: hàng 7, cột 7) của Player 0
    const centerCell = 7 * 15 + 7; // 112
    const nextState = caroEngine.applyMove(initialState, centerCell, 0);

    // 4. Trả về Response chuẩn JSON
    return successResponse({
      userId: user.id,
      email: user.email ?? null,
      moveCount: nextState.moveCount,
      lastMove: nextState.lastMove,
      currentPlayer: nextState.currentPlayer,
      deno: Deno.version.deno,
      engineVerified: true,
    });
  } catch (err) {
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      err instanceof Error ? err.message : String(err),
      500,
    );
  }
});
