/**
 * ==============================================================================
 * RLS & RPC TESTS: CORRESPONDENCE MODE & ROOM INTEGRATION (P3.6A)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ:
 * 1. create_room(p_mode 'online_correspondence') -> rooms.mode = 'online_correspondence'.
 *    join_room -> matches.mode = 'online_correspondence', RPC trả về đúng mode.
 * 2. create_room với p_mode không hợp lệ -> FAIL (P0011); p_mode bỏ trống -> default 'online_1v1'.
 * 3. authenticated SELECT system_config thấy key 'match.correspondence_per_move_hours'.
 * 4. INSERT thẳng matches mode mới từ client -> VẪN BỊ CHẶN (khóa ghi 100%).
 * 5. Teardown dọn sạch.
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
  userAId,
} from './setup';

describe.runIf(isRlsTestConfigured())(
  'Correspondence Mode & Room RPC Security Suite (P3.6a)',
  () => {
    const createdRoomCodes: string[] = [];
    const createdMatchIds: string[] = [];

    beforeAll(async () => {
      await setupRlsTestContext();
    });

    afterAll(async () => {
      // Dọn dẹp dữ liệu test
      if (createdRoomCodes.length > 0) {
        await serviceClient.from('rooms').delete().in('code', createdRoomCodes);
      }
      if (createdMatchIds.length > 0) {
        await serviceClient.from('match_live_state').delete().in('match_id', createdMatchIds);
        await serviceClient.from('match_participants').delete().in('match_id', createdMatchIds);
        await serviceClient.from('matches').delete().in('id', createdMatchIds);
      }
      await cleanupRlsTestContext();
    });

    describe('1. create_room & join_room với mode online_correspondence', () => {
      it('Tạo phòng với p_mode online_correspondence -> rooms.mode đúng; join_room -> matches.mode đúng', async () => {
        // User A tạo phòng correspondence
        const { data: createData, error: createError } = await userAClient.rpc('create_room', {
          p_game_id: 'caro',
          p_mode: 'online_correspondence',
        });

        expect(createError).toBeNull();
        expect(createData).toHaveLength(1);
        const code = createData[0].code;
        createdRoomCodes.push(code);

        // Kiểm tra DB rooms.mode
        const { data: dbRoom } = await serviceClient
          .from('rooms')
          .select('*')
          .eq('code', code)
          .single();

        expect(dbRoom).toBeTruthy();
        expect(dbRoom.mode).toBe('online_correspondence');
        expect(dbRoom.host_id).toBe(userAId);
        expect(dbRoom.status).toBe('waiting');

        // User B vào phòng
        const { data: joinData, error: joinError } = await userBClient.rpc('join_room', {
          p_code: code,
        });

        expect(joinError).toBeNull();
        expect(joinData).toHaveLength(1);
        const joinResult = joinData[0];
        createdMatchIds.push(joinResult.match_id);

        expect(joinResult.game_id).toBe('caro');
        expect(joinResult.mode).toBe('online_correspondence');

        // Kiểm tra bảng matches được tạo với mode = online_correspondence
        const { data: dbMatch } = await serviceClient
          .from('matches')
          .select('*')
          .eq('id', joinResult.match_id)
          .single();

        expect(dbMatch).toBeTruthy();
        expect(dbMatch.mode).toBe('online_correspondence');
        expect(dbMatch.game_id).toBe('caro');
        expect(dbMatch.ended_at).toBeNull();
      });
    });

    describe('2. Validation tham số p_mode trong create_room', () => {
      it('create_room với p_mode rác -> Báo lỗi P0011', async () => {
        const { data, error } = await userAClient.rpc('create_room', {
          p_game_id: 'caro',
          p_mode: 'invalid_mode_xyz',
        });

        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/Chế độ chơi không hợp lệ|P0011/);
        expect(data).toBeNull();
      });

      it('create_room bỏ trống p_mode -> default "online_1v1" (tương thích cũ)', async () => {
        const { data, error } = await userAClient.rpc('create_room', {
          p_game_id: 'caro',
        });

        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        const code = data[0].code;
        createdRoomCodes.push(code);

        const { data: dbRoom } = await serviceClient
          .from('rooms')
          .select('mode')
          .eq('code', code)
          .single();

        expect(dbRoom.mode).toBe('online_1v1');
      });
    });

    describe('3. Cấu hình system_config key match.correspondence_per_move_hours', () => {
      it('Authenticated client SELECT system_config thấy key match.correspondence_per_move_hours', async () => {
        const { data, error } = await userAClient
          .from('system_config')
          .select('key, value')
          .eq('key', 'match.correspondence_per_move_hours')
          .single();

        expect(error).toBeNull();
        expect(data).toBeTruthy();
        expect(data?.value).toEqual({ hours: 24 });
      });
    });

    describe('4. Khóa ghi client trực tiếp vào bảng matches (Deny-write invariant)', () => {
      it('Client Authenticated cố ý INSERT matches với mode online_correspondence -> BỊ CHẶN 100%', async () => {
        const { data, error } = await userAClient.from('matches').insert({
          game_id: 'caro',
          mode: 'online_correspondence',
          started_at: new Date().toISOString(),
        });

        // RLS cấm INSERT từ client
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      });
    });
  },
);
