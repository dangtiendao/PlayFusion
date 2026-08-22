/**
 * ==============================================================================
 * CORS HEADERS CHO SUPABASE EDGE FUNCTIONS (SUPABASE/FUNCTIONS/_SHARED/CORS.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Cung cấp headers CORS chuẩn cho toàn bộ Edge Functions của PlayFusion.
 * - Cho phép Web Client (Cloudflare Pages và Localhost) gửi request kèm Bearer JWT.
 * ==============================================================================
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

/**
 * Xử lý preflight request OPTIONS nhanh chóng.
 * Trả về Response 200/204 nếu là method OPTIONS, ngược lại trả về null.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
