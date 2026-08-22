// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchChannel, type UseMatchChannelOptions } from '@/transport/useMatchChannel';
import * as matchChannelModule from '@/transport/matchChannel';
import { useTransportStore } from '@/stores/transportStore';
import type { PresenceMember, TransportEnvelope, MatchChannelHandlers } from '@/transport/types';

describe('useMatchChannel React Hook Lifecycle & Leak Prevention Tests (P3.1b)', () => {
  const mockSelf: PresenceMember = {
    userId: '11111111-1111-1111-1111-111111111111',
    displayName: 'Player One',
    joinedAt: '2026-08-22T10:00:00.000Z',
  };

  let mockChannelInstances: {
    matchId: string;
    handlers: MatchChannelHandlers;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    getMembers: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  }[];

  beforeEach(() => {
    vi.restoreAllMocks();
    useTransportStore.getState().reset();
    mockChannelInstances = [];

    vi.spyOn(matchChannelModule, 'createMatchChannel').mockImplementation(
      (matchId: string, _self: PresenceMember, handlers: MatchChannelHandlers) => {
        let channelStatus: import('@/transport/types').ChannelStatus = 'idle';
        const instance = {
          matchId,
          handlers,
          connect: vi.fn().mockImplementation(async () => {
            channelStatus = 'connected';
            handlers.onStatusChange('connected');
            return Promise.resolve();
          }),
          disconnect: vi.fn().mockImplementation(async () => {
            channelStatus = 'closed';
            handlers.onStatusChange('closed');
            return Promise.resolve();
          }),
          send: vi.fn().mockResolvedValue(undefined),
          getMembers: vi.fn().mockReturnValue([]),
          status: vi.fn().mockImplementation(() => channelStatus),
        };
        mockChannelInstances.push(instance);
        return instance;
      },
    );
  });

  afterEach(() => {
    useTransportStore.getState().reset();
  });

  describe('1. Vòng Đời Cơ Bản (Mount / Unmount Lifecycle - Ca a)', () => {
    it('Mount với matchId hợp lệ: tạo đúng 1 channel, gọi connect(), cập nhật status connected', async () => {
      const onMessage = vi.fn();
      const options: UseMatchChannelOptions = {
        matchId: 'ROOM01',
        self: mockSelf,
        onMessage,
        enabled: true,
      };

      const { result, unmount } = renderHook(() => useMatchChannel(options));

      expect(matchChannelModule.createMatchChannel).toHaveBeenCalledTimes(1);
      expect(mockChannelInstances).toHaveLength(1);
      expect(mockChannelInstances[0].connect).toHaveBeenCalledTimes(1);

      expect(result.current.status).toBe('connected');
      expect(useTransportStore.getState().activeChannelId).toBe('ROOM01');
      expect(useTransportStore.getState().status).toBe('connected');

      // Unmount: gọi disconnect và reset store về idle
      unmount();

      expect(mockChannelInstances[0].disconnect).toHaveBeenCalledTimes(1);
      expect(useTransportStore.getState().activeChannelId).toBeNull();
      expect(useTransportStore.getState().status).toBe('idle');
    });

    it('Chống Race Condition: Unmount giữa lúc connect() đang pending bất đồng bộ (Ca a)', async () => {
      let resolveConnectPromise: () => void = () => undefined;
      const pendingConnectPromise = new Promise<void>((resolve) => {
        resolveConnectPromise = resolve;
      });

      vi.spyOn(matchChannelModule, 'createMatchChannel').mockImplementation(
        (matchId: string, _self: PresenceMember, handlers: MatchChannelHandlers) => {
          const instance = {
            matchId,
            handlers,
            connect: vi.fn().mockReturnValue(pendingConnectPromise),
            disconnect: vi.fn().mockResolvedValue(undefined),
            send: vi.fn().mockResolvedValue(undefined),
            getMembers: vi.fn().mockReturnValue([]),
            status: vi.fn().mockReturnValue('connecting'),
          };
          mockChannelInstances.push(instance);
          return instance;
        },
      );

      const options: UseMatchChannelOptions = {
        matchId: 'ROOM_PENDING',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      const { unmount } = renderHook(() => useMatchChannel(options));

      expect(mockChannelInstances[0].connect).toHaveBeenCalledTimes(1);

      // Unmount TRƯỚC KHI connect kịp resolve
      unmount();
      expect(mockChannelInstances[0].disconnect).toHaveBeenCalledTimes(1);

      // Bây giờ connect mới resolve xong -> disconnect vẫn phải được gọi để triệt tiêu kết nối mồ côi
      await act(async () => {
        resolveConnectPromise();
        await pendingConnectPromise;
      });

      expect(mockChannelInstances[0].disconnect).toHaveBeenCalled();
      expect(useTransportStore.getState().status).toBe('idle');
    });
  });

  describe('2. An Toàn Tuyệt Đối Với React 18 StrictMode (Ca b)', () => {
    it('StrictMode mount -> unmount -> mount kép: chỉ 1 kết nối duy nhất sống sót, kênh cũ bị dọn dẹp sạch', () => {
      const options: UseMatchChannelOptions = {
        matchId: 'ROOM_STRICT',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      // Giả lập chu kỳ 1 của StrictMode
      const { unmount } = renderHook(() => useMatchChannel(options));
      expect(mockChannelInstances).toHaveLength(1);
      expect(mockChannelInstances[0].connect).toHaveBeenCalledTimes(1);

      unmount();
      expect(mockChannelInstances[0].disconnect).toHaveBeenCalledTimes(1);

      // Giả lập chu kỳ 2 của StrictMode
      const hook2 = renderHook(() => useMatchChannel(options));
      expect(mockChannelInstances).toHaveLength(2);
      expect(mockChannelInstances[1].connect).toHaveBeenCalledTimes(1);
      expect(hook2.result.current.status).toBe('connected');

      // Cuối cùng chỉ có 1 instance active (instance 0 đã disconnect, instance 1 đang connected)
      expect(mockChannelInstances[0].status()).toBe('closed');
      expect(mockChannelInstances[1].status()).toBe('connected');

      hook2.unmount();
      expect(mockChannelInstances[1].disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Đổi Trận Đấu Tuần Tự (Change matchId - Ca c)', () => {
    it('Đổi matchId: ngắt kết nối kênh cũ TRƯỚC KHI kết nối kênh mới', () => {
      const callOrder: string[] = [];

      vi.spyOn(matchChannelModule, 'createMatchChannel').mockImplementation(
        (matchId: string, _self: PresenceMember, handlers: MatchChannelHandlers) => {
          const instance = {
            matchId,
            handlers,
            connect: vi.fn().mockImplementation(async () => {
              callOrder.push(`connect:${matchId}`);
              handlers.onStatusChange('connected');
            }),
            disconnect: vi.fn().mockImplementation(async () => {
              callOrder.push(`disconnect:${matchId}`);
              handlers.onStatusChange('closed');
            }),
            send: vi.fn().mockResolvedValue(undefined),
            getMembers: vi.fn().mockReturnValue([]),
            status: vi.fn().mockReturnValue('connected'),
          };
          mockChannelInstances.push(instance);
          return instance;
        },
      );

      const initialProps: UseMatchChannelOptions = {
        matchId: 'ROOM11',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      const { rerender } = renderHook((props: UseMatchChannelOptions) => useMatchChannel(props), {
        initialProps,
      });

      expect(callOrder).toEqual(['connect:ROOM11']);

      // Đổi sang ROOM22
      rerender({
        matchId: 'ROOM22',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      });

      // Thứ tự bắt buộc: disconnect:ROOM11 -> connect:ROOM22
      expect(callOrder).toEqual(['connect:ROOM11', 'disconnect:ROOM11', 'connect:ROOM22']);
      expect(useTransportStore.getState().activeChannelId).toBe('ROOM22');
    });

    it('matchId null hoặc enabled=false: không kết nối và giữ trạng thái idle', () => {
      const { result, rerender } = renderHook(
        (props: UseMatchChannelOptions) => useMatchChannel(props),
        {
          initialProps: {
            matchId: null,
            self: mockSelf,
            onMessage: vi.fn(),
            enabled: true,
          },
        },
      );

      expect(matchChannelModule.createMatchChannel).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');

      // Bật matchId nhưng enabled=false -> vẫn không connect
      rerender({
        matchId: 'ROOM33',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: false,
      });

      expect(matchChannelModule.createMatchChannel).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });
  });

  describe('4. Tránh Reconnect Khi onMessage Đổi Tham Chiếu (Ca d)', () => {
    it('onMessage đổi tham chiếu sau mỗi render KHÔNG làm disconnect hay reconnect channel', () => {
      let messageReceived: TransportEnvelope | null = null;
      const callback1 = vi.fn();

      const { rerender } = renderHook(
        ({ onMsg }: { onMsg: (env: TransportEnvelope) => void }) =>
          useMatchChannel({
            matchId: 'ROOM_CALLBACK',
            self: mockSelf,
            onMessage: onMsg,
            enabled: true,
          }),
        { initialProps: { onMsg: callback1 } },
      );

      expect(mockChannelInstances).toHaveLength(1);
      expect(mockChannelInstances[0].connect).toHaveBeenCalledTimes(1);

      // Re-render với callback2 hoàn toàn mới
      const callback2 = vi.fn((env: TransportEnvelope) => {
        messageReceived = env;
      });

      rerender({ onMsg: callback2 });

      // KHÔNG được tạo channel mới, KHÔNG được gọi disconnect/reconnect
      expect(mockChannelInstances).toHaveLength(1);
      expect(mockChannelInstances[0].connect).toHaveBeenCalledTimes(1);
      expect(mockChannelInstances[0].disconnect).not.toHaveBeenCalled();

      // Khi có thông điệp tới -> callback2 mới nhất được thực thi
      const testEnv: TransportEnvelope = {
        v: 1,
        type: 'move',
        senderId: 'someone',
        sentAt: new Date().toISOString(),
        payload: { move: 10 },
      };

      mockChannelInstances[0].handlers.onMessage(testEnv);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(testEnv);
      expect(messageReceived).toEqual(testEnv);
    });
  });

  describe('5. Xử Lý Sự Kiện Mạng & Reconnect Thủ Công', () => {
    it('Sự kiện offline cập nhật status sang error; gọi reconnect() kết nối lại thành công', async () => {
      const options: UseMatchChannelOptions = {
        matchId: 'ROOM_OFFLINE',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      const { result } = renderHook(() => useMatchChannel(options));
      expect(result.current.status).toBe('connected');

      // Giả lập sự kiện mất mạng offline
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(useTransportStore.getState().status).toBe('error');
      expect(useTransportStore.getState().lastError).toMatch(/offline/i);

      // Gọi reconnect() thủ công
      await act(async () => {
        await result.current.reconnect();
      });

      expect(mockChannelInstances).toHaveLength(2);
      expect(mockChannelInstances[0].disconnect).toHaveBeenCalled();
      expect(mockChannelInstances[1].connect).toHaveBeenCalled();
      expect(useTransportStore.getState().status).toBe('connected');
    });

    it('Gửi thông điệp qua send(): gọi channel.send khi connected, ném lỗi khi chưa connect', async () => {
      const options: UseMatchChannelOptions = {
        matchId: 'ROOM_SEND',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      const { result } = renderHook(() => useMatchChannel(options));

      await act(async () => {
        await result.current.send('chat', { text: 'Xin chào!' });
      });

      expect(mockChannelInstances[0].send).toHaveBeenCalledWith('chat', { text: 'Xin chào!' });
    });
  });

  describe('6. Quota Watchdog (DEV-only Warning)', () => {
    it('Cảnh báo console.error khi phát hiện hơn 1 useMatchChannel active đồng thời trong 1 tab', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockReturnValue();

      const options1: UseMatchChannelOptions = {
        matchId: 'ROOM_WATCHDOG_1',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      const options2: UseMatchChannelOptions = {
        matchId: 'ROOM_WATCHDOG_2',
        self: mockSelf,
        onMessage: vi.fn(),
        enabled: true,
      };

      // Render hook thứ nhất
      const hook1 = renderHook(() => useMatchChannel(options1));
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // Render hook thứ hai song song
      const hook2 = renderHook(() => useMatchChannel(options2));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Transport Watchdog] ⚠️ CẢNH BÁO: Phát hiện 2 useMatchChannel'),
      );

      hook1.unmount();
      hook2.unmount();
    });
  });
});
