/**
 * ==============================================================================
 * E2E INTEGRATION TEST: KẾT TOÁN SETTLE & BẬT RANKED TRÊN DATABASE DEV THẬT
 * (TESTS/INTEGRATION/SETTLE.INTEGRATION.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM CHỨNG TOÀN DIỆN (PHASE P4.2D):
 * 1. TRẬN RANKED 1V1 REALTIME:
 *    - 2 User thật (User A & User B) tạo phòng và join phòng -> join_room tự gán is_ranked=true, season_id.
 *    - Đánh trọn ván Caro qua referee (User A thắng) -> referee tự động gọi settleMatch sau khi finalize.
 *    - Assert sau settle: matches.settled_at NOT NULL, player_ratings delta +-16, wins/losses/streak đúng,
 *      wallets +50/+5, ledger 2 dòng idempotency_key 'settle:{matchId}:{userId}', participants rating_delta +-16.
 * 2. DoD GỐC — RETRY 2 LẦN KHÔNG CỘNG TIỀN/ĐIỂM 2 LẦN:
 *    - service_role gọi trực tiếp RPC apply_match_settlement thêm 2 LẦN với cùng payload đã áp.
 *    - Cả 2 lần đều trả applied=false; SELECT đối chiếu TOÀN BỘ số liệu không đổi 1 đơn vị nào.
 * 3. VÁN ABORT (< 3 NƯỚC):
 *    - Resign ở nước 0 -> end_reason='abort' -> referee settle xử lý no-op đóng dấu settled_at, KHÔNG đổi rating/xu.
 * 4. VÁN CORRESPONDENCE RANKED:
 *    - Tạo phòng correspondence -> đánh >= 3 nước rồi resign -> referee settle chạy đúng như realtime.
 * 5. TEARDOWN:
 *    - Dọn dẹp sạch sẽ toàn bộ test users, rooms, matches, live_states, wallet_transactions và ratings.
 * ==============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupRlsTestContext,
  cleanupRlsTestContext,
  isRlsTestConfigured,
  userAClient,
  userBClient,
  userAId,
  userBId,
  serviceClient,
} from '../rls/setup';

describe.runIf(isRlsTestConfigured())(
  'Match Settlement End-to-End Integration Tests (P4.2d - DEV Database)',
  () => {
    const createdRoomCodes: string[] = [];
    const createdMatchIds: string[] = [];

    // Helper hàm chờ settled_at được cập nhật bởi Referee (tối đa maxWaitMs)
    const waitForSettledAt = async (matchId: string, maxWaitMs = 6000): Promise<string> => {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const { data: match } = await serviceClient
          .from('matches')
          .select('settled_at')
          .eq('id', matchId)
          .single();

        if (match?.settled_at) {
          return match.settled_at;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`Quá thời gian chờ settled_at cho matchId: ${matchId}`);
    };

    beforeAll(async () => {
      await setupRlsTestContext();
    });

    afterAll(async () => {
      // Dọn dẹp các match và room test đã tạo
      for (const mId of createdMatchIds) {
        await serviceClient.from('wallet_transactions').delete().eq('ref_id', mId);
        await serviceClient.from('match_live_state').delete().eq('match_id', mId);
        await serviceClient.from('match_participants').delete().eq('match_id', mId);
        await serviceClient.from('matches').delete().eq('id', mId);
      }
      for (const code of createdRoomCodes) {
        await serviceClient.from('rooms').delete().eq('code', code);
      }
      if (userAId) {
        await serviceClient.from('player_ratings').delete().eq('user_id', userAId);
        await serviceClient.from('wallets').delete().eq('user_id', userAId);
      }
      if (userBId) {
        await serviceClient.from('player_ratings').delete().eq('user_id', userBId);
        await serviceClient.from('wallets').delete().eq('user_id', userBId);
      }
      await cleanupRlsTestContext();
    });

    let rankedMatchId = '';

    it('1. Trận Ranked 1v1 Realtime: Đấu trọn ván Caro -> Referee tự động kết toán Settle thành công', async () => {
      // 1.1 Tạo phòng và tham gia phòng (Migration 0016 tự gán is_ranked=true, season_id)
      const { data: createRes, error: createErr } = await userAClient.rpc('create_room', {
        p_game_id: 'caro',
      });
      expect(createErr).toBeNull();
      const roomCode = createRes?.[0]?.code;
      expect(roomCode).toBeTruthy();
      createdRoomCodes.push(roomCode);

      const { data: joinRes, error: joinErr } = await userBClient.rpc('join_room', {
        p_code: roomCode,
      });
      expect(joinErr).toBeNull();
      rankedMatchId = joinRes?.[0]?.match_id;
      expect(rankedMatchId).toBeTruthy();
      createdMatchIds.push(rankedMatchId);

      // Kiểm tra trận mới tạo đã được bật Ranked và có season_id
      const { data: matchRecord } = await serviceClient
        .from('matches')
        .select('is_ranked, season_id, settled_at, game_id')
        .eq('id', rankedMatchId)
        .single();

      expect(matchRecord?.is_ranked).toBe(true);
      expect(matchRecord?.season_id).not.toBeNull();
      expect(matchRecord?.settled_at).toBeNull();
      const currentSeasonId = matchRecord?.season_id ?? 1;

      // 1.2 Khởi tạo ván qua Referee
      const { data: initRes, error: initErr } = await userAClient.functions.invoke('referee', {
        body: { action: 'init', matchId: rankedMatchId },
      });
      expect(initErr).toBeNull();
      expect(initRes?.ok).toBe(true);

      // 1.3 Đánh chuỗi 9 nước cờ Caro để User A thắng (5 quân liên tiếp cột 7: 112, 97, 82, 67, 52)
      const moveSequence = [
        { client: userAClient, cell: '112', expectedMoveIndex: 0 },
        { client: userBClient, cell: '127', expectedMoveIndex: 1 },
        { client: userAClient, cell: '97', expectedMoveIndex: 2 },
        { client: userBClient, cell: '128', expectedMoveIndex: 3 },
        { client: userAClient, cell: '82', expectedMoveIndex: 4 },
        { client: userBClient, cell: '129', expectedMoveIndex: 5 },
        { client: userAClient, cell: '67', expectedMoveIndex: 6 },
        { client: userBClient, cell: '130', expectedMoveIndex: 7 },
        { client: userAClient, cell: '52', expectedMoveIndex: 8 }, // Nước cờ chiến thắng!
      ];

      for (const step of moveSequence) {
        const { data, error } = await step.client.functions.invoke('referee', {
          body: {
            action: 'move',
            matchId: rankedMatchId,
            moveSerialized: step.cell,
            expectedMoveIndex: step.expectedMoveIndex,
          },
        });
        expect(error).toBeNull();
        expect(data?.ok).toBe(true);
      }

      // 1.4 Chờ và kiểm tra matches.settled_at được tự động đóng dấu
      const settledAt = await waitForSettledAt(rankedMatchId);
      expect(settledAt).toBeTruthy();

      // 1.5 Kiểm tra biến động điểm số trong match_participants (1200v1200 -> delta +-16)
      const { data: participants } = await serviceClient
        .from('match_participants')
        .select('*')
        .eq('match_id', rankedMatchId)
        .order('seat_index', { ascending: true });

      expect(participants).toHaveLength(2);
      const partA = participants?.[0];
      const partB = participants?.[1];

      expect(partA?.user_id).toBe(userAId);
      expect(partA?.is_winner).toBe(true);
      expect(partA?.rating_before).toBe(1200);
      expect(partA?.rating_after).toBe(1216);
      expect(partA?.rating_delta).toBe(16);

      expect(partB?.user_id).toBe(userBId);
      expect(partB?.is_winner).toBe(false);
      expect(partB?.rating_before).toBe(1200);
      expect(partB?.rating_after).toBe(1184);
      expect(partB?.rating_delta).toBe(-16);

      // 1.6 Kiểm tra bảng player_ratings
      const { data: ratingA } = await serviceClient
        .from('player_ratings')
        .select('*')
        .eq('user_id', userAId)
        .eq('game_id', 'caro')
        .eq('season_id', currentSeasonId)
        .single();

      expect(ratingA).toBeTruthy();
      expect(ratingA?.rating).toBe(1216);
      expect(ratingA?.games_played).toBe(1);
      expect(ratingA?.wins).toBe(1);
      expect(ratingA?.losses).toBe(0);
      expect(ratingA?.draws).toBe(0);
      expect(ratingA?.streak).toBe(1);
      expect(ratingA?.best_rating).toBe(1216);

      const { data: ratingB } = await serviceClient
        .from('player_ratings')
        .select('*')
        .eq('user_id', userBId)
        .eq('game_id', 'caro')
        .eq('season_id', currentSeasonId)
        .single();

      expect(ratingB).toBeTruthy();
      expect(ratingB?.rating).toBe(1184);
      expect(ratingB?.games_played).toBe(1);
      expect(ratingB?.wins).toBe(0);
      expect(ratingB?.losses).toBe(1);
      expect(ratingB?.draws).toBe(0);
      expect(ratingB?.streak).toBe(0);

      // 1.7 Kiểm tra ví xu wallets (Thắng: +50, Thua: +5)
      const { data: walletA } = await serviceClient
        .from('wallets')
        .select('*')
        .eq('user_id', userAId)
        .single();
      expect(walletA?.balance).toBe(50);

      const { data: walletB } = await serviceClient
        .from('wallets')
        .select('*')
        .eq('user_id', userBId)
        .single();
      expect(walletB?.balance).toBe(5);

      // 1.8 Kiểm tra sổ cái giao dịch wallet_transactions
      const { data: txRows } = await serviceClient
        .from('wallet_transactions')
        .select('*')
        .eq('ref_id', rankedMatchId)
        .order('created_at', { ascending: true });

      expect(txRows).toHaveLength(2);
      expect(txRows?.[0]?.idempotency_key).toBe(`settle:${rankedMatchId}:${userAId}`);
      expect(txRows?.[0]?.amount).toBe(50);
      expect(txRows?.[0]?.type).toBe('match_reward');
      expect(txRows?.[0]?.ref_type).toBe('match');

      expect(txRows?.[1]?.idempotency_key).toBe(`settle:${rankedMatchId}:${userBId}`);
      expect(txRows?.[1]?.amount).toBe(5);
      expect(txRows?.[1]?.type).toBe('match_reward');
      expect(txRows?.[1]?.ref_type).toBe('match');
    });

    it('2. [DoD GỐC — RETRY 2 LẦN] Gọi trực tiếp apply_match_settlement 2 lần -> applied=false, số liệu bảo toàn 100%', async () => {
      // 2.1 Chụp snapshot toàn bộ số liệu hiện tại trước khi retry
      const { data: snapMatch } = await serviceClient
        .from('matches')
        .select('settled_at')
        .eq('id', rankedMatchId)
        .single();
      const initialSettledAt = snapMatch?.settled_at;

      const { data: snapPart } = await serviceClient
        .from('match_participants')
        .select('user_id, rating_before, rating_after, rating_delta')
        .eq('match_id', rankedMatchId)
        .order('seat_index', { ascending: true });

      const { data: snapRatingA } = await serviceClient
        .from('player_ratings')
        .select('rating, games_played, wins, losses, streak, best_rating')
        .eq('user_id', userAId)
        .single();

      const { data: snapRatingB } = await serviceClient
        .from('player_ratings')
        .select('rating, games_played, wins, losses, streak, best_rating')
        .eq('user_id', userBId)
        .single();

      const { data: snapWalletA } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();

      const { data: snapWalletB } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userBId)
        .single();

      const { count: initialTxCount } = await serviceClient
        .from('wallet_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('ref_id', rankedMatchId);

      // Payload giả lập gọi lại
      const retryPayload = {
        match_id: rankedMatchId,
        is_noop: false,
        placement_games: 15,
        entries: [
          {
            user_id: userAId,
            seat_index: 0,
            rating_before: 1200,
            rating_after: 1216,
            rating_delta: 16,
            outcome: 'win',
            coins: 50,
          },
          {
            user_id: userBId,
            seat_index: 1,
            rating_before: 1200,
            rating_after: 1184,
            rating_delta: -16,
            outcome: 'loss',
            coins: 5,
          },
        ],
      };

      // 2.2 RETRY LẦN 1: service_role gọi apply_match_settlement
      const { data: retry1Res, error: retry1Err } = await serviceClient.rpc(
        'apply_match_settlement',
        { p: retryPayload },
      );
      expect(retry1Err).toBeNull();
      expect(retry1Res?.applied).toBe(false);
      expect(retry1Res?.reason).toBe('already_settled_or_not_ended');

      // 2.3 RETRY LẦN 2: service_role gọi apply_match_settlement tiếp
      const { data: retry2Res, error: retry2Err } = await serviceClient.rpc(
        'apply_match_settlement',
        { p: retryPayload },
      );
      expect(retry2Err).toBeNull();
      expect(retry2Res?.applied).toBe(false);
      expect(retry2Res?.reason).toBe('already_settled_or_not_ended');

      // 2.4 ĐỐI CHIẾU SỐ LIỆU SAU 2 LẦN RETRY: Tuyệt đối KHÔNG thay đổi dù chỉ 1 đơn vị!
      const { data: afterMatch } = await serviceClient
        .from('matches')
        .select('settled_at')
        .eq('id', rankedMatchId)
        .single();
      expect(afterMatch?.settled_at).toBe(initialSettledAt);

      const { data: afterPart } = await serviceClient
        .from('match_participants')
        .select('user_id, rating_before, rating_after, rating_delta')
        .eq('match_id', rankedMatchId)
        .order('seat_index', { ascending: true });
      expect(afterPart).toEqual(snapPart);

      const { data: afterRatingA } = await serviceClient
        .from('player_ratings')
        .select('rating, games_played, wins, losses, streak, best_rating')
        .eq('user_id', userAId)
        .single();
      expect(afterRatingA).toEqual(snapRatingA);

      const { data: afterRatingB } = await serviceClient
        .from('player_ratings')
        .select('rating, games_played, wins, losses, streak, best_rating')
        .eq('user_id', userBId)
        .single();
      expect(afterRatingB).toEqual(snapRatingB);

      const { data: afterWalletA } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();
      expect(afterWalletA?.balance).toBe(snapWalletA?.balance);

      const { data: afterWalletB } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userBId)
        .single();
      expect(afterWalletB?.balance).toBe(snapWalletB?.balance);

      const { count: afterTxCount } = await serviceClient
        .from('wallet_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('ref_id', rankedMatchId);
      expect(afterTxCount).toBe(initialTxCount);
    });

    it('3. Ván Abort (< 3 nước): Referee settle đóng dấu settled_at, KHÔNG thay đổi rating hay xu', async () => {
      // 3.1 Tạo phòng và join phòng
      const { data: createRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const roomCode = createRes?.[0]?.code;
      expect(roomCode).toBeTruthy();
      createdRoomCodes.push(roomCode);

      const { data: joinRes } = await userBClient.rpc('join_room', { p_code: roomCode });
      const abortMatchId = joinRes?.[0]?.match_id;
      expect(abortMatchId).toBeTruthy();
      createdMatchIds.push(abortMatchId);

      await userAClient.functions.invoke('referee', {
        body: { action: 'init', matchId: abortMatchId },
      });

      // Ghi nhận số dư ví và rating trước khi abort
      const { data: preRatingA } = await serviceClient
        .from('player_ratings')
        .select('rating, games_played')
        .eq('user_id', userAId)
        .single();
      const { data: preWalletA } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();

      // 3.2 User A xin hàng ngay tại nước 0 (< 3 nước) -> Xử lý Abort
      const { data: resignRes } = await userAClient.functions.invoke('referee', {
        body: { action: 'resign', matchId: abortMatchId },
      });
      expect(resignRes?.ok).toBe(true);
      expect(resignRes?.data?.reason).toBe('abort');

      // 3.3 Chờ settled_at được đóng dấu
      const settledAt = await waitForSettledAt(abortMatchId);
      expect(settledAt).toBeTruthy();

      // 3.4 Kiểm tra: matches.end_reason = 'abort', match_participants không có rating_delta
      const { data: abortMatch } = await serviceClient
        .from('matches')
        .select('end_reason, settled_at')
        .eq('id', abortMatchId)
        .single();
      expect(abortMatch?.end_reason).toBe('abort');

      const { data: participants } = await serviceClient
        .from('match_participants')
        .select('rating_delta')
        .eq('match_id', abortMatchId);
      expect(participants?.[0]?.rating_delta).toBeNull();
      expect(participants?.[1]?.rating_delta).toBeNull();

      // Rating và ví của User A không thay đổi
      const { data: postRatingA } = await serviceClient
        .from('player_ratings')
        .select('rating, games_played')
        .eq('user_id', userAId)
        .single();
      const { data: postWalletA } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();

      expect(postRatingA).toEqual(preRatingA);
      expect(postWalletA?.balance).toBe(preWalletA?.balance);
    });

    it('4. Ván Correspondence Ranked (>= 3 nước): Referee settle hoạt động chuẩn xác như realtime', async () => {
      // 4.1 Tạo phòng chơi theo lượt (Correspondence)
      const { data: createRes } = await userAClient.rpc('create_room', {
        p_game_id: 'caro',
        p_time_control: { kind: 'correspondence', base_seconds: 86400 },
      });
      const roomCode = createRes?.[0]?.code;
      expect(roomCode).toBeTruthy();
      createdRoomCodes.push(roomCode);

      const { data: joinRes } = await userBClient.rpc('join_room', { p_code: roomCode });
      const corrMatchId = joinRes?.[0]?.match_id;
      expect(corrMatchId).toBeTruthy();
      createdMatchIds.push(corrMatchId);

      await userAClient.functions.invoke('referee', {
        body: { action: 'init', matchId: corrMatchId },
      });

      // 4.2 Đánh 3 nước cờ hợp lệ
      await userAClient.functions.invoke('referee', {
        body: { action: 'move', matchId: corrMatchId, moveSerialized: '112', expectedMoveIndex: 0 },
      });
      await userBClient.functions.invoke('referee', {
        body: { action: 'move', matchId: corrMatchId, moveSerialized: '127', expectedMoveIndex: 1 },
      });
      await userAClient.functions.invoke('referee', {
        body: { action: 'move', matchId: corrMatchId, moveSerialized: '97', expectedMoveIndex: 2 },
      });

      // 4.3 User B đầu hàng ở nước thứ 3 (>= 3 nước) -> Xử lý Resign chính thức (User A thắng)
      const { data: resignRes } = await userBClient.functions.invoke('referee', {
        body: { action: 'resign', matchId: corrMatchId },
      });
      expect(resignRes?.ok).toBe(true);
      expect(resignRes?.data?.reason).toBe('resign');

      // 4.4 Chờ và xác nhận kết toán thành công
      const settledAt = await waitForSettledAt(corrMatchId);
      expect(settledAt).toBeTruthy();

      const { data: participants } = await serviceClient
        .from('match_participants')
        .select('user_id, is_winner, rating_delta')
        .eq('match_id', corrMatchId)
        .order('seat_index', { ascending: true });

      expect(participants).toHaveLength(2);
      expect(participants?.[0]?.is_winner).toBe(true);
      expect(participants?.[0]?.rating_delta).toBe(16);

      expect(participants?.[1]?.is_winner).toBe(false);
      expect(participants?.[1]?.rating_delta).toBe(-16);
    });
  },
);
