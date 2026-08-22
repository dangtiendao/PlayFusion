/**
 * ==============================================================================
 * CLIENT ROOM REPOSITORY (SRC/REPOSITORIES/ROOMREPOSITORY.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. WRAPPER QUẢN LÝ PHÒNG ĐẤU 6 KÝ TỰ (PHASE P3.3):
 *    - Cung cấp API tương tác với 4 RPCs phòng đấu: create_room, join_room, cancel_room, get_my_room_status.
 *    - Hỗ trợ hàm getRoomInfo tra cứu metadata phòng phục vụ Deep Link (/room/:code).
 * 2. CHUYỂN HÓA MÃ LỖI BẢO MẬT:
 *    - Toàn bộ lỗi từ Postgres RPC (P0001 -> P0010, 42501) được map sang mã lỗi Domain sạch
 *      kèm thông điệp tiếng Việt thân thiện cho UI.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import { RepoError } from './types';

/**
 * Thông tin phòng đấu sau khi tạo thành công.
 */
export interface RoomDto {
  /** Mã phòng 6 ký tự an toàn */
  readonly code: string;
  /** Thời điểm hết hạn phòng đấu (ISO string) */
  readonly expiresAt: string;
}

/**
 * Kết quả sau khi vào phòng thành công và được ghép trận.
 */
export interface JoinRoomResultDto {
  /** ID ván đấu được tạo trong bảng matches */
  readonly matchId: string;
  /** Ghế được chia ngẫu nhiên cho caller (0: đi trước, 1: đi sau) */
  readonly mySeat: number;
  /** Mã định danh trò chơi */
  readonly gameId: string;
}

/**
 * Trạng thái hiện tại của phòng đấu (dành cho Host polling fallback).
 */
export interface RoomStatusDto {
  /** Trạng thái phòng */
  readonly status: 'waiting' | 'matched' | 'cancelled' | 'expired';
  /** ID ván đấu (nếu đã matched) */
  readonly matchId: string | null;
  /** Mã định danh trò chơi */
  readonly gameId: string;
  /** Ghế ngồi của caller trong trận đấu */
  readonly mySeat: number;
}

/**
 * Metadata thông tin phòng phục vụ Deep Link preview.
 */
export interface RoomInfoDto {
  /** Mã phòng */
  readonly code: string;
  /** ID của Host tạo phòng */
  readonly hostId: string;
  /** Mã định danh trò chơi */
  readonly gameId: string;
  /** Trạng thái phòng */
  readonly status: string;
  /** Thời điểm hết hạn */
  readonly expiresAt: string;
}

/**
 * Bảng ánh xạ mã lỗi RPC sang thông điệp tiếng Việt thân thiện và phân loại FATAL/RETRYABLE.
 */
function mapRoomRpcError(error: unknown): RepoError {
  if (error instanceof RepoError) return error;

  const rawMsg = (error as { message?: string })?.message ?? '';
  const rawCode = (error as { code?: string })?.code ?? '';

  if (rawMsg.includes('ROOM_EXPIRED') || rawCode === 'P0006') {
    return new RepoError(
      'Phòng đấu đã hết hạn (quá 30 phút). Vui lòng tạo hoặc vào phòng khác.',
      'FATAL',
      error,
    );
  }

  if (rawMsg.includes('ROOM_TAKEN') || rawCode === 'P0008') {
    return new RepoError('Phòng đấu đã có người khác tham gia trước.', 'FATAL', error);
  }

  if (rawMsg.includes('CANNOT_JOIN_OWN_ROOM') || rawCode === 'P0005') {
    return new RepoError('Bạn không thể tự vào phòng do chính mình tạo.', 'FATAL', error);
  }

  if (rawMsg.includes('ROOM_NOT_FOUND') || rawCode === 'P0004') {
    return new RepoError(
      'Không tìm thấy phòng đấu. Vui lòng kiểm tra lại mã phòng 6 ký tự.',
      'FATAL',
      error,
    );
  }

  if (rawMsg.includes('ROOM_NOT_AVAILABLE') || rawCode === 'P0007') {
    return new RepoError('Phòng đấu không còn khả dụng hoặc đã bị hủy.', 'FATAL', error);
  }

  if (rawMsg.includes('INVALID_ROOM_CODE') || rawCode === 'P0001') {
    return new RepoError('Mã phòng không đúng định dạng 6 ký tự viết hoa.', 'FATAL', error);
  }

  if (rawMsg.includes('GAME_NOT_FOUND_OR_DISABLED') || rawCode === 'P0002') {
    return new RepoError('Trò chơi không tồn tại hoặc đang tạm khóa bảo trì.', 'FATAL', error);
  }

  if (rawMsg.includes('CANNOT_CANCEL_ROOM') || rawCode === 'P0009') {
    return new RepoError(
      'Không thể hủy phòng đấu (bạn không phải chủ phòng hoặc phòng đã bắt đầu).',
      'FATAL',
      error,
    );
  }

  if (rawMsg.includes('NOT_ROOM_MEMBER') || rawCode === 'P0010') {
    return new RepoError('Bạn không phải là thành viên của phòng đấu này.', 'FATAL', error);
  }

  if (rawMsg.includes('42501') || rawMsg.includes('UNAUTHORIZED') || rawCode === '42501') {
    return new RepoError('Vui lòng đăng nhập để thực hiện thao tác phòng đấu.', 'FATAL', error);
  }

  return new RepoError(
    rawMsg || 'Không thể thực hiện thao tác phòng đấu. Vui lòng thử lại.',
    'RETRYABLE',
    error,
  );
}

export const roomRepository = {
  /**
   * Tạo phòng đấu mới với mã 6 ký tự an toàn.
   *
   * @param gameId Mã định danh trò chơi (ví dụ: 'caro').
   */
  async createRoom(gameId: string): Promise<RoomDto> {
    try {
      const { data, error } = await supabase.rpc('create_room', {
        p_game_id: gameId,
      });

      if (error) {
        throw mapRoomRpcError(error);
      }

      if (!data || data.length === 0) {
        throw new RepoError('Không nhận được mã phòng từ máy chủ.', 'FATAL');
      }

      const row = data[0];
      return {
        code: row.code,
        expiresAt: row.expires_at,
      };
    } catch (err) {
      throw mapRoomRpcError(err);
    }
  },

  /**
   * Khách vào phòng đấu bằng mã 6 ký tự và khởi tạo trận đấu.
   *
   * @param code Mã phòng 6 ký tự viết hoa.
   */
  async joinRoom(code: string): Promise<JoinRoomResultDto> {
    try {
      const formattedCode = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc('join_room', {
        p_code: formattedCode,
      });

      if (error) {
        throw mapRoomRpcError(error);
      }

      if (!data || data.length === 0) {
        throw new RepoError('Không thể khởi tạo trận đấu từ phòng này.', 'FATAL');
      }

      const row = data[0];
      return {
        matchId: row.match_id,
        mySeat: row.my_seat,
        gameId: row.game_id,
      };
    } catch (err) {
      throw mapRoomRpcError(err);
    }
  },

  /**
   * Chủ phòng hủy phòng chờ.
   *
   * @param code Mã phòng 6 ký tự.
   */
  async cancelRoom(code: string): Promise<boolean> {
    try {
      const formattedCode = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc('cancel_room', {
        p_code: formattedCode,
      });

      if (error) {
        throw mapRoomRpcError(error);
      }

      return Boolean(data);
    } catch (err) {
      throw mapRoomRpcError(err);
    }
  },

  /**
   * Tra cứu trạng thái phòng hiện tại (dùng cho Host Polling Fallback).
   *
   * @param code Mã phòng 6 ký tự.
   */
  async getRoomStatus(code: string): Promise<RoomStatusDto> {
    try {
      const formattedCode = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc('get_my_room_status', {
        p_code: formattedCode,
      });

      if (error) {
        throw mapRoomRpcError(error);
      }

      if (!data || data.length === 0) {
        throw new RepoError('Không tìm thấy trạng thái phòng.', 'FATAL');
      }

      const row = data[0];
      return {
        status: row.status as RoomStatusDto['status'],
        matchId: row.match_id ?? null,
        gameId: row.game_id,
        mySeat: row.my_seat ?? 0,
      };
    } catch (err) {
      throw mapRoomRpcError(err);
    }
  },

  /**
   * Đọc metadata thông tin phòng phục vụ Deep Link preview trước khi vào phòng.
   *
   * @param code Mã phòng 6 ký tự.
   */
  async getRoomInfo(code: string): Promise<RoomInfoDto | null> {
    try {
      const formattedCode = code.trim().toUpperCase();
      const { data, error } = await supabase
        .from('rooms')
        .select('code, host_id, game_id, status, expires_at')
        .eq('code', formattedCode)
        .maybeSingle();

      if (error) {
        throw mapRoomRpcError(error);
      }

      if (!data) return null;

      return {
        code: data.code,
        hostId: data.host_id,
        gameId: data.game_id,
        status: data.status,
        expiresAt: data.expires_at,
      };
    } catch (err) {
      throw mapRoomRpcError(err);
    }
  },

  /**
   * Phát sóng thông điệp 'room_matched' lên kênh room để thông báo cho Host.
   *
   * @param code Mã phòng 6 ký tự.
   * @param matchId ID trận đấu vừa được ghép.
   * @param hostSeat Vị trí ghế của Host (0 hoặc 1).
   */
  async notifyRoomMatched(code: string, matchId: string, hostSeat: number): Promise<void> {
    try {
      const formattedCode = code.trim().toUpperCase();
      const channel = supabase.channel(`match:${formattedCode}`);
      await channel.subscribe();
      await channel.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          v: 1,
          type: 'room_matched',
          senderId: 'guest',
          sentAt: new Date().toISOString(),
          payload: {
            matchId,
            hostSeat,
          },
        },
      });
      await supabase.removeChannel(channel);
    } catch {
      // Bỏ qua lỗi phát sóng, Host vẫn có fallback polling
    }
  },
};
