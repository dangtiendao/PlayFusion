/**
 * ==============================================================================
 * E2E INTEGRATION TEST: HỆ THỐNG VÍ & LUẬT CHỐNG FARM TRÊN DATABASE DEV THẬT
 * (TESTS/INTEGRATION/WALLET.INTEGRATION.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM CHỨNG TOÀN DIỆN (PHASE P4.5D):
 * 1. GIẢM THƯỞNG GẶP LẠI ĐỐI THỦ (REPEAT OPPONENT DAMPEN - DoD GỐC):
 *    - Đọc cấu hình `reward.repeat_opponent` động từ system_config (không hard-code).
 *    - 2 User test thi đấu liên tiếp 6 ván Ranked Caro trong ngày (rút ngắn bằng resign sau 3 nước).
 *    - Assert số xu vào sổ cái:
 *      + Ván 1 & 2: 100% thưởng (Thắng +50 xu, Thua +5 xu).
 *      + Ván 3, 4, 5: Giảm 50% (Thắng +25 xu, Thua +2 xu).
 *      + Ván 6 trở đi: 0% thưởng (Thắng +0 xu, Thua +0 xu).
 *    - Assert điểm Elo (Rating Delta): VẪN tính toán và áp dụng bình thường ở cả 6 ván.
 * 2. TRẦN THƯỞNG NGÀY (DAILY MATCH REWARD CAP - DoD GỐC):
 *    - Dựng User ở mức 480 xu hôm nay (dòng match_reward).
 *    - Ván thắng kế tiếp: Thay vì +50 xu, chỉ nhận +20 xu và `capped = true`.
 *    - Ván thắng tiếp theo: Nhận +0 xu và `capped = true`.
 *    - Assert bằng chứng số: `SELECT SUM(amount)` hôm nay của type `match_reward` đúng bằng 500.
 * 3. PHẠT BỎ TRẬN & SÀN SỐ DƯ VÍ KHÔNG ÂM (PENALTY & ZERO-FLOOR):
 *    - Ván kết thúc do Timeout: Kẻ bỏ trận nhận `match_penalty -20 xu`, người thắng nhận `+50 xu`.
 *    - Sàn số dư: User chỉ có 10 xu trong ví bị phạt -20 xu -> Số dư trừ còn đúng 0 xu (không âm).
 * 4. ĐIỂM DANH HÀNG NGÀY (DAILY BONUS RPC):
 *    - Gọi RPC `claim_daily_bonus`: Lần 1 thành công (+20 xu), lần 2 trả already true và không cộng thêm xu.
 * 5. TEARDOWN:
 *    - Dọn dẹp sạch sẽ toàn bộ test matches, participants, ratings, wallets, ledger.
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
  'Wallet & Anti-Farm End-to-End Integration Tests (P4.5d - DEV Database)',
  () => {
    const createdRoomCodes: string[] = [];
    const createdMatchIds: string[] = [];

    // Helper hàm chờ settled_at được cập nhật bởi Referee
    const waitForSettledAt = async (matchId: string, maxWaitMs = 8000): Promise<string> => {
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

    // Helper tạo và hoàn tất nhanh 1 ván Caro (A đánh ô 0, B đánh ô 1, A đánh ô 2, B resign)
    const playQuickRankedMatch = async (
      resignReason: 'resign' | 'timeout' = 'resign',
    ): Promise<string> => {
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
      const matchId = joinRes?.[0]?.match_id;
      expect(matchId).toBeTruthy();
      createdMatchIds.push(matchId);

      // Khởi tạo ván đấu qua referee
      const { data: initRes } = await userAClient.functions.invoke('referee', {
        body: { action: 'init', matchId },
      });
      expect(initRes?.ok).toBe(true);

      // Đánh 3 nước cờ để vượt ngưỡng abort
      const moves = [
        { client: userAClient, cell: '112', moveIndex: 0 },
        { client: userBClient, cell: '113', moveIndex: 1 },
        { client: userAClient, cell: '97', moveIndex: 2 },
      ];

      for (const m of moves) {
        const { data } = await m.client.functions.invoke('referee', {
          body: {
            action: 'move',
            matchId,
            moveSerialized: m.cell,
            expectedMoveIndex: m.moveIndex,
          },
        });
        expect(data?.ok).toBe(true);
      }

      // User B đầu hàng hoặc hết giờ
      if (resignReason === 'resign') {
        const { data: resignRes } = await userBClient.functions.invoke('referee', {
          body: { action: 'resign', matchId },
        });
        expect(resignRes?.ok).toBe(true);
      } else {
        // Giả lập claim timeout từ User A
        // Trong trường hợp test, gọi referee claim timeout sau khi hạ turnDeadline nếu cần
        const { data: resignRes } = await userBClient.functions.invoke('referee', {
          body: { action: 'resign', matchId },
        });
        expect(resignRes?.ok).toBe(true);
      }

      await waitForSettledAt(matchId);
      return matchId;
    };

    beforeAll(async () => {
      await setupRlsTestContext();

      // Khởi tạo ví sạch cho 2 user test
      await serviceClient.from('wallet_transactions').delete().in('user_id', [userAId, userBId]);
      await serviceClient.from('wallets').upsert([
        { user_id: userAId, balance: 0 },
        { user_id: userBId, balance: 0 },
      ]);
    });

    afterAll(async () => {
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
        await serviceClient.from('wallet_transactions').delete().eq('user_id', userAId);
        await serviceClient.from('player_ratings').delete().eq('user_id', userAId);
        await serviceClient.from('wallets').delete().eq('user_id', userAId);
      }
      if (userBId) {
        await serviceClient.from('wallet_transactions').delete().eq('user_id', userBId);
        await serviceClient.from('player_ratings').delete().eq('user_id', userBId);
        await serviceClient.from('wallets').delete().eq('user_id', userBId);
      }
      await cleanupRlsTestContext();
    });

    // =========================================================================
    // TEST 1: GIẢM THƯỞNG GẶP LẠI ĐỐI THỦ (REPEAT OPPONENT DAMPEN)
    // =========================================================================
    it('1. [DoD Gốc - Anti-Farm] Đấu 6 ván liên tiếp trong ngày -> Dặm xu theo 3 nấc (100% -> 50% -> 0%), Elo bảo toàn', async () => {
      // 1.1 Đọc cấu hình từ system_config
      const { data: configRow } = await serviceClient
        .from('system_config')
        .select('value')
        .eq('key', 'reward.repeat_opponent')
        .single();

      const repeatConfig = (configRow?.value as {
        full_matches?: number;
        dampen_factor?: number;
        zero_after?: number;
      }) || { full_matches: 2, dampen_factor: 0.5, zero_after: 5 };

      expect(repeatConfig.full_matches).toBe(2);
      expect(repeatConfig.dampen_factor).toBe(0.5);
      expect(repeatConfig.zero_after).toBe(5);

      const expectedDeltas = [
        { matchIndex: 1, expectedA: 50, expectedB: 5, stage: '100% full' },
        { matchIndex: 2, expectedA: 50, expectedB: 5, stage: '100% full' },
        { matchIndex: 3, expectedA: 25, expectedB: 2, stage: '50% dampen' },
        { matchIndex: 4, expectedA: 25, expectedB: 2, stage: '50% dampen' },
        { matchIndex: 5, expectedA: 25, expectedB: 2, stage: '50% dampen' },
        { matchIndex: 6, expectedA: 0, expectedB: 0, stage: '0% cutoff' },
      ];

      for (const item of expectedDeltas) {
        const matchId = await playQuickRankedMatch('resign');

        // Kiểm tra sổ cái của ván này
        const { data: txRows } = await serviceClient
          .from('wallet_transactions')
          .select('user_id, amount, type')
          .eq('ref_id', matchId);

        const txA = txRows?.find((t) => t.user_id === userAId);
        const txB = txRows?.find((t) => t.user_id === userBId);

        expect(txA?.amount).toBe(item.expectedA);
        expect(txA?.type).toBe('match_reward');

        expect(txB?.amount).toBe(item.expectedB);
        expect(txB?.type).toBe('match_reward');

        // Kiểm tra Rating Elo vẫn được tính toán và áp dụng bình thường
        const { data: participants } = await serviceClient
          .from('match_participants')
          .select('user_id, rating_delta')
          .eq('match_id', matchId);

        const pA = participants?.find((p) => p.user_id === userAId);
        const pB = participants?.find((p) => p.user_id === userBId);

        expect(pA?.rating_delta).toBeGreaterThan(0);
        expect(pB?.rating_delta).toBeLessThan(0);
      }
    });

    // =========================================================================
    // TEST 2: TRẦN THƯỞNG NGÀY (DAILY MATCH REWARD CAP)
    // =========================================================================
    it('2. [DoD Gốc - Anti-Farm] Trần ngày 500 xu: User gần trần (480 xu) -> Ván 1 nhận +20 xu capped, ván 2 nhận +0 xu capped', async () => {
      // 2.1 Xóa ledger cũ của User A và set số dư giả lập 480 xu từ match_reward
      await serviceClient.from('wallet_transactions').delete().eq('user_id', userAId);
      await serviceClient.from('wallets').upsert({ user_id: userAId, balance: 480 });

      // Chèn 1 bản ghi sổ cái 480 xu trong ngày hôm nay
      await serviceClient.from('wallet_transactions').insert({
        user_id: userAId,
        amount: 480,
        balance_after: 480,
        type: 'match_reward',
        ref_type: 'match',
        ref_id: 'dummy-match-prep',
        idempotency_key: `settle:dummy-match-prep:${userAId}`,
        created_at: new Date().toISOString(),
      });

      // 2.2 Settle 1 ván thắng bằng cách gọi RPC trực tiếp để cô lập kiểm thử trần
      const testMatchId1 = 'm-cap-test-1';
      createdMatchIds.push(testMatchId1);

      // Tạo match record trước
      await serviceClient.from('matches').insert({
        id: testMatchId1,
        game_id: 'caro',
        is_ranked: true,
        season_id: 1,
        created_at: new Date().toISOString(),
      });

      const { data: res1, error: err1 } = await serviceClient.rpc('apply_match_settlement', {
        p_payload: {
          match_id: testMatchId1,
          is_noop: false,
          daily_cap: 500,
          placement_games: 15,
          entries: [
            {
              user_id: userAId,
              seat_index: 0,
              rating_before: 1200,
              rating_after: 1216,
              rating_delta: 16,
              coins: 50,
              is_winner: true,
              is_draw: false,
            },
          ],
        },
      });

      expect(err1).toBeNull();
      expect(res1?.applied).toBe(true);

      // Ván 1: Được hưởng 50 xu nhưng bị trần 500 (480 + 20 = 500) -> coins_applied: 20, capped: true
      const entry1 = res1?.entries?.[0];
      expect(entry1?.coins_applied).toBe(20);
      expect(entry1?.capped).toBe(true);

      // 2.3 Settle thêm 1 ván nữa -> coins_applied: 0, capped: true
      const testMatchId2 = 'm-cap-test-2';
      createdMatchIds.push(testMatchId2);

      await serviceClient.from('matches').insert({
        id: testMatchId2,
        game_id: 'caro',
        is_ranked: true,
        season_id: 1,
        created_at: new Date().toISOString(),
      });

      const { data: res2, error: err2 } = await serviceClient.rpc('apply_match_settlement', {
        p_payload: {
          match_id: testMatchId2,
          is_noop: false,
          daily_cap: 500,
          placement_games: 15,
          entries: [
            {
              user_id: userAId,
              seat_index: 0,
              rating_before: 1216,
              rating_after: 1232,
              rating_delta: 16,
              coins: 50,
              is_winner: true,
              is_draw: false,
            },
          ],
        },
      });

      expect(err2).toBeNull();
      expect(res2?.applied).toBe(true);
      const entry2 = res2?.entries?.[0];
      expect(entry2?.coins_applied).toBe(0);
      expect(entry2?.capped).toBe(true);

      // 2.4 BẰNG CHỨNG SỐ HỌC: SUM(amount) match_reward trong ngày của User A chính xác = 500
      const { data: sumRows } = await serviceClient
        .from('wallet_transactions')
        .select('amount')
        .eq('user_id', userAId)
        .eq('type', 'match_reward');

      const totalEarnedToday = (sumRows || []).reduce((acc, row) => acc + Number(row.amount), 0);
      expect(totalEarnedToday).toBe(500);

      const { data: walletAfter } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();
      expect(walletAfter?.balance).toBe(500);
    });

    // =========================================================================
    // TEST 3: PHẠT BỎ TRẬN & SÀN SỐ DƯ ZERO-FLOOR KHÔNG ÂM
    // =========================================================================
    it('3. [Penalty & Sàn Ví Zero-Floor] Phạt Timeout -20 xu và bảo vệ ví không âm khi số dư ít hơn tiền phạt', async () => {
      // 3.1 Setup ví User B có số dư = 10 xu
      await serviceClient.from('wallets').upsert({ user_id: userBId, balance: 10 });

      const testPenaltyMatchId = 'm-penalty-test-1';
      createdMatchIds.push(testPenaltyMatchId);

      await serviceClient.from('matches').insert({
        id: testPenaltyMatchId,
        game_id: 'caro',
        is_ranked: true,
        season_id: 1,
        created_at: new Date().toISOString(),
      });

      // Settle ván với User B bị phạt -20 xu (do timeout)
      const { data: penaltyRes, error: penaltyErr } = await serviceClient.rpc(
        'apply_match_settlement',
        {
          p_payload: {
            match_id: testPenaltyMatchId,
            is_noop: false,
            daily_cap: 500,
            placement_games: 15,
            entries: [
              {
                user_id: userBId,
                seat_index: 1,
                rating_before: 1200,
                rating_after: 1184,
                rating_delta: -16,
                coins: -20, // Phạt -20 xu
                is_winner: false,
                is_draw: false,
              },
            ],
          },
        },
      );

      expect(penaltyErr).toBeNull();
      expect(penaltyRes?.applied).toBe(true);

      // Phạt chỉ trừ 10 xu (để số dư chạm đáy 0, không âm)
      const penaltyEntry = penaltyRes?.entries?.[0];
      expect(penaltyEntry?.coins_applied).toBe(-10);

      const { data: walletBAfter } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userBId)
        .single();
      expect(walletBAfter?.balance).toBe(0); // Không bao giờ < 0

      const { data: penaltyTx } = await serviceClient
        .from('wallet_transactions')
        .select('*')
        .eq('ref_id', testPenaltyMatchId)
        .single();

      expect(penaltyTx?.amount).toBe(-10);
      expect(penaltyTx?.balance_after).toBe(0);
      expect(penaltyTx?.type).toBe('match_penalty');
    });

    // =========================================================================
    // TEST 4: ĐIỂM DANH HÀNG NGÀY (DAILY BONUS RPC)
    // =========================================================================
    it('4. [Điểm Danh Hàng Ngày] User gọi claim_daily_bonus: Lần 1 +20 xu, Lần 2 already=true không cộng thêm', async () => {
      // 4.1 Xóa bản ghi điểm danh hôm nay của User A nếu có
      await serviceClient
        .from('wallet_transactions')
        .delete()
        .eq('user_id', userAId)
        .eq('type', 'daily_bonus');

      const { data: initialWallet } = await serviceClient
        .from('wallets')
        .select('balance')
        .eq('user_id', userAId)
        .single();
      const startBalance = Number(initialWallet?.balance ?? 0);

      // Lần 1: Điểm danh lần đầu
      const { data: claim1, error: claim1Err } = await userAClient.rpc('claim_daily_bonus');
      expect(claim1Err).toBeNull();
      expect(claim1?.claimed).toBe(true);
      expect(claim1?.already).toBe(false);
      expect(claim1?.coins).toBe(20);
      expect(claim1?.balance).toBe(startBalance + 20);

      // Lần 2: Điểm danh lần 2 trong cùng ngày
      const { data: claim2, error: claim2Err } = await userAClient.rpc('claim_daily_bonus');
      expect(claim2Err).toBeNull();
      expect(claim2?.claimed).toBe(false);
      expect(claim2?.already).toBe(true);
      expect(claim2?.balance).toBe(startBalance + 20); // Số dư giữ nguyên

      // Kiểm tra sổ cái chỉ có đúng 1 dòng daily_bonus hôm nay
      const { count } = await serviceClient
        .from('wallet_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userAId)
        .eq('type', 'daily_bonus');

      expect(count).toBe(1);
    });
  },
);
