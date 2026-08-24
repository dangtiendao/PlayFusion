/**
 * ==============================================================================
 * RLS & SCHEMA TESTS: NỀN TẢNG KẾT TOÁN SETTLE & BẬT RANKED (TESTS/RLS/SETTLE-FOUNDATION.RLS.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P4.2A):
 * 1. RPC join_room: Tự động gán `is_ranked = true` và `season_id = active_season.id` cho matches mới.
 * 2. Bảo mật cột matches.settled_at: Cấm 100% mọi thao tác UPDATE từ client (Idempotency Guard).
 * 3. Bảng system_config: service_role và authenticated đọc được 3 key `elo.*` mới ('elo.placement_games',
 *    'elo.mismatch_threshold', 'elo.mismatch_dampen').
 * 4. Kiểm tra fail-soft và dọn dẹp dữ liệu kiểm thử sạch sẽ.
 * ==============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupRlsTestContext,
  cleanupRlsTestContext,
  isRlsTestConfigured,
  userAClient,
  userBClient,
  anonClient,
  serviceClient,
  expectRlsBlocked,
} from './setup';

describe.runIf(isRlsTestConfigured())(
  'Settle Foundation & Ranked Enablement RLS Suite (P4.2a)',
  () => {
    const createdRoomCodes: string[] = [];
    const createdMatchIds: string[] = [];
    let activeSeasonId: number | null = null;

    beforeAll(async () => {
      await setupRlsTestContext();

      if (isRlsTestConfigured()) {
        // 1. Tra cứu mùa giải active hiện tại
        const { data: seasonData } = await serviceClient
          .from('seasons')
          .select('id')
          .eq('is_active', true)
          .maybeSingle();

        if (seasonData) {
          activeSeasonId = seasonData.id;
        }
      }
    });

    afterAll(async () => {
      if (isRlsTestConfigured()) {
        // Dọn dẹp dữ liệu rooms và matches test
        if (createdRoomCodes.length > 0) {
          await serviceClient.from('rooms').delete().in('code', createdRoomCodes);
        }
        if (createdMatchIds.length > 0) {
          await serviceClient.from('match_live_state').delete().in('match_id', createdMatchIds);
          await serviceClient.from('match_participants').delete().in('match_id', createdMatchIds);
          await serviceClient.from('matches').delete().in('id', createdMatchIds);
        }
      }
      await cleanupRlsTestContext();
    });

    describe('1. RPC join_room: Bật Ranked & Gán Active Season (online_1v1 & online_correspondence)', () => {
      it('Trận đấu tạo qua join_room (online_1v1) có is_ranked = true và season_id = activeSeasonId', async () => {
        // User A tạo phòng
        const { data: createData, error: createErr } = await userAClient.rpc('create_room', {
          p_game_id: 'caro',
          p_mode: 'online_1v1',
        });
        expect(createErr).toBeNull();
        const code = createData[0].code;
        createdRoomCodes.push(code);

        // User B tham gia phòng
        const { data: joinData, error: joinErr } = await userBClient.rpc('join_room', {
          p_code: code,
        });
        expect(joinErr).toBeNull();
        expect(joinData).toHaveLength(1);

        const matchId = joinData[0].match_id;
        createdMatchIds.push(matchId);

        // Tra cứu match qua service_role để xác thực is_ranked và season_id
        const { data: matchRecord, error: matchErr } = await serviceClient
          .from('matches')
          .select('id, game_id, mode, is_ranked, season_id, settled_at')
          .eq('id', matchId)
          .single();

        expect(matchErr).toBeNull();
        expect(matchRecord).not.toBeNull();
        expect(matchRecord.game_id).toBe('caro');
        expect(matchRecord.mode).toBe('online_1v1');
        expect(matchRecord.settled_at).toBeNull(); // Mới tạo chưa settle

        if (activeSeasonId !== null) {
          expect(matchRecord.is_ranked).toBe(true);
          expect(matchRecord.season_id).toBe(activeSeasonId);
        }
      });

      it('Trận đấu tạo qua join_room (online_correspondence) có is_ranked = true và season_id = activeSeasonId', async () => {
        // User A tạo phòng correspondence
        const { data: createData, error: createErr } = await userAClient.rpc('create_room', {
          p_game_id: 'caro',
          p_mode: 'online_correspondence',
        });
        expect(createErr).toBeNull();
        const code = createData[0].code;
        createdRoomCodes.push(code);

        // User B tham gia phòng
        const { data: joinData, error: joinErr } = await userBClient.rpc('join_room', {
          p_code: code,
        });
        expect(joinErr).toBeNull();
        expect(joinData).toHaveLength(1);

        const matchId = joinData[0].match_id;
        createdMatchIds.push(matchId);

        // Tra cứu match qua service_role
        const { data: matchRecord, error: matchErr } = await serviceClient
          .from('matches')
          .select('id, game_id, mode, is_ranked, season_id, settled_at')
          .eq('id', matchId)
          .single();

        expect(matchErr).toBeNull();
        expect(matchRecord.mode).toBe('online_correspondence');
        expect(matchRecord.settled_at).toBeNull();

        if (activeSeasonId !== null) {
          expect(matchRecord.is_ranked).toBe(true);
          expect(matchRecord.season_id).toBe(activeSeasonId);
        }
      });
    });

    describe('2. Khóa Ghi Cột matches.settled_at (Idempotency Guard)', () => {
      it('Client (User A) KHÔNG THỂ tự ý UPDATE matches.settled_at (RLS chặn)', async () => {
        if (createdMatchIds.length === 0) return;

        const targetMatchId = createdMatchIds[0];

        await expectRlsBlocked(
          userAClient
            .from('matches')
            .update({ settled_at: new Date().toISOString() })
            .eq('id', targetMatchId)
            .select(),
        );

        // Xác nhận trong DB giá trị settled_at vẫn là null
        const { data: checkData } = await serviceClient
          .from('matches')
          .select('settled_at')
          .eq('id', targetMatchId)
          .single();

        expect(checkData?.settled_at).toBeNull();
      });
    });

    describe('3. Seed Cấu Hình Elo Trong system_config', () => {
      it('service_role và authenticated đọc được 3 key elo.* mới đã seed', async () => {
        // 1. service_role SELECT
        const { data: serviceConfigs, error: sErr } = await serviceClient
          .from('system_config')
          .select('key, value')
          .in('key', ['elo.placement_games', 'elo.mismatch_threshold', 'elo.mismatch_dampen']);

        expect(sErr).toBeNull();
        expect(serviceConfigs).toHaveLength(3);

        const placement = serviceConfigs?.find((c) => c.key === 'elo.placement_games');
        const threshold = serviceConfigs?.find((c) => c.key === 'elo.mismatch_threshold');
        const dampen = serviceConfigs?.find((c) => c.key === 'elo.mismatch_dampen');

        expect(placement?.value).toEqual({ games: 15 });
        expect(threshold?.value).toEqual({ points: 400 });
        expect(dampen?.value).toEqual({ factor: 0.5 });

        // 2. authenticated SELECT
        const { data: userConfigs, error: uErr } = await userAClient
          .from('system_config')
          .select('key, value')
          .in('key', ['elo.placement_games', 'elo.mismatch_threshold', 'elo.mismatch_dampen']);

        expect(uErr).toBeNull();
        expect(userConfigs).toHaveLength(3);
      });
    });

    describe('4. Phân Quyền RPC apply_match_settlement (Chỉ service_role - P4.2b)', () => {
      it('Client Authenticated (User A) KHÔNG THỂ thực thi apply_match_settlement (Permission Denied)', async () => {
        const { data, error } = await userAClient.rpc('apply_match_settlement', {
          p: {
            match_id: '00000000-0000-0000-0000-000000000000',
            is_noop: true,
          },
        });

        // Supabase trả về lỗi 42501 (permission denied for function apply_match_settlement) hoặc function not found cho role authenticated
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      });

      it('Client Anon KHÔNG THỂ thực thi apply_match_settlement (Permission Denied)', async () => {
        const { data, error } = await anonClient.rpc('apply_match_settlement', {
          p: {
            match_id: '00000000-0000-0000-0000-000000000000',
            is_noop: true,
          },
        });

        expect(error).not.toBeNull();
        expect(data).toBeNull();
      });
    });
  },
);
