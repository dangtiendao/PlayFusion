// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchChannel } from './useMatchChannel';
import * as matchChannelModule from './matchChannel';
import { useTransportStore } from '@/stores/transportStore';
import { configRepository } from '@/repositories/configRepository';
import type { PresenceMember, MatchChannelHandlers } from './types';

vi.mock('@/repositories/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

describe('useMatchChannel Hook Unit Tests - Auto-Reconnect & Backoff (P3.5a)', () => {
  const dummyMember: PresenceMember = {
    userId: 'usr_player_1',
    displayName: 'Player One',
    joinedAt: '2026-08-23T00:00:00.000Z',
  };

  let mockHandlers: MatchChannelHandlers | null = null;
  let mockConnectFn = vi.fn();
  let mockDisconnectFn = vi.fn();
  let mockStatusFn = vi.fn().mockReturnValue('idle');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useTransportStore.getState().reset();

    mockHandlers = null;
    mockConnectFn = vi.fn().mockResolvedValue(undefined);
    mockDisconnectFn = vi.fn().mockResolvedValue(undefined);
    mockStatusFn = vi.fn().mockReturnValue('idle');

    vi.spyOn(matchChannelModule, 'createMatchChannel').mockImplementation(
      (_matchId, _self, handlers) => {
        mockHandlers = handlers;
        return {
          connect: mockConnectFn,
          disconnect: mockDisconnectFn,
          send: vi.fn().mockResolvedValue(undefined),
          status: mockStatusFn,
          getMembers: vi.fn().mockReturnValue([]),
          channelId: 'match:m-123',
        };
      },
    );

    vi.spyOn(configRepository, 'getReconnectWindowSeconds').mockResolvedValue(60);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Rớt khi enabled -> tự thử lại theo lịch backoff; nối lại thành công -> connected + onReconnected gọi 1 lần', async () => {
    const onMessage = vi.fn();
    const onReconnected = vi.fn();

    const { result } = renderHook(() =>
      useMatchChannel({
        matchId: 'm-123',
        self: dummyMember,
        onMessage,
        enabled: true,
        onReconnected,
      }),
    );

    // Initial connect success
    await act(async () => {
      mockHandlers?.onStatusChange('connected');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.status).toBe('connected');

    // Giả lập rớt mạng từ Supabase
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'WebSocket connection lost');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(useTransportStore.getState().status).toBe('reconnecting');
    expect(useTransportStore.getState().reconnectAttempt).toBe(1);

    // Lần 1 (attempt 0): delay 0ms -> thử ngay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(mockConnectFn).toHaveBeenCalledTimes(2);

    // Giả lập lần 1 kết nối lại vẫn bị lỗi
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'Connection failed again');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(useTransportStore.getState().status).toBe('reconnecting');
    expect(useTransportStore.getState().reconnectAttempt).toBe(2);

    // Lần 2 (attempt 1): delay ~1000ms ± 20%
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockConnectFn).toHaveBeenCalledTimes(3);

    // Lần này connect thành công!
    await act(async () => {
      mockHandlers?.onStatusChange('connected');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(useTransportStore.getState().status).toBe('connected');
    expect(useTransportStore.getState().reconnectAttempt).toBe(0);
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });

  it('2. Quá cửa sổ 60s -> chuyển sang failed, không còn attempt nào chạy sau đó', async () => {
    const onMessage = vi.fn();

    renderHook(() =>
      useMatchChannel({
        matchId: 'm-123',
        self: dummyMember,
        onMessage,
        enabled: true,
      }),
    );

    // Initial connect
    await act(async () => {
      mockHandlers?.onStatusChange('connected');
      await vi.advanceTimersByTimeAsync(10);
    });

    // Rớt mạng
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'Network error');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(useTransportStore.getState().status).toBe('reconnecting');

    // Cho thời gian trôi qua 60s (70s) và liên tục rớt
    for (let i = 0; i < 7; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
        mockHandlers?.onStatusChange('error', 'Continuous network failure');
      });
    }

    expect(useTransportStore.getState().status).toBe('failed');

    const callCount = mockConnectFn.mock.calls.length;

    // Tiếp tục advance 30s nữa để chứng minh không có attempt nào chạy thêm
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(mockConnectFn.mock.calls.length).toBe(callCount);
  });

  it('3. unmount / enabled=false giữa lúc đang chờ backoff -> timer hủy sạch, không connect thêm', async () => {
    const onMessage = vi.fn();

    const { unmount } = renderHook(() =>
      useMatchChannel({
        matchId: 'm-123',
        self: dummyMember,
        onMessage,
        enabled: true,
      }),
    );

    await act(async () => {
      mockHandlers?.onStatusChange('connected');
      await vi.advanceTimersByTimeAsync(10);
    });

    // Rớt mạng lần đầu -> delay 0ms
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'Network error');
      await vi.advanceTimersByTimeAsync(10);
    });

    // Báo lỗi lần 2 -> bắt đầu schedule timer 1000ms
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'Network error 2');
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(useTransportStore.getState().status).toBe('reconnecting');

    // Unmount ngay lập tức trong lúc timer đang chờ
    unmount();

    const callCountBefore = mockConnectFn.mock.calls.length;

    // Cho timer chạy 20 giây
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    // Tuyệt đối không có connect nào được gọi sau khi unmount
    expect(mockConnectFn.mock.calls.length).toBe(callCountBefore);
  });

  it('4. Sự kiện online / visible -> thử ngay lập tức (bỏ qua delay còn lại)', async () => {
    const onMessage = vi.fn();

    renderHook(() =>
      useMatchChannel({
        matchId: 'm-123',
        self: dummyMember,
        onMessage,
        enabled: true,
      }),
    );

    await act(async () => {
      mockHandlers?.onStatusChange('connected');
      await vi.advanceTimersByTimeAsync(10);
    });

    // Rớt mạng
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'Network error');
      await vi.advanceTimersByTimeAsync(10);
    });

    // Báo lỗi lần 2 -> bắt đầu schedule timer 1000ms
    await act(async () => {
      mockHandlers?.onStatusChange('error', 'Network error 2');
      await vi.advanceTimersByTimeAsync(10);
    });

    const callCountBefore = mockConnectFn.mock.calls.length;

    // Giả lập sự kiện online trở lại
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(mockConnectFn.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('5. reconnect() thủ công khi failed -> reset cửa sổ và chạy lại từ đầu', async () => {
    const onMessage = vi.fn();

    const { result } = renderHook(() =>
      useMatchChannel({
        matchId: 'm-123',
        self: dummyMember,
        onMessage,
        enabled: true,
      }),
    );

    await act(async () => {
      mockHandlers?.onStatusChange('connected');
      await vi.advanceTimersByTimeAsync(10);
    });

    // Giả lập chuyển sang status failed
    await act(async () => {
      useTransportStore.getState().setStatus('failed');
    });

    expect(result.current.status).toBe('failed');

    // Bấm reconnect thủ công
    await act(async () => {
      await result.current.reconnect();
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(mockConnectFn).toHaveBeenCalled();
  });
});
