/**
 * ==============================================================================
 * HOOK QUẢN LÝ VÒNG ĐỜI KẾT NỐI REALTIME (SRC/TRANSPORT/USEMATCHCHANNEL.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & NGUYÊN TẮC BẢO VỆ VÒNG ĐỜI (LIFECYCLE INVARIANTS):
 * 1. QUẢN LÝ VÒNG ĐỜI AN TOÀN TUYỆT ĐỐI (ZERO LEAK):
 *    - Mỗi component ván đấu khi mount với `matchId` hợp lệ và `enabled=true` sẽ khởi tạo
 *      1 kết nối duy nhất qua `createMatchChannel()`.
 *    - Khi unmount hoặc đổi trận đấu, BẮT BUỘC phải disconnect và dọn dẹp sạch sẽ tài nguyên.
 * 2. CHỐNG RACE CONDITION KHI UNMOUNT GIỮA CHỪNG (CASE A):
 *    - Sử dụng `connectionIdRef` kết hợp cờ `isCancelled` để đảm bảo nếu component bị unmount
 *      trong lúc `channel.connect()` vẫn đang pending bất đồng bộ, kết nối sẽ tự động bị
 *      hủy bỏ ngay khi resolve xong, không bao giờ bị treo kết nối mồ côi (orphan connection).
 * 3. AN TOÀN TUYỆT ĐỐI VỚI REACT 18 STRICTMODE (CASE B):
 *    - Cơ chế cleanup đảm bảo chu kỳ mount -> unmount -> mount kép của StrictMode chỉ để lại
 *      đúng 1 kết nối duy nhất sống sót.
 * 4. ĐỔI TRẬN ĐẤU TUẦN TỰ (CASE C):
 *    - Khi `matchId` thay đổi, kênh cũ bị disconnect TRƯỚC, sau đó kênh mới mới được connect.
 * 5. TRÁNH RECONNECT VÌ ONMESSAGE THAY ĐỔI THAM CHIẾU (CASE D):
 *    - `onMessage` callback được lưu giữ qua `useRef`, không đưa vào dependency array của
 *      `useEffect`, ngăn chặn triệt để bug reconnect thừa thãi mỗi khi parent re-render.
 * 6. CHÍNH SÁCH MOBILE & QUOTA WATCHDOG:
 *    - `visibilitychange`: Giữ nguyên kết nối khi tab chuyển sang hidden (game đối kháng theo lượt).
 *    - `offline`: Chuyển trạng thái sang 'error' kèm lỗi 'offline', cung cấp `reconnect()` thủ công.
 *    - Watchdog DEV-only: Báo động `console.error` nếu phát hiện >1 hook active trong 1 tab.
 * 7. RANH GIỚI PHÂN TẦNG:
 *    - Hook nhận `enabled` từ caller, tuyệt đối KHÔNG import trực tiếp `gameSessionStore`
 *      hay các store của game, bảo toàn luật phụ thuộc 1 chiều.
 * ==============================================================================
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { createMatchChannel, type MatchChannel } from './matchChannel';
import type {
  ChannelStatus,
  MatchChannelHandlers,
  PresenceMember,
  TransportEnvelope,
} from './types';
import { useTransportStore, useTransportStatus, useChannelMembers } from '@/stores/transportStore';
import { RepoError } from '@/repositories/types';

/**
 * Biến đếm toàn cục cấp module dùng để giám sát số lượng hook `useMatchChannel`
 * đang kích hoạt đồng thời trong một tab trình duyệt (Chỉ hoạt động ở môi trường DEV).
 */
let devActiveHookCount = 0;

/**
 * Tùy chọn đầu vào cho hook `useMatchChannel`.
 */
export interface UseMatchChannelOptions {
  /**
   * Mã định danh ván đấu / phòng đấu (UUID hoặc mã 6 ký tự).
   * Truyền `null` khi chưa vào trận để tắt kết nối (trạng thái idle).
   */
  readonly matchId: string | null;

  /**
   * Thông tin thành viên hiện diện của người chơi hiện tại.
   * Truyền `null` nếu người dùng chưa hoàn tất khởi tạo Auth.
   */
  readonly self: PresenceMember | null;

  /**
   * Callback nhận thông điệp Broadcast hợp lệ (`TransportEnvelope (v=1)`).
   */
  readonly onMessage: (env: TransportEnvelope) => void;

  /**
   * Cờ cho phép hook kích hoạt kết nối.
   * Mặc định là `true`. Truyền `false` khi muốn tạm dừng hoặc kiểm soát theo màn hình.
   */
  readonly enabled?: boolean;
}

/**
 * Kết quả trả về từ hook `useMatchChannel`.
 */
export interface UseMatchChannelResult {
  /** Trạng thái kết nối hiện tại của kênh */
  readonly status: ChannelStatus;
  /** Danh sách thành viên đang hiện diện trong phòng đấu (sắp xếp tăng dần theo joinedAt) */
  readonly members: readonly PresenceMember[];
  /** Hàm phát sóng thông điệp tới toàn bộ người chơi trong phòng */
  readonly send: (type: string, payload: unknown) => Promise<void>;
  /** Hàm kết nối lại thủ công khi gặp lỗi đường truyền hoặc vừa có mạng trở lại */
  readonly reconnect: () => Promise<void>;
}

/**
 * React Hook quản lý toàn diện vòng đời kết nối Realtime Transport của một ván đấu.
 */
export function useMatchChannel(options: UseMatchChannelOptions): UseMatchChannelResult {
  const { matchId, self, onMessage, enabled = true } = options;

  // Lấy trạng thái phản chiếu từ transportStore
  const status = useTransportStatus();
  const members = useChannelMembers();

  // Tham chiếu lưu instance MatchChannel hiện tại
  const channelRef = useRef<MatchChannel | null>(null);

  // Số đếm ID lượt kết nối tăng dần (Chống Race Condition - Ca a)
  const connectionIdRef = useRef<number>(0);

  // Tham chiếu giữ callback onMessage mới nhất mà không gây re-trigger useEffect (Ca d)
  const onMessageRef = useRef<(env: TransportEnvelope) => void>(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  // Memoize thông tin self để tránh trigger lại effect khi object self thay đổi con trỏ
  const selfUserId = self?.userId;
  const selfDisplayName = self?.displayName;
  const selfJoinedAt = self?.joinedAt;

  const selfMemo = useMemo<PresenceMember | null>(() => {
    if (!selfUserId || !selfDisplayName || !selfJoinedAt) return null;
    return {
      userId: selfUserId,
      displayName: selfDisplayName,
      joinedAt: selfJoinedAt,
    };
  }, [selfUserId, selfDisplayName, selfJoinedAt]);

  /**
   * Hàm khởi tạo kết nối an toàn cho một lượt cụ thể.
   */
  const establishConnection = useCallback(
    (targetMatchId: string, targetSelf: PresenceMember, runId: number) => {
      let isCancelled = false;

      const handlers: MatchChannelHandlers = {
        onMessage: (env) => {
          if (connectionIdRef.current === runId && !isCancelled) {
            onMessageRef.current(env);
          }
        },
        onPresenceChange: (presenceMembers) => {
          if (connectionIdRef.current === runId && !isCancelled) {
            useTransportStore.getState().setMembers(presenceMembers);
          }
        },
        onStatusChange: (newStatus, detail) => {
          if (connectionIdRef.current === runId && !isCancelled) {
            useTransportStore.getState().setStatus(newStatus);
            if (detail) {
              useTransportStore.getState().setLastError(detail);
            } else if (newStatus === 'connected') {
              useTransportStore.getState().setLastError(null);
            }
          }
        },
      };

      try {
        const channel = createMatchChannel(targetMatchId, targetSelf, handlers);
        channelRef.current = channel;
        useTransportStore.getState().setActiveChannelId(targetMatchId);

        channel
          .connect()
          .catch((err) => {
            if (connectionIdRef.current === runId && !isCancelled) {
              useTransportStore.getState().setStatus('error');
              useTransportStore
                .getState()
                .setLastError(err instanceof Error ? err.message : String(err));
            }
          })
          .finally(() => {
            // [CASE A & B - RACE PROTECTION]:
            // Nếu unmount hoặc có lượt kết nối mới xảy ra trong khi connect() đang chạy bất đồng bộ,
            // ngắt kết nối channel này ngay lập tức để không bị rò rỉ CCU Free Tier.
            if (isCancelled || connectionIdRef.current !== runId) {
              channel.disconnect().catch(() => undefined);
            }
          });

        return () => {
          isCancelled = true;
          if (channelRef.current === channel) {
            channelRef.current = null;
          }
          channel.disconnect().catch(() => undefined);
          useTransportStore.getState().reset();
        };
      } catch (createErr) {
        useTransportStore.getState().setStatus('error');
        useTransportStore
          .getState()
          .setLastError(createErr instanceof Error ? createErr.message : String(createErr));
        return () => {
          isCancelled = true;
          useTransportStore.getState().reset();
        };
      }
    },
    [],
  );

  // ==============================================================================
  // VÒNG ĐỜI KẾT NỐI CHÍNH (LIFECYCLE EFFECT)
  // ==============================================================================
  useEffect(() => {
    // 1. Giám sát Quota Watchdog (Chỉ chạy ở DEV)
    if (import.meta.env.DEV && matchId && selfMemo && enabled) {
      devActiveHookCount++;
      if (devActiveHookCount > 1) {
        console.error(
          `[Transport Watchdog] ⚠️ CẢNH BÁO: Phát hiện ${devActiveHookCount} useMatchChannel đang active cùng lúc trong 1 tab! Nguy cơ rò rỉ kết nối Supabase Free Tier (Tối đa 200 CCU).`,
        );
      }
    }

    const currentRunId = ++connectionIdRef.current;

    // 2. Nếu matchId null, self null hoặc enabled=false -> Ngắt kết nối cũ và reset về idle
    if (!matchId || !selfMemo || enabled === false) {
      if (channelRef.current) {
        const prev = channelRef.current;
        channelRef.current = null;
        prev.disconnect().catch(() => undefined);
      }
      useTransportStore.getState().reset();

      return () => {
        if (import.meta.env.DEV && matchId && selfMemo && enabled) {
          devActiveHookCount = Math.max(0, devActiveHookCount - 1);
        }
      };
    }

    // 3. [CASE C - ĐỔI MATCHID]: Dọn dẹp kênh cũ trước khi thiết lập kênh mới
    if (channelRef.current) {
      const prev = channelRef.current;
      channelRef.current = null;
      prev.disconnect().catch(() => undefined);
    }

    // 4. Thiết lập kết nối kênh mới
    const cleanup = establishConnection(matchId, selfMemo, currentRunId);

    // 5. Cleanup khi unmount hoặc đổi dependencies (Ca a & b)
    return () => {
      if (import.meta.env.DEV) {
        devActiveHookCount = Math.max(0, devActiveHookCount - 1);
      }
      cleanup();
    };
  }, [matchId, selfMemo, enabled, establishConnection]);

  // ==============================================================================
  // XỬ LÝ SỰ KIỆN THIẾT BỊ & MẠNG MOBILE
  // ==============================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;

    /**
     * [CHÍNH SÁCH MOBILE - VISIBILITYCHANGE]:
     * Khi người dùng chuyển tab hoặc ẩn app xuống nền (hidden):
     * -> GIỮ NGUYÊN KẾT NỐI.
     * Lý do: Đối với game đối kháng theo lượt (Caro, Cờ tướng), người chơi chuyển sang
     * app khác vài giây để trả lời tin nhắn là bình thường. Supabase WebSocket có cơ chế
     * ping/pong tự nhiên, nếu ngắt mạng quá lâu server sẽ tự timeout. Cơ chế phục hồi
     * thông minh toàn diện sẽ được hoàn thiện tại Phase P3.5.
     */
    const handleVisibilityChange = () => {
      // Giữ kết nối, không ngắt khi hidden
    };

    /**
     * [SỰ KIỆN MẤT MẠNG OFFLINE]:
     * Báo lỗi đường truyền cho UI đọc và hiển thị banner trạng thái.
     */
    const handleOffline = () => {
      if (matchId && enabled) {
        useTransportStore.getState().setStatus('error');
        useTransportStore.getState().setLastError('Thiết bị mất kết nối Internet (offline).');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('offline', handleOffline);
    };
  }, [matchId, enabled]);

  /**
   * Hàm phát sóng thông điệp Envelope tới phòng đấu.
   */
  const send = useCallback(async (type: string, payload: unknown): Promise<void> => {
    const activeChannel = channelRef.current;
    if (!activeChannel || activeChannel.status() !== 'connected') {
      throw new RepoError(
        `Không thể gửi thông điệp "${type}": Kênh chưa kết nối hoặc đang ngoại tuyến.`,
        'RETRYABLE',
      );
    }

    await activeChannel.send(type, payload);
  }, []);

  /**
   * Hàm kết nối lại thủ công khi người dùng bấm thử lại hoặc mạng vừa online trở lại.
   */
  const reconnect = useCallback(async (): Promise<void> => {
    if (!matchId || !selfMemo || enabled === false) {
      return;
    }

    // Ngắt kênh cũ nếu có
    if (channelRef.current) {
      const prev = channelRef.current;
      channelRef.current = null;
      await prev.disconnect().catch(() => undefined);
    }

    const nextRunId = ++connectionIdRef.current;
    establishConnection(matchId, selfMemo, nextRunId);
  }, [matchId, selfMemo, enabled, establishConnection]);

  return {
    status,
    members,
    send,
    reconnect,
  };
}

export default useMatchChannel;
