/**
 * ==============================================================================
 * RLS & RPC TESTS: HỆ THỐNG PHÒNG ĐẤU 6 KÝ TỰ (TESTS/RLS/ROOM.RLS.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P3.3A):
 * 1. RPC create_room: Sinh mã an toàn 6 ký tự, tự hủy phòng cũ của host.
 * 2. RPC join_room: Chống đua atomic, chia ghế ngẫu nhiên 50/50, sinh matches + participants.
 * 3. Chuỗi từ chối: ROOM_TAKEN, CANNOT_JOIN_OWN_ROOM, ROOM_NOT_FOUND, ROOM_EXPIRED.
 * 4. RPC cancel_room & get_my_room_status.
 * 5. Khóa ghi client: Cấm INSERT/UPDATE trực tiếp vào public.rooms, anon bị chặn 42501.
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
  userAId,
  userBId,
} from './setup';

describe.runIf(isRlsTestConfigured())('Rooms RLS & RPC Security Suite (P3.3a)', () => {
  const createdRoomCodes: string[] = [];
  const createdMatchIds: string[] = [];

  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu rooms và matches test
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

  describe('create_room RPC', () => {
    it('1. User A tạo phòng đấu -> sinh mã 6 ký tự an toàn và có TTL 30 phút', async () => {
      const { data, error } = await userAClient.rpc('create_room', { p_game_id: 'caro' });

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      const room = data[0];

      expect(room.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
      createdRoomCodes.push(room.code);

      // Kiểm tra DB qua service client
      const { data: dbRoom } = await serviceClient
        .from('rooms')
        .select('*')
        .eq('code', room.code)
        .single();

      expect(dbRoom).toBeTruthy();
      expect(dbRoom.host_id).toBe(userAId);
      expect(dbRoom.game_id).toBe('caro');
      expect(dbRoom.status).toBe('waiting');
      expect(dbRoom.match_id).toBeNull();
    });

    it('2. User A tạo phòng lần 2 -> phòng waiting cũ tự động chuyển thành "cancelled"', async () => {
      const { data: firstRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const firstCode = firstRes[0].code;
      createdRoomCodes.push(firstCode);

      // Tạo tiếp phòng thứ 2
      const { data: secondRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const secondCode = secondRes[0].code;
      createdRoomCodes.push(secondCode);

      // Kiểm tra phòng cũ đã bị cancelled
      const { data: oldRoom } = await serviceClient
        .from('rooms')
        .select('status')
        .eq('code', firstCode)
        .single();

      expect(oldRoom.status).toBe('cancelled');

      // Phòng mới đang waiting
      const { data: newRoom } = await serviceClient
        .from('rooms')
        .select('status')
        .eq('code', secondCode)
        .single();

      expect(newRoom.status).toBe('waiting');
    });

    it('3. Tạo phòng với game không tồn tại -> báo lỗi P0002', async () => {
      const { error } = await userAClient.rpc('create_room', { p_game_id: 'invalid_game_id' });
      expect(error).toBeTruthy();
      expect(error?.message).toContain('Trò chơi không tồn tại');
    });
  });

  describe('join_room RPC & Chống đua / Chia ghế', () => {
    it('4. User B vào phòng User A -> tạo match + participants, random ghế 50/50', async () => {
      const { data: createRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = createRes[0].code;
      createdRoomCodes.push(code);

      const { data: joinRes, error: joinErr } = await userBClient.rpc('join_room', {
        p_code: code,
      });

      expect(joinErr).toBeNull();
      expect(joinRes).toHaveLength(1);
      const matchId = joinRes[0].match_id;
      const guestSeat = joinRes[0].my_seat;
      createdMatchIds.push(matchId);

      expect(matchId).toBeTruthy();
      expect(joinRes[0].game_id).toBe('caro');
      expect([0, 1]).toContain(guestSeat);

      // Kiểm tra bảng matches
      const { data: match } = await serviceClient
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      expect(match.mode).toBe('online_1v1');
      expect(match.ended_at).toBeNull();

      // Kiểm tra bảng match_participants
      const { data: participants } = await serviceClient
        .from('match_participants')
        .select('*')
        .eq('match_id', matchId)
        .order('seat_index', { ascending: true });

      expect(participants).toHaveLength(2);
      const hostP = participants.find((p: { user_id: string }) => p.user_id === userAId);
      const guestP = participants.find((p: { user_id: string }) => p.user_id === userBId);

      expect(hostP).toBeTruthy();
      expect(guestP).toBeTruthy();
      expect(hostP.seat_index + guestP.seat_index).toBe(1); // 1 người seat 0, 1 người seat 1
    });

    it('5. Kiểm tra chia ghế ngẫu nhiên: Cả 2 giá trị ghế 0 và 1 đều xuất hiện sau 10 lần join', async () => {
      const guestSeats: number[] = [];

      for (let i = 0; i < 10; i++) {
        const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
        const code = cRes[0].code;
        createdRoomCodes.push(code);

        const { data: jRes } = await userBClient.rpc('join_room', { p_code: code });
        createdMatchIds.push(jRes[0].match_id);
        guestSeats.push(jRes[0].my_seat);
      }

      // Xác nhận cả seat 0 và seat 1 đều xuất hiện
      expect(guestSeats).toContain(0);
      expect(guestSeats).toContain(1);
    });

    it('6. Chống đua & Từ chối: Join lại phòng đã matched -> ROOM_TAKEN / ROOM_NOT_AVAILABLE', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      const { data: jRes } = await userBClient.rpc('join_room', { p_code: code });
      createdMatchIds.push(jRes[0].match_id);

      // User B thử join lại phòng đã matched
      const { error: secondJoinErr } = await userBClient.rpc('join_room', { p_code: code });
      expect(secondJoinErr).toBeTruthy();
      expect(
        secondJoinErr?.message.includes('ROOM_TAKEN') ||
          secondJoinErr?.message.includes('ROOM_NOT_AVAILABLE'),
      ).toBe(true);
    });

    it('7. Host tự join phòng của chính mình -> CANNOT_JOIN_OWN_ROOM', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      const { error: ownJoinErr } = await userAClient.rpc('join_room', { p_code: code });
      expect(ownJoinErr).toBeTruthy();
      expect(ownJoinErr?.message).toContain('CANNOT_JOIN_OWN_ROOM');
    });

    it('8. Join mã phòng không tồn tại -> ROOM_NOT_FOUND', async () => {
      const { error } = await userBClient.rpc('join_room', { p_code: 'ZZZZZZ' });
      expect(error).toBeTruthy();
      expect(error?.message).toContain('ROOM_NOT_FOUND');
    });

    it('9. Join phòng hết hạn -> ROOM_EXPIRED và status chuyển thành "expired"', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      // Giả lập phòng hết hạn bằng service role sửa expires_at về quá khứ
      await serviceClient
        .from('rooms')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('code', code);

      const { error: expiredErr } = await userBClient.rpc('join_room', { p_code: code });
      expect(expiredErr).toBeTruthy();
      expect(expiredErr?.message).toContain('ROOM_EXPIRED');

      const { data: dbRoom } = await serviceClient
        .from('rooms')
        .select('status')
        .eq('code', code)
        .single();

      expect(dbRoom.status).toBe('expired');
    });
  });

  describe('cancel_room & get_my_room_status RPC', () => {
    it('10. User B cố hủy phòng của User A -> CANNOT_CANCEL_ROOM', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      const { error: cancelErr } = await userBClient.rpc('cancel_room', { p_code: code });
      expect(cancelErr).toBeTruthy();
      expect(cancelErr?.message).toContain('CANNOT_CANCEL_ROOM');
    });

    it('11. User A hủy phòng waiting của mình -> thành công status="cancelled"', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      const { data: cancelRes, error: cancelErr } = await userAClient.rpc('cancel_room', {
        p_code: code,
      });
      expect(cancelErr).toBeNull();
      expect(cancelRes).toBe(true);

      const { data: dbRoom } = await serviceClient
        .from('rooms')
        .select('status')
        .eq('code', code)
        .single();

      expect(dbRoom.status).toBe('cancelled');
    });

    it('12. get_my_room_status: Host kiểm tra trạng thái trước và sau khi Guest vào', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      // Trước khi có guest
      const { data: status1 } = await userAClient.rpc('get_my_room_status', { p_code: code });
      expect(status1[0].status).toBe('waiting');
      expect(status1[0].match_id).toBeNull();

      // Guest vào phòng
      const { data: jRes } = await userBClient.rpc('join_room', { p_code: code });
      createdMatchIds.push(jRes[0].match_id);

      // Sau khi guest vào
      const { data: status2 } = await userAClient.rpc('get_my_room_status', { p_code: code });
      expect(status2[0].status).toBe('matched');
      expect(status2[0].match_id).toBe(jRes[0].match_id);
    });
  });

  describe('Khóa bảo mật bảng rooms (Deny-write by default & Anon)', () => {
    it('13. Client cố tình INSERT trực tiếp vào public.rooms -> BỊ CHẶN (42501)', async () => {
      const { error } = await userAClient.from('rooms').insert({
        code: 'HACK99',
        host_id: userAId,
        game_id: 'caro',
        status: 'waiting',
      });

      expect(error).toBeTruthy();
    });

    it('14. Client cố tình UPDATE trực tiếp public.rooms -> BỊ CHẶN', async () => {
      const { data: cRes } = await userAClient.rpc('create_room', { p_game_id: 'caro' });
      const code = cRes[0].code;
      createdRoomCodes.push(code);

      const { error } = await userAClient
        .from('rooms')
        .update({ status: 'matched' })
        .eq('code', code);

      expect(error).toBeTruthy();
    });

    it('15. Anon gọi RPC create_room hoặc join_room -> BỊ CHẶN (42501)', async () => {
      const { error: createErr } = await anonClient.rpc('create_room', { p_game_id: 'caro' });
      expect(createErr).toBeTruthy();

      const { error: joinErr } = await anonClient.rpc('join_room', { p_code: '234567' });
      expect(joinErr).toBeTruthy();
    });
  });
});
