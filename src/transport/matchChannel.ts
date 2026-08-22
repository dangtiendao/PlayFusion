/**
 * ==============================================================================
 * HIỆN THỰC KÊNH VÁN ĐẤU REALTIME TRANSPORT (SRC/TRANSPORT/MATCHCHANNEL.TS)
 * ==============================================================================
 *
 * NGUYÊN TẮC THIẾT KẾ CỐT LÕI (BẤT BIẾN):
 * 1. KHÔNG SINGLETON (INSTANCE PER MATCH):
 *    - Mỗi trận đấu / phòng đấu tạo một instance `MatchChannel` độc lập qua hàm `createMatchChannel`.
 *    - Tuyệt đối không dùng Singleton cho kênh ván đấu, nhằm đảm bảo trạng thái sạch sẽ giữa các
 *      trận, ngăn chặn rò rỉ bộ nhớ (memory leak) và chồng chéo sự kiện giữa các ván cờ liên tiếp.
 * 2. KỶ LUẬT FREE TIER SUPABASE (CHỐNG RÒ RỈ KẾT NỐI):
 *    - Supabase Free Tier khống chế tối đa 200 kết nối đồng thời (CCU) và 2,000,000 messages/tháng.
 *    - Kênh CHỈ ĐƯỢC PHÉP mở khi người chơi bước vào trận đấu, và BẮT BUỘC PHẢI ngắt kết nối
 *      (`disconnect()`) dọn dẹp sạch sẽ (untrack -> unsubscribe -> removeChannel) ngay khi rời trận.
 * 3. KHÔNG TỰ ĐỘNG RECONNECT TRONG LÕI TRANSPORT:
 *    - Tầng lõi Transport báo cáo trạng thái trung thực ('error', 'closed') qua `onStatusChange`.
 *    - Chính sách thử lại (Reconnect Policy / Backoff) thuộc thẩm quyền của tầng quản lý phiên
 *      (Store / Hook vòng đời ở Phase P3.5), tránh tình trạng reconnect ngầm ngoài ý muốn.
 * 4. CẢNH BÁO BẢO MẬT KÊNH CÔNG CỘNG:
 *    - Kênh Broadcast + Presence không đi qua RLS bảng. Bất kỳ ai biết ID đều có thể kết nối.
 *    - Transport là ống truyền dẫn thuần túy (Dumb Pipe). Mọi thông điệp nhận được nếu sai
 *      cấu trúc hoặc phiên bản lạ sẽ bị bỏ qua an toàn; các hành động thay đổi trạng thái
 *      game bắt buộc phải qua thẩm định của Edge Function Trọng Tài (P3.2).
 * ==============================================================================
 */

import { supabase } from '@/repositories/supabaseClient';
import { RepoError } from '@/repositories/types';
import type {
  ChannelStatus,
  MatchChannelHandlers,
  PresenceMember,
  TransportEnvelope,
} from './types';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Regex kiểm tra tính hợp lệ của matchId.
 * Hỗ trợ 2 định dạng:
 * 1. UUID v4 chuẩn (ví dụ: '123e4567-e89b-12d3-a456-426614174000')
 * 2. Mã phòng 6 ký tự viết hoa [A-Z0-9]{6} (chuẩn bị sẵn cho tính năng Phòng Đấu ở P3.3)
 */
const MATCH_ID_REGEX =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Z0-9]{6})$/i;

/**
 * Giao diện điều khiển kênh kết nối ván đấu Realtime.
 */
export interface MatchChannel {
  /**
   * Khởi tạo kết nối WebSocket tới kênh 'match:{matchId}', lắng nghe Broadcast và theo dõi Presence.
   *
   * @throws {Error} Nếu matchId không hợp lệ hoặc kênh đang trong quá trình kết nối.
   */
  connect(): Promise<void>;

  /**
   * Đóng gói payload vào `TransportEnvelope` chuẩn và phát sóng tới toàn bộ người chơi trong phòng.
   *
   * @param type Tên sự kiện / loại thông điệp (ví dụ: 'move', 'chat', 'ping'...).
   * @param payload Dữ liệu đính kèm của thông điệp.
   * @throws {RepoError} Lỗi RETRYABLE nếu gửi thất bại hoặc bị quá thời gian chờ (ACK timeout).
   */
  send(type: string, payload: unknown): Promise<void>;

  /**
   * Lấy danh sách thành viên hiện diện hiện tại trong kênh, sắp xếp tăng dần theo `joinedAt`.
   */
  getMembers(): PresenceMember[];

  /**
   * Ngắt kết nối, dọn dẹp sạch Presence và hủy đăng ký kênh khỏi Supabase Client.
   * Hàm này an toàn và có tính Idempotent (gọi nhiều lần không gây lỗi).
   */
  disconnect(): Promise<void>;

  /**
   * Lấy trạng thái vòng đời kết nối hiện tại của kênh.
   */
  status(): ChannelStatus;
}

/**
 * Kiểm tra xem một đối tượng nhận được có phải là `TransportEnvelope` phiên bản 1 hợp lệ hay không.
 */
function isValidTransportEnvelope(obj: unknown): obj is TransportEnvelope {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  const env = obj as Record<string, unknown>;
  return (
    env.v === 1 &&
    typeof env.type === 'string' &&
    env.type.trim().length > 0 &&
    typeof env.senderId === 'string' &&
    env.senderId.trim().length > 0 &&
    typeof env.sentAt === 'string' &&
    'payload' in env
  );
}

/**
 * Trích xuất envelope từ gói tin Broadcast nhận được từ Supabase Realtime.
 */
function extractEnvelope(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    // Supabase Realtime broadcast payload wrapper: { event: string, type: 'broadcast', payload: envelope }
    if ('payload' in raw && typeof (raw as Record<string, unknown>).payload === 'object') {
      const inner = (raw as Record<string, unknown>).payload;
      if (inner !== null && typeof inner === 'object' && 'v' in inner) {
        return inner;
      }
    }
  }
  return raw;
}

/**
 * Hàm khởi tạo (Factory Function) một kênh kết nối ván đấu Realtime Transport.
 *
 * @param matchId Định danh ván đấu (UUID hoặc Mã phòng 6 ký tự).
 * @param self Thông tin thành viên hiện diện của chính người dùng hiện tại.
 * @param handlers Bộ lắng nghe sự kiện thông điệp, presence và biến động trạng thái.
 * @returns Đối tượng điều khiển `MatchChannel`.
 * @throws {Error} Nếu `matchId` không đúng định dạng an toàn.
 */
export function createMatchChannel(
  matchId: string,
  self: PresenceMember,
  handlers: MatchChannelHandlers,
): MatchChannel {
  const normalizedMatchId = matchId.trim();
  if (!MATCH_ID_REGEX.test(normalizedMatchId)) {
    throw new Error(
      `[Transport] matchId không hợp lệ: "${matchId}". Bắt buộc phải là UUID chuẩn hoặc mã 6 ký tự [A-Z0-9]{6}.`,
    );
  }

  let currentStatus: ChannelStatus = 'idle';
  let membersCache: PresenceMember[] = [];
  let channelInstance: RealtimeChannel | null = null;

  /**
   * Cập nhật danh sách Presence từ state của channel và thông báo cho handler.
   */
  function syncPresenceState(channel: RealtimeChannel): void {
    try {
      const state = channel.presenceState();
      const memberMap = new Map<string, PresenceMember>();

      // state có cấu trúc: { [presenceKey: string]: Array<{ userId, displayName, joinedAt, ... }> }
      Object.values(state).forEach((presences) => {
        if (Array.isArray(presences)) {
          presences.forEach((item) => {
            const rawItem = item as unknown as Record<string, unknown>;
            if (
              rawItem &&
              typeof rawItem === 'object' &&
              typeof rawItem['userId'] === 'string' &&
              typeof rawItem['displayName'] === 'string' &&
              typeof rawItem['joinedAt'] === 'string'
            ) {
              const member: PresenceMember = {
                userId: rawItem['userId'],
                displayName: rawItem['displayName'],
                joinedAt: rawItem['joinedAt'],
              };

              // Giữ lại bản ghi có joinedAt mới nhất nếu có trùng lặp userId
              const existing = memberMap.get(member.userId);
              if (!existing || new Date(member.joinedAt) > new Date(existing.joinedAt)) {
                memberMap.set(member.userId, member);
              }
            }
          });
        }
      });

      // Sắp xếp danh sách deterministic tăng dần theo thời điểm tham gia (joinedAt)
      const sortedMembers = Array.from(memberMap.values()).sort(
        (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
      );

      membersCache = sortedMembers;
      handlers.onPresenceChange(sortedMembers);
    } catch (err) {
      console.warn('[Transport] Lỗi khi đồng bộ danh sách Presence:', err);
    }
  }

  const matchChannel: MatchChannel = {
    async connect(): Promise<void> {
      if (currentStatus === 'connected' || currentStatus === 'connecting') {
        return;
      }

      currentStatus = 'connecting';
      handlers.onStatusChange('connecting');

      const channelName = `match:${normalizedMatchId}`;

      // Khởi tạo Supabase Channel với cấu hình Broadcast có ACK (chờ phản hồi xác nhận)
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: {
            self: false, // Không nhận lại chính tin nhắn do mình phát đi
            ack: true, // Yêu cầu server gửi ACK để phát hiện lỗi đường truyền
          },
          presence: {
            key: self.userId,
          },
        },
      });

      channelInstance = channel;

      // 1. Lắng nghe toàn bộ sự kiện Broadcast
      channel.on('broadcast', { event: '*' }, (eventData) => {
        const rawEnvelope = extractEnvelope(eventData);

        if (!isValidTransportEnvelope(rawEnvelope)) {
          console.warn(
            `[Transport] Bỏ qua thông điệp không đúng cấu trúc TransportEnvelope (v=1) trên kênh ${channelName}:`,
            rawEnvelope,
          );
          return;
        }

        handlers.onMessage(rawEnvelope);
      });

      // 2. Lắng nghe các sự kiện Presence (sync, join, leave)
      channel.on('presence', { event: 'sync' }, () => {
        syncPresenceState(channel);
      });

      channel.on('presence', { event: 'join' }, () => {
        syncPresenceState(channel);
      });

      channel.on('presence', { event: 'leave' }, () => {
        syncPresenceState(channel);
      });

      // 3. Đăng ký kênh và xử lý ánh xạ trạng thái kết nối
      return new Promise<void>((resolve, reject) => {
        let isResolved = false;

        channel.subscribe(async (supabaseStatus, err) => {
          switch (supabaseStatus) {
            case 'SUBSCRIBED': {
              currentStatus = 'connected';
              handlers.onStatusChange('connected');

              // Sau khi đã Subscribed thành công, tiến hành track thông tin Presence của bản thân
              try {
                await channel.track(self);
              } catch (trackError) {
                console.warn('[Transport] Lỗi khi theo dõi Presence cá nhân:', trackError);
              }

              if (!isResolved) {
                isResolved = true;
                resolve();
              }
              break;
            }

            case 'TIMED_OUT': {
              currentStatus = 'error';
              const detailMsg =
                err?.message || 'Quá thời gian thiết lập kết nối Realtime (TIMED_OUT)';
              handlers.onStatusChange('error', detailMsg);

              if (!isResolved) {
                isResolved = true;
                reject(new RepoError(detailMsg, 'RETRYABLE', err));
              }
              break;
            }

            case 'CHANNEL_ERROR': {
              currentStatus = 'error';
              const detailMsg = err?.message || 'Lỗi kết nối kênh Realtime (CHANNEL_ERROR)';
              handlers.onStatusChange('error', detailMsg);

              if (!isResolved) {
                isResolved = true;
                reject(new RepoError(detailMsg, 'RETRYABLE', err));
              }
              break;
            }

            case 'CLOSED': {
              if (currentStatus !== 'closed') {
                currentStatus = 'closed';
                handlers.onStatusChange('closed');
              }
              break;
            }
          }
        });
      });
    },

    async send(type: string, payload: unknown): Promise<void> {
      if (currentStatus !== 'connected' || !channelInstance) {
        throw new RepoError(
          `Không thể gửi thông điệp "${type}": Kênh chưa kết nối (trạng thái: ${currentStatus}).`,
          'RETRYABLE',
        );
      }

      const envelope: TransportEnvelope = {
        v: 1,
        type,
        senderId: self.userId,
        sentAt: new Date().toISOString(),
        payload,
      };

      try {
        const result = await channelInstance.send({
          type: 'broadcast',
          event: type,
          payload: envelope,
        });

        // Supabase broadcast send trả về: 'ok' | 'timed out' | 'error'
        if (result !== 'ok') {
          throw new RepoError(
            `Gửi thông điệp "${type}" thất bại với mã phản hồi: ${result}`,
            'RETRYABLE',
          );
        }
      } catch (err) {
        if (err instanceof RepoError) {
          throw err;
        }
        throw new RepoError(
          `Lỗi khi phát sóng thông điệp "${type}": ${err instanceof Error ? err.message : String(err)}`,
          'RETRYABLE',
          err,
        );
      }
    },

    getMembers(): PresenceMember[] {
      return [...membersCache];
    },

    async disconnect(): Promise<void> {
      if (currentStatus === 'closed' && !channelInstance) {
        return;
      }

      currentStatus = 'closed';
      membersCache = [];

      const channelToClean = channelInstance;
      channelInstance = null;

      if (channelToClean) {
        // Dọn dẹp sạch sẽ theo thứ tự: untrack -> unsubscribe -> removeChannel
        try {
          await channelToClean.untrack();
        } catch {
          // Bỏ qua lỗi dọn dẹp khi mạng đã ngắt
        }

        try {
          await channelToClean.unsubscribe();
        } catch {
          // Bỏ qua lỗi khi unsubscribe
        }

        try {
          await supabase.removeChannel(channelToClean);
        } catch {
          // Bỏ qua lỗi remove
        }
      }

      handlers.onStatusChange('closed');
    },

    status(): ChannelStatus {
      return currentStatus;
    },
  };

  return matchChannel;
}
