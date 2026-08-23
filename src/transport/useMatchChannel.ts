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
 * 5. TRÁNH RECONNECT VÌ ONMESSAGE/ONRECONNECTED THAY ĐỔI THAM CHIẾU (CASE D):
 *    - `onMessage` và `onReconnected` callback được lưu giữ qua `useRef`, không đưa vào
 *      dependency array của `useEffect`, ngăn chặn triệt để bug reconnect thừa thãi.
 * 6. CƠ CHẾ AUTO-RECONNECT VỚI BACKOFF LŨY TIẾN & CỬA SỔ BỎ CUỘC (P3.5a):
 *    - Tự động kích hoạt khi rớt mạng, lỗi TIMED_OUT/CHANNEL_ERROR, hoặc sự kiện offline.
 *    - Backoff lũy tiến: lần 0 (ngay lập tức) -> 1s -> 2s -> 4s -> 8s -> tối đa 10s.
 *    - Jitter ±20% chống thundering herd khi có sự cố mạng diện rộng.
 *    - Cửa sổ bỏ cuộc đếm từ lần rớt đầu tiên đọc từ `system_config` (mặc định 60s fallback).
 *    - Kỷ luật dừng: enabled=false / unmount / matchId đổi -> hủy sạch timer đang chờ.
 * 7. CHÍNH SÁCH MOBILE:
 *    - `visibilitychange`: Khi chuyển tab sang visible -> thử kết nối lại ngay lập tức.
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
import { configRepository } from '@/repositories/configRepository';

/**
 * Biến đếm toàn cục cấp module dùng để giám sát số lượng hook `useMatchChannel`
 * đang kích hoạt đồng thời trong một tab trình duyệt (Chỉ hoạt động ở môi trường DEV).
 */
let devActiveHookCount = 0;

/**
 * Tính toán độ trễ backoff lũy tiến kèm Jitter ±20%.
 * - Lần 0: 0ms (thử lại ngay lập tức)
 * - Lần 1: 1000ms ± 20% (800ms - 1200ms)
 * - Lần 2: 2000ms ± 20% (1600ms - 2400ms)
 * - Lần 3: 4000ms ± 20% (3200ms - 4800ms)
 * - Lần 4: 8000ms ± 20% (6400ms - 9600ms)
 * - Lần 5+: 10000ms ± 20% (8000ms - 12000ms, cap tối đa 10s)
 *
 * Jitter ±20% giúp chống nghẽn sóng thundering herd khi nhiều client cùng rớt mạng.
 */
export function calculateBackoffDelayMs(attempt: number): number {
  if (attempt <= 0) return 0;
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  // Jitter ±20% [0.8, 1.2]
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(base * jitter);
}

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

  /**
   * Callback được kích hoạt mỗi khi kênh nối lại thành công sau sự cố rớt mạng.
   * (P3.5b sẽ truyền pipeline resync vào callback này).
   */
  readonly onReconnected?: () => void;
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
  const { matchId, self, onMessage, enabled = true, onReconnected } = options;

  // Lấy trạng thái phản chiếu từ transportStore
  const status = useTransportStatus();
  const members = useChannelMembers();

  // Tham chiếu lưu instance MatchChannel hiện tại
  const channelRef = useRef<MatchChannel | null>(null);

  // Số đếm ID lượt kết nối tăng dần (Chống Race Condition - Ca a)
  const connectionIdRef = useRef<number>(0);

  // Tham chiếu giữ callback onMessage và onReconnected mới nhất mà không gây re-trigger useEffect (Ca d)
  const onMessageRef = useRef<(env: TransportEnvelope) => void>(onMessage);
  const onReconnectedRef = useRef<(() => void) | undefined>(onReconnected);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onReconnectedRef.current = onReconnected;
  });

  // Số lần thử kết nối lại tự động hiện tại
  const attemptRef = useRef<number>(0);

  // Thời điểm rớt mạng đầu tiên (dùng để tính cửa sổ 60s)
  const droppedAtRef = useRef<number | null>(null);

  // Timer chờ backoff
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cờ báo hiệu ngắt kết nối chủ đích (unmount hoặc enabled=false) để không auto-reconnect
  const isIntentionalDisconnectRef = useRef<boolean>(false);

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

  // Ref giữ hàm scheduleAutoReconnect để decouple với establishConnection
  const scheduleAutoReconnectRef = useRef<() => Promise<void>>();

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
            if (newStatus === 'connected') {
              const wasReconnecting = droppedAtRef.current !== null || attemptRef.current > 0;
              droppedAtRef.current = null;
              attemptRef.current = 0;
              useTransportStore.getState().setReconnectInfo(0, null);
              useTransportStore.getState().setStatus('connected');
              useTransportStore.getState().setLastError(null);

              if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
              }

              // Gọi callback onReconnected khi kết nối lại thành công sau sự cố
              if (wasReconnecting) {
                onReconnectedRef.current?.();
              }
            } else if (newStatus === 'error' || newStatus === 'closed') {
              if (!isCancelled && !isIntentionalDisconnectRef.current && enabled) {
                useTransportStore.getState().setLastError(detail || 'Mất kết nối với máy chủ.');
                void scheduleAutoReconnectRef.current?.();
              } else {
                useTransportStore.getState().setStatus(newStatus);
                if (detail) useTransportStore.getState().setLastError(detail);
              }
            } else {
              useTransportStore.getState().setStatus(newStatus);
              if (detail) {
                useTransportStore.getState().setLastError(detail);
              }
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
              if (!isIntentionalDisconnectRef.current && enabled) {
                useTransportStore
                  .getState()
                  .setLastError(err instanceof Error ? err.message : String(err));
                void scheduleAutoReconnectRef.current?.();
              } else {
                useTransportStore.getState().setStatus('error');
                useTransportStore
                  .getState()
                  .setLastError(err instanceof Error ? err.message : String(err));
              }
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
        if (!isIntentionalDisconnectRef.current && enabled) {
          useTransportStore
            .getState()
            .setLastError(createErr instanceof Error ? createErr.message : String(createErr));
          void scheduleAutoReconnectRef.current?.();
        } else {
          useTransportStore.getState().setStatus('error');
          useTransportStore
            .getState()
            .setLastError(createErr instanceof Error ? createErr.message : String(createErr));
        }
        return () => {
          isCancelled = true;
          useTransportStore.getState().reset();
        };
      }
    },
    [enabled],
  );

  /**
   * Hàm lên lịch tự động kết nối lại theo chiến lược Backoff lũy tiến & Cửa sổ bỏ cuộc.
   */
  const scheduleAutoReconnect = useCallback(async () => {
    if (!matchId || !selfMemo || !enabled || isIntentionalDisconnectRef.current) {
      return;
    }

    // 1. Đếm cửa sổ từ lần rớt đầu tiên (rớt lần mới = cửa sổ mới)
    const now = Date.now();
    if (droppedAtRef.current === null) {
      droppedAtRef.current = now;
      attemptRef.current = 0;
    }

    // 2. Đọc cấu hình cửa sổ reconnect từ system_config (fallback 60s an toàn)
    const windowSeconds = await configRepository.getReconnectWindowSeconds();
    const windowDeadline = droppedAtRef.current + windowSeconds * 1000;

    // 3. Quá cửa sổ bỏ cuộc -> Chuyển sang 'failed' và dừng hẳn
    if (Date.now() >= windowDeadline) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      useTransportStore.getState().setStatus('failed');
      useTransportStore
        .getState()
        .setLastError('Đã vượt quá thời gian cho phép kết nối lại. Vui lòng thử lại thủ công.');
      useTransportStore.getState().setReconnectInfo(attemptRef.current, windowDeadline);
      return;
    }

    // 4. Tăng số lần thử và chuyển trạng thái sang reconnecting
    const nextAttempt = attemptRef.current + 1;
    attemptRef.current = nextAttempt;
    useTransportStore.getState().setStatus('reconnecting');
    useTransportStore.getState().setReconnectInfo(nextAttempt, windowDeadline);

    // 5. Tính toán độ trễ backoff kèm Jitter ±20%
    const delayMs = calculateBackoffDelayMs(nextAttempt - 1);

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!matchId || !selfMemo || !enabled || isIntentionalDisconnectRef.current) {
        return;
      }

      // Khởi tạo lượt kết nối mới
      const nextRunId = ++connectionIdRef.current;
      establishConnection(matchId, selfMemo, nextRunId);
    }, delayMs);
  }, [matchId, selfMemo, enabled, establishConnection]);

  scheduleAutoReconnectRef.current = scheduleAutoReconnect;

  // ==============================================================================
  // VÒNG ĐỜI KẾT NỐI CHÍNH (LIFECYCLE EFFECT)
  // ==============================================================================
  useEffect(() => {
    isIntentionalDisconnectRef.current = false;

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

    // 2. KỶ LUẬT DỪNG: Nếu matchId null, self null hoặc enabled=false -> Ngắt kết nối và hủy sạch timer
    if (!matchId || !selfMemo || !enabled) {
      isIntentionalDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      droppedAtRef.current = null;
      attemptRef.current = 0;

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

    // 3. [CASE C - ĐỔI MATCHID]: Dọn dẹp kênh cũ và timer trước khi thiết lập kênh mới
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    droppedAtRef.current = null;
    attemptRef.current = 0;

    if (channelRef.current) {
      const prev = channelRef.current;
      channelRef.current = null;
      prev.disconnect().catch(() => undefined);
    }

    // 4. Thiết lập kết nối kênh mới
    const cleanup = establishConnection(matchId, selfMemo, currentRunId);

    // 5. Cleanup khi unmount hoặc đổi dependencies (Ca a & b)
    return () => {
      isIntentionalDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (import.meta.env.DEV) {
        devActiveHookCount = Math.max(0, devActiveHookCount - 1);
      }
      cleanup();
    };
  }, [matchId, selfMemo, enabled, establishConnection]);

  // ==============================================================================
  // XỬ LÝ SỰ KIỆN THIẾT BỊ & MẠNG MOBILE (AUTO-RECONNECT TRIGGERS)
  // ==============================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;

    /**
     * [TRIGGER MOBILE QUAN TRỌNG NHẤT - VISIBILITYCHANGE]:
     * Khi người dùng chuyển app hoặc mở lại màn hình (visible):
     * Nếu trạng thái đang là 'reconnecting' hoặc 'error' -> Thử kết nối lại ngay lập tức
     * (Bỏ qua thời gian chờ backoff còn lại để người dùng vào trận nhanh nhất).
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && matchId && selfMemo && enabled) {
        const currentStatus = useTransportStore.getState().status;
        if (currentStatus === 'reconnecting' || currentStatus === 'error') {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          const nextRunId = ++connectionIdRef.current;
          establishConnection(matchId, selfMemo, nextRunId);
        }
      }
    };

    /**
     * [SỰ KIỆN CÓ MẠNG TRỞ LẠI - ONLINE]:
     * Khi thiết bị có sóng internet trở lại -> Thử kết nối ngay.
     */
    const handleOnline = () => {
      if (matchId && selfMemo && enabled) {
        const currentStatus = useTransportStore.getState().status;
        if (currentStatus === 'reconnecting' || currentStatus === 'error') {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          const nextRunId = ++connectionIdRef.current;
          establishConnection(matchId, selfMemo, nextRunId);
        }
      }
    };

    /**
     * [SỰ KIỆN MẤT MẠNG - OFFLINE]:
     * Kích hoạt quy trình auto-reconnect.
     */
    const handleOffline = () => {
      if (matchId && selfMemo && enabled) {
        useTransportStore.getState().setLastError('Thiết bị mất kết nối Internet (offline).');
        scheduleAutoReconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [matchId, selfMemo, enabled, establishConnection, scheduleAutoReconnect]);

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
   * Hàm kết nối lại thủ công khi người dùng bấm thử lại.
   * Người dùng chủ động -> Cấp một cơ hội mới, reset cửa sổ 60s và số lần thử.
   */
  const reconnect = useCallback(async (): Promise<void> => {
    if (!matchId || !selfMemo || !enabled) {
      return;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    droppedAtRef.current = Date.now();
    attemptRef.current = 1;
    useTransportStore.getState().setStatus('connecting');
    useTransportStore.getState().setLastError(null);

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
