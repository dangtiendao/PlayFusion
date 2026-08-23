/**
 * ==============================================================================
 * EDGE FUNCTION TRỌNG TÀI SERVER-SIDE (SUPABASE/FUNCTIONS/REFEREE/INDEX.TS)
 * ==============================================================================
 *
 * MỤC TIÊU & NHIỆM VỤ:
 * 1. TIẾP NHẬN REQUEST:
 *    - POST body:
 *      + { action: 'init', matchId }
 *      + { action: 'move', matchId, moveSerialized, expectedMoveIndex }
 *      + { action: 'resign', matchId } (P3.4b)
 *      + { action: 'claim_timeout', matchId } (P3.4b)
 * 2. XÁC THỰC AUTH JWT:
 *    - Trích xuất user từ Authorization Bearer header.
 * 3. KẾT NỐI DB & REALTIME:
 *    - Sử dụng Supabase Service Role Key để đọc/ghi DB bỏ qua RLS sau khi đã thẩm định bằng TS Engine.
 *    - Phát sóng Broadcast qua TransportEnvelope (v=1), hủy channel ngay lập tức sau khi gửi.
 * 4. LOG TRUY VẾT 1 DÒNG:
 *    - In console.log(JSON.stringify({ fn: 'referee', action, matchId, userId, moveIndex, outcome, ms }))
 * ==============================================================================
 */

import { handleCors } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/response.ts';
import { createAdminClient, getUserFromRequest } from '../_shared/supabaseAdmin.ts';
import {
  handleInitAction,
  handleMoveAction,
  handleResignAction,
  handleClaimTimeoutAction,
  type RefereeDependencies,
  type MatchRecord,
  type ParticipantRecord,
  type LiveStateRecord,
} from './core.ts';

Deno.serve(async (req: Request) => {
  // 1. Xử lý preflight CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Chỉ hỗ trợ phương thức POST.', 405);
  }

  // 2. Xác thực phiên người dùng từ Authorization Header
  const { user, error: authError } = await getUserFromRequest(req);
  if (!user) {
    return errorResponse(
      'UNAUTHORIZED',
      authError || 'Yêu cầu Authorization Bearer token hợp lệ.',
      401,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('BAD_REQUEST', 'Body request phải là JSON hợp lệ.', 400);
  }

  const { action, matchId, moveSerialized, expectedMoveIndex } = body;
  const adminClient = createAdminClient();

  // 3. Chuẩn bị Dependencies Inject cho logic Core
  const dependencies: RefereeDependencies = {
    loadSystemConfig: async (key: string) => {
      const { data } = await adminClient
        .from('system_config')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      return (data?.value as Record<string, unknown>) || null;
    },

    loadMatchAndParticipants: async (id: string) => {
      const { data: matchData } = await adminClient
        .from('matches')
        .select('*')
        .eq('id', id)
        .single();

      const { data: participantsData } = await adminClient
        .from('match_participants')
        .select('*')
        .eq('match_id', id);

      return {
        match: (matchData as MatchRecord) || null,
        participants: (participantsData as ParticipantRecord[]) || [],
      };
    },

    loadLiveState: async (id: string) => {
      const { data } = await adminClient
        .from('match_live_state')
        .select('*')
        .eq('match_id', id)
        .maybeSingle();

      return (data as LiveStateRecord) || null;
    },

    insertLiveState: async (record) => {
      const { error } = await adminClient.from('match_live_state').insert({
        match_id: record.match_id,
        state_serialized: record.state_serialized,
        move_index: record.move_index,
        current_seat: record.current_seat,
        moves_serialized: record.moves_serialized,
        clock: record.clock || null,
        turn_started_at: record.turn_started_at || null,
        turn_deadline: record.turn_deadline || null,
      });

      if (error) throw new Error(`Lỗi khi khởi tạo match_live_state: ${error.message}`);
    },

    updateLiveStateOptimistic: async (record) => {
      const updateData: Record<string, unknown> = {
        state_serialized: record.state_serialized,
        move_index: record.next_move_index,
        current_seat: record.current_seat,
        moves_serialized: record.moves_serialized,
        updated_at: new Date().toISOString(),
      };
      if (record.clock !== undefined) updateData.clock = record.clock;
      if (record.turn_started_at !== undefined) updateData.turn_started_at = record.turn_started_at;
      if (record.turn_deadline !== undefined) updateData.turn_deadline = record.turn_deadline;

      const { data, error } = await adminClient
        .from('match_live_state')
        .update(updateData)
        .eq('match_id', record.match_id)
        .eq('move_index', record.expected_move_index)
        .select();

      if (error) {
        throw new Error(`Lỗi khi cập nhật match_live_state: ${error.message}`);
      }

      return Array.isArray(data) && data.length === 1;
    },

    finalizeMatch: async (id, finalData, participantsResult) => {
      const { error: matchErr } = await adminClient
        .from('matches')
        .update({
          ended_at: finalData.ended_at,
          duration_ms: finalData.duration_ms,
          final_state: finalData.final_state,
          moves: finalData.moves,
          end_reason: finalData.end_reason,
        })
        .eq('id', id);

      if (matchErr) throw new Error(`Lỗi khi kết thúc matches: ${matchErr.message}`);

      for (const p of participantsResult) {
        await adminClient
          .from('match_participants')
          .update({ is_winner: p.is_winner })
          .eq('match_id', id)
          .eq('user_id', p.user_id);
      }
    },

    deleteLiveState: async (id: string) => {
      await adminClient.from('match_live_state').delete().eq('match_id', id);
    },

    broadcast: async (id: string, eventType: string, payload: unknown) => {
      const channel = adminClient.channel(`match:${id}`);
      await channel.send({
        type: 'broadcast',
        event: eventType,
        payload: {
          v: 1,
          type: eventType,
          senderId: 'server',
          sentAt: new Date().toISOString(),
          payload,
        },
      });

      // Hủy channel ngay lập tức để không giữ kết nối ngầm trong Edge Function
      await adminClient.removeChannel(channel);
    },

    log: (entry) => {
      console.log(JSON.stringify(entry));
    },
  };

  // 4. Điều hướng Action
  if (action === 'init') {
    const result = await handleInitAction(user.id, matchId as string, dependencies);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (action === 'move') {
    const result = await handleMoveAction(
      user.id,
      {
        matchId: matchId as string,
        moveSerialized: String(moveSerialized ?? ''),
        expectedMoveIndex: Number(expectedMoveIndex),
      },
      dependencies,
    );
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (action === 'resign') {
    const result = await handleResignAction(user.id, { matchId: matchId as string }, dependencies);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (action === 'claim_timeout') {
    const result = await handleClaimTimeoutAction(
      user.id,
      { matchId: matchId as string },
      dependencies,
    );
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return errorResponse(
    'BAD_ACTION',
    `Action "${action}" không được hỗ trợ (chỉ hỗ trợ "init", "move", "resign", hoặc "claim_timeout").`,
    400,
  );
});
