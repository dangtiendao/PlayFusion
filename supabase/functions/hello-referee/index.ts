/**
 * ==============================================================================
 * HELLO REFEREE EDGE FUNCTION (SUPABASE/FUNCTIONS/HELLO-REFEREE/INDEX.TS)
 * ==============================================================================
 *
 * MỤC TIÊU:
 * - Healthcheck endpoint xác thực Auth JWT và kiểm tra runtime Deno.
 * ==============================================================================
 */

import { handleCors } from '../_shared/cors.ts';
import { successResponse, errorResponse } from '../_shared/response.ts';
import { getUserFromRequest } from '../_shared/supabaseAdmin.ts';

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

    // 3. Trả về Response chuẩn JSON
    return successResponse({
      userId: user.id,
      email: user.email ?? null,
      deno: Deno.version.deno,
      status: 'healthy',
    });
  } catch (err) {
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      err instanceof Error ? err.message : String(err),
      500,
    );
  }
});
