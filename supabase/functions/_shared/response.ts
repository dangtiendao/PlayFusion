/**
 * ==============================================================================
 * HELPER PHẢN HỒI JSON CHUẨN (SUPABASE/FUNCTIONS/_SHARED/RESPONSE.TS)
 * ==============================================================================
 *
 * QUY ƯỚC RESPONSE BẤT BIẾN CHO TOÀN BỘ EDGE FUNCTIONS:
 * 1. THÀNH CÔNG: { ok: true, data: T }
 * 2. THẤT BẠI: { ok: false, error: { code: string, message: string } }
 * 3. HEADERS: Luôn đính kèm CORS headers và Content-Type JSON UTF-8.
 * ==============================================================================
 */

import { corsHeaders } from './cors.ts';

export interface ApiResponseSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ApiResponseError {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

/**
 * Trả về Response thành công chuẩn `{ ok: true, data }`.
 */
export function successResponse<T>(data: T, status = 200): Response {
  const body: ApiResponseSuccess<T> = {
    ok: true,
    data,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

/**
 * Trả về Response lỗi chuẩn `{ ok: false, error: { code, message } }`.
 */
export function errorResponse(code: string, message: string, status = 400): Response {
  const body: ApiResponseError = {
    ok: false,
    error: {
      code,
      message,
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
