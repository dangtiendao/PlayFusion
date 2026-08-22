/**
 * ==============================================================================
 * E2E INTEGRATION TEST: TRỌNG TÀI SERVER-SIDE TRÊN MÔI TRƯỜNG DEV THẬT
 * (TESTS/INTEGRATION/REFEREE.INTEGRATION.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM CHỨNG TOÀN DIỆN (PHASE P3.2D):
 * 1. 2 User thật (User A - Seat 0, User B - Seat 1) tạo trận đấu online qua RPC create_test_online_match.
 * 2. Khởi tạo Action 'init' qua Edge Function referee.
 * 3. User A đi nước 1 -> User B nhận thông điệp Broadcast 'move_accepted' (TransportEnvelope v1).
 * 4. User A đi sai lượt -> Bị từ chối 403 WRONG_TURN.
 * 5. User A gửi lặp nước cũ -> Nhận 200 duplicate: true mà không thay đổi thế cờ.
 * 6. Khóa lạc quan (Optimistic Locking) trên DB thật: 2 request song song cùng expectedMoveIndex
 *    -> Đúng 1 request được chấp thuận, request còn lại bị từ chối 409 STALE_CLIENT.
 * 7. Đánh trọn ván đến nước thắng -> matches finalize, match_live_state xóa, participants có is_winner.
 * ==============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupRlsTestContext,
  cleanupRlsTestContext,
  isRlsTestConfigured,
  userAClient,
  userBClient,
  serviceClient,
  userBId,
} from '../rls/setup';

describe.runIf(isRlsTestConfigured())(
  'Referee Server-side End-to-End Integration Tests (P3.2d - DEV Database)',
  () => {
    let matchId = '';

    beforeAll(async () => {
      await setupRlsTestContext();
    });

    afterAll(async () => {
      // Dọn dẹp dữ liệu trận đấu test nếu có
      if (matchId) {
        await serviceClient.from('match_live_state').delete().eq('match_id', matchId);
        await serviceClient.from('match_participants').delete().eq('match_id', matchId);
        await serviceClient.from('matches').delete().eq('id', matchId);
      }
      await cleanupRlsTestContext();
    });

    it('1. Tạo trận online 1v1 qua RPC và khởi tạo referee init', async () => {
      // 1.1 Tạo trận đấu giữa User A và User B
      const { data: createdMatchId, error: rpcError } = await userAClient.rpc(
        'create_test_online_match',
        { p_opponent_id: userBId },
      );

      expect(rpcError).toBeNull();
      expect(createdMatchId).toBeTruthy();
      matchId = createdMatchId as string;

      // 1.2 Gọi action 'init' từ User A
      const { data: initRes, error: initErr } = await userAClient.functions.invoke('referee', {
        body: { action: 'init', matchId },
      });

      expect(initErr).toBeNull();
      expect(initRes.ok).toBe(true);
      expect(initRes.data.moveIndex).toBe(0);
      expect(initRes.data.currentSeat).toBe(0);
      expect(initRes.data.stateSerialized).toBeTruthy();

      // Kiểm tra DB: match_live_state đã được tạo với move_index = 0
      const { data: liveState } = await serviceClient
        .from('match_live_state')
        .select('*')
        .eq('match_id', matchId)
        .single();

      expect(liveState).toBeTruthy();
      expect(liveState.move_index).toBe(0);
      expect(liveState.current_seat).toBe(0);
    });

    it('2. User A đánh nước 1 -> accepted; User B nhận Broadcast move_accepted', async () => {
      // 2.1 Thiết lập kênh Realtime cho User B để lắng nghe broadcast
      const channelB = userBClient.channel(`match:${matchId}`);
      let broadcastReceived: Record<string, unknown> | null = null;

      channelB.on('broadcast', { event: 'move_accepted' }, (payload) => {
        broadcastReceived = payload;
      });

      await channelB.subscribe();

      // Chờ kênh kết nối ổn định (1s)
      await new Promise((r) => setTimeout(r, 1000));

      // 2.2 User A gửi nước đi đầu tiên (ô 112, expectedMoveIndex = 0)
      const { data: moveRes, error: moveErr } = await userAClient.functions.invoke('referee', {
        body: {
          action: 'move',
          matchId,
          moveSerialized: '112',
          expectedMoveIndex: 0,
        },
      });

      expect(moveErr).toBeNull();
      expect(moveRes.ok).toBe(true);
      expect(moveRes.data.moveIndex).toBe(1);
      expect(moveRes.data.currentSeat).toBe(1);

      // Chờ thông điệp Broadcast đến User B
      await new Promise((r) => setTimeout(r, 1500));

      expect(broadcastReceived).toBeTruthy();
      const envelope = broadcastReceived as unknown as {
        payload?: { payload?: { moveIndex?: number; moveSerialized?: string } };
      };
      // Kiểm tra payload broadcast
      expect(
        envelope?.payload?.payload?.moveIndex === 1 ||
          (broadcastReceived as { moveIndex?: number })?.moveIndex === 1,
      ).toBe(true);

      await userBClient.removeChannel(channelB);
    });

    it('3. User A gửi sai lượt -> bị từ chối WRONG_TURN (403)', async () => {
      // Đang là lượt của User B (Seat 1), User A cố tình gửi nước đi tiếp
      const { data: wrongTurnRes, error: wrongTurnErr } = await userAClient.functions.invoke(
        'referee',
        {
          body: {
            action: 'move',
            matchId,
            moveSerialized: '113',
            expectedMoveIndex: 1,
          },
        },
      );

      // Có thể nhận data={ok:false, error:{code:'WRONG_TURN'}} hoặc FunctionsHttpError
      if (wrongTurnRes) {
        expect(wrongTurnRes.ok).toBe(false);
        expect(wrongTurnRes.error.code).toBe('WRONG_TURN');
      } else {
        expect(wrongTurnErr).toBeTruthy();
      }
    });

    it('4. User A gửi lại nước cũ (expectedMoveIndex = 0) -> nhận 200 duplicate: true', async () => {
      const { data: dupRes, error: dupErr } = await userAClient.functions.invoke('referee', {
        body: {
          action: 'move',
          matchId,
          moveSerialized: '112',
          expectedMoveIndex: 0,
        },
      });

      expect(dupErr).toBeNull();
      expect(dupRes.ok).toBe(true);
      expect(dupRes.data.duplicate).toBe(true);
      expect(dupRes.data.moveIndex).toBe(1);
      expect(dupRes.data.currentSeat).toBe(1);
    });

    it('5. Khóa lạc quan chống xung đột: 2 request song song cùng expectedMoveIndex', async () => {
      // Hiện tại đang ở move_index = 1, đến lượt User B.
      // Giả lập User B bấm 2 lần siêu nhanh (2 request song song cùng expectedMoveIndex = 1)
      const req1 = userBClient.functions.invoke('referee', {
        body: {
          action: 'move',
          matchId,
          moveSerialized: '113',
          expectedMoveIndex: 1,
        },
      });

      const req2 = userBClient.functions.invoke('referee', {
        body: {
          action: 'move',
          matchId,
          moveSerialized: '114',
          expectedMoveIndex: 1,
        },
      });

      const [res1, res2] = await Promise.all([req1, req2]);

      const isRes1Accepted = res1.data?.ok === true && res1.data?.data?.duplicate !== true;
      const isRes2Accepted = res2.data?.ok === true && res2.data?.data?.duplicate !== true;

      // Chứng minh: Đúng 1 trong 2 request được chấp thuận áp dụng
      expect((isRes1Accepted && !isRes2Accepted) || (!isRes1Accepted && isRes2Accepted)).toBe(true);

      // Request thua cuộc đua nhận duplicate: true hoặc STALE_CLIENT
      const loserRes = isRes1Accepted ? res2 : res1;
      if (loserRes.data) {
        expect(
          loserRes.data.data?.duplicate === true ||
            loserRes.data.error?.code === 'STALE_CLIENT' ||
            loserRes.data.ok === false,
        ).toBe(true);
      }
    });

    it('6. Đánh tiếp đến khi thắng ván -> matches finalize, live_state bị xóa', async () => {
      // Đọc trạng thái hiện tại để biết moveIndex kế tiếp
      const { data: currentState } = await serviceClient
        .from('match_live_state')
        .select('*')
        .eq('match_id', matchId)
        .single();

      expect(currentState).toBeTruthy();
      let currentMoveIndex = currentState.move_index; // 2

      // Kịch bản nước đi hoàn tất ván đấu cho User A (Seat 0):
      // Đã có X: 112. O: 113 (hoặc 114).
      // Tiếp tục đánh X: 97, 82, 67, 52 (hàng dọc cột 7)
      const sequence = [
        { client: userAClient, seat: 0, cell: '97' },
        { client: userBClient, seat: 1, cell: '128' },
        { client: userAClient, seat: 0, cell: '82' },
        { client: userBClient, seat: 1, cell: '129' },
        { client: userAClient, seat: 0, cell: '67' },
        { client: userBClient, seat: 1, cell: '130' },
        { client: userAClient, seat: 0, cell: '52' }, // Nước cờ thứ 5 liên tiếp -> Thắng!
      ];

      let lastMoveRes: Record<string, unknown> | null = null;

      for (const step of sequence) {
        const { data, error } = await step.client.functions.invoke('referee', {
          body: {
            action: 'move',
            matchId,
            moveSerialized: step.cell,
            expectedMoveIndex: currentMoveIndex,
          },
        });

        expect(error).toBeNull();
        expect(data.ok).toBe(true);

        currentMoveIndex = data.data.moveIndex;
        lastMoveRes = data;
      }

      // 6.1 Kiểm tra response nước cuối cùng có terminal thắng
      const winData = lastMoveRes as unknown as {
        data: {
          terminal: {
            over: boolean;
            outcomes: { playerIndex: number; outcome: string }[];
          };
        };
      };
      expect(winData.data.terminal).toBeTruthy();
      expect(winData.data.terminal.over).toBe(true);
      expect(winData.data.terminal.outcomes[0].outcome).toBe('win');
      expect(winData.data.terminal.outcomes[1].outcome).toBe('loss');

      // 6.2 Kiểm tra bảng matches đã được kết thúc
      const { data: finalMatch } = await serviceClient
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      expect(finalMatch.ended_at).not.toBeNull();
      expect(finalMatch.final_state).toBeTruthy();
      expect(finalMatch.moves).toBeTruthy();

      // 6.3 Kiểm tra bảng match_participants có kết quả thắng/thua
      const { data: participants } = await serviceClient
        .from('match_participants')
        .select('*')
        .eq('match_id', matchId)
        .order('seat_index', { ascending: true });

      expect(participants).toHaveLength(2);
      expect(participants?.[0].is_winner).toBe(true);
      expect(participants?.[1].is_winner).toBe(false);

      // 6.4 Kiểm tra bảng match_live_state đã được xóa sạch
      const { data: deletedLiveState } = await serviceClient
        .from('match_live_state')
        .select('*')
        .eq('match_id', matchId)
        .maybeSingle();

      expect(deletedLiveState).toBeNull();
    });
  },
);
