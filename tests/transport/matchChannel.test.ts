// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/repositories/supabaseClient';
import { createMatchChannel } from '@/transport/matchChannel';
import type { PresenceMember, MatchChannelHandlers, TransportEnvelope } from '@/transport/types';
import { RepoError } from '@/repositories/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

describe('Realtime MatchChannel Unit Tests (matchChannel.ts - P3.1a)', () => {
  const mockSelf: PresenceMember = {
    userId: '11111111-1111-1111-1111-111111111111',
    displayName: 'Player One',
    joinedAt: '2026-08-22T10:00:00.000Z',
  };

  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const validRoomCode = 'ROOM88';

  let mockHandlers: MatchChannelHandlers;
  let broadcastCallbacks: Map<string, (payload: unknown) => void>;
  let presenceCallbacks: Map<string, () => void>;
  let mockPresenceState: Record<string, unknown[]>;
  let subscribeCallback: (status: string, err?: Error) => void;

  let mockChannel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    presenceState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockHandlers = {
      onMessage: vi.fn(),
      onPresenceChange: vi.fn(),
      onStatusChange: vi.fn(),
    };

    broadcastCallbacks = new Map();
    presenceCallbacks = new Map();
    mockPresenceState = {};

    mockChannel = {
      on: vi
        .fn()
        .mockImplementation(
          (type: string, filter: { event: string }, cb: (payload: unknown) => void) => {
            if (type === 'broadcast') {
              broadcastCallbacks.set(filter.event, cb);
            } else if (type === 'presence') {
              presenceCallbacks.set(filter.event, cb as () => void);
            }
            return mockChannel;
          },
        ),
      subscribe: vi.fn().mockImplementation((cb: (status: string, err?: Error) => void) => {
        subscribeCallback = cb;
        return mockChannel;
      }),
      send: vi.fn().mockResolvedValue('ok'),
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      unsubscribe: vi.fn().mockResolvedValue('ok'),
      presenceState: vi.fn().mockImplementation(() => mockPresenceState),
    };

    vi.spyOn(supabase, 'channel').mockReturnValue(
      mockChannel as unknown as ReturnType<typeof supabase.channel>,
    );
    vi.spyOn(supabase, 'removeChannel').mockResolvedValue(
      'ok' as unknown as ReturnType<typeof supabase.removeChannel>,
    );
  });

  describe('1. Kiểm Tra Tính Hợp Lệ Đầu Vào (Input Validation)', () => {
    it('Ném lỗi ngay nếu matchId không đúng định dạng UUID hoặc mã 6 ký tự', () => {
      expect(() => createMatchChannel('invalid-id-!', mockSelf, mockHandlers)).toThrow(
        /matchId không hợp lệ/i,
      );
      expect(() => createMatchChannel('', mockSelf, mockHandlers)).toThrow(/matchId không hợp lệ/i);
      expect(() => createMatchChannel('12345', mockSelf, mockHandlers)).toThrow(
        /matchId không hợp lệ/i,
      );
      expect(() => createMatchChannel('TOOLONGCODE99', mockSelf, mockHandlers)).toThrow(
        /matchId không hợp lệ/i,
      );
    });

    it('Khởi tạo thành công với UUID chuẩn hoặc mã phòng 6 ký tự', () => {
      const chUuid = createMatchChannel(validUuid, mockSelf, mockHandlers);
      expect(chUuid.status()).toBe('idle');

      const chRoom = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      expect(chRoom.status()).toBe('idle');
    });
  });

  describe('2. Khởi Tạo Kết Nối & Ánh Xạ Trạng Thái (connect & status mapping)', () => {
    it('Gọi đúng tên channel "match:{id}", cấu hình broadcast { self: false, ack: true } và presence key', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();

      expect(supabase.channel).toHaveBeenCalledWith('match:ROOM88', {
        config: {
          broadcast: { self: false, ack: true },
          presence: { key: mockSelf.userId },
        },
      });

      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith('connecting');
      expect(channel.status()).toBe('connecting');

      // Giả lập server phản hồi SUBSCRIBED
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith('connected');
      expect(channel.status()).toBe('connected');
      expect(mockChannel.track).toHaveBeenCalledWith(mockSelf);
    });

    it('Ánh xạ TIMED_OUT -> status error, gọi onStatusChange và ném RepoError RETRYABLE', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();

      subscribeCallback('TIMED_OUT', new Error('Connection timed out'));

      await expect(connectPromise).rejects.toThrow(RepoError);
      expect(channel.status()).toBe('error');
      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Connection timed out'),
      );
    });

    it('Ánh xạ CHANNEL_ERROR -> status error, gọi onStatusChange và ném RepoError RETRYABLE', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();

      subscribeCallback('CHANNEL_ERROR', new Error('Channel permission denied'));

      await expect(connectPromise).rejects.toThrow(RepoError);
      expect(channel.status()).toBe('error');
      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Channel permission denied'),
      );
    });

    it('Ánh xạ CLOSED -> status closed và gọi onStatusChange', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      subscribeCallback('CLOSED');
      expect(channel.status()).toBe('closed');
      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith('closed');
    });

    it('Không thực hiện lại nếu đang kết nối hoặc đã kết nối (idempotent connect)', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      // Gọi connect lần 2
      await channel.connect();
      expect(supabase.channel).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Phát Sóng Thông Điệp (send & envelope wrapping)', () => {
    it('Tự động bọc TransportEnvelope đầy đủ v=1, senderId, sentAt, type, payload', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      await channel.send('move', { row: 7, col: 7 });

      expect(mockChannel.send).toHaveBeenCalledTimes(1);
      const sentArg = (
        mockChannel.send.mock.calls[0] as [
          { type: string; event: string; payload: TransportEnvelope<{ row: number; col: number }> },
        ]
      )[0];

      expect(sentArg.type).toBe('broadcast');
      expect(sentArg.event).toBe('move');
      expect(sentArg.payload).toMatchObject({
        v: 1,
        type: 'move',
        senderId: mockSelf.userId,
        payload: { row: 7, col: 7 },
      });
      expect(typeof sentArg.payload.sentAt).toBe('string');
    });

    it('Ném RepoError RETRYABLE nếu chưa kết nối mà đã gọi send', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      await expect(channel.send('move', { cell: 0 })).rejects.toThrow(RepoError);
    });

    it('Ném RepoError RETRYABLE nếu send trả về "timed out" hoặc "error"', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      mockChannel.send.mockResolvedValueOnce('timed out');
      await expect(channel.send('move', { cell: 1 })).rejects.toThrow(/timed out/i);

      mockChannel.send.mockResolvedValueOnce('error');
      await expect(channel.send('move', { cell: 2 })).rejects.toThrow(/error/i);
    });
  });

  describe('4. Nhận Thông Điệp (Message Parsing & Resilience)', () => {
    it('Kích hoạt onMessage khi nhận envelope hợp lệ', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      const broadcastListener = broadcastCallbacks.get('*');
      expect(broadcastListener).toBeDefined();

      const incomingEnvelope: TransportEnvelope = {
        v: 1,
        type: 'move',
        senderId: 'opponent-id-222',
        sentAt: '2026-08-22T10:01:00.000Z',
        payload: { row: 8, col: 8 },
      };

      // Giả lập Supabase Realtime broadcast event
      if (broadcastListener) {
        broadcastListener({
          event: 'move',
          type: 'broadcast',
          payload: incomingEnvelope,
        });
      }

      expect(mockHandlers.onMessage).toHaveBeenCalledWith(incomingEnvelope);
    });

    it('Bỏ qua an toàn và ghi cảnh báo khi nhận envelope có version không phải 1 (v !== 1)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockReturnValue();
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      const broadcastListener = broadcastCallbacks.get('*');

      if (broadcastListener) {
        broadcastListener({
          payload: {
            v: 2,
            type: 'move',
            senderId: 'someone',
            sentAt: '2026-08-22T10:01:00.000Z',
            payload: {},
          },
        });
      }

      expect(mockHandlers.onMessage).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Bỏ qua thông điệp'),
        expect.anything(),
      );
    });

    it('Bỏ qua an toàn khi nhận envelope hỏng cấu trúc (thiếu senderId, sai kiểu...)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockReturnValue();
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      const broadcastListener = broadcastCallbacks.get('*');

      // Payload null / chuỗi rác
      if (broadcastListener) {
        broadcastListener('corrupted message string');
        broadcastListener({ payload: { v: 1, type: 'move' } }); // thiếu senderId, sentAt, payload
      }

      expect(mockHandlers.onMessage).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('5. Quản Lý Hiện Diện (Presence Synchronization & Deterministic Ordering)', () => {
    it('Đồng bộ presence và sắp xếp danh sách tăng dần theo joinedAt', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      const syncListener = presenceCallbacks.get('sync');
      expect(syncListener).toBeDefined();

      mockPresenceState = {
        'user-b': [
          {
            userId: 'user-b',
            displayName: 'Bob',
            joinedAt: '2026-08-22T10:05:00.000Z',
          },
        ],
        'user-a': [
          {
            userId: 'user-a',
            displayName: 'Alice',
            joinedAt: '2026-08-22T10:01:00.000Z',
          },
        ],
      };

      if (syncListener) {
        syncListener();
      }

      const expectedMembers: PresenceMember[] = [
        {
          userId: 'user-a',
          displayName: 'Alice',
          joinedAt: '2026-08-22T10:01:00.000Z',
        },
        {
          userId: 'user-b',
          displayName: 'Bob',
          joinedAt: '2026-08-22T10:05:00.000Z',
        },
      ];

      expect(mockHandlers.onPresenceChange).toHaveBeenCalledWith(expectedMembers);
      expect(channel.getMembers()).toEqual(expectedMembers);
    });

    it('Khử trùng lặp userId khi một user có nhiều kết nối presence', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      const syncListener = presenceCallbacks.get('sync');

      mockPresenceState = {
        'user-a': [
          {
            userId: 'user-a',
            displayName: 'Alice (Tab 1)',
            joinedAt: '2026-08-22T10:01:00.000Z',
          },
          {
            userId: 'user-a',
            displayName: 'Alice (Tab 2)',
            joinedAt: '2026-08-22T10:02:00.000Z',
          },
        ],
      };

      if (syncListener) {
        syncListener();
      }

      const members = channel.getMembers();
      expect(members).toHaveLength(1);
      expect(members[0]?.displayName).toBe('Alice (Tab 2)');
    });
  });

  describe('6. Ngắt Kết Nối & Dọn Dẹp Tài Nguyên (disconnect & cleanup)', () => {
    it('Gọi untrack, unsubscribe, removeChannel và cập nhật status sang closed', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      await channel.disconnect();

      expect(mockChannel.untrack).toHaveBeenCalledTimes(1);
      expect(mockChannel.unsubscribe).toHaveBeenCalledTimes(1);
      expect(supabase.removeChannel).toHaveBeenCalledWith(
        mockChannel as unknown as RealtimeChannel,
      );
      expect(channel.status()).toBe('closed');
      expect(mockHandlers.onStatusChange).toHaveBeenCalledWith('closed');
      expect(channel.getMembers()).toEqual([]);
    });

    it('Gọi disconnect nhiều lần hoàn toàn an toàn (Idempotent)', async () => {
      const channel = createMatchChannel(validRoomCode, mockSelf, mockHandlers);
      const connectPromise = channel.connect();
      subscribeCallback('SUBSCRIBED');
      await connectPromise;

      await channel.disconnect();
      await channel.disconnect();

      expect(mockChannel.untrack).toHaveBeenCalledTimes(1);
      expect(channel.status()).toBe('closed');
    });
  });
});
