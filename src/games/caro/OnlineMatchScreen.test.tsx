/**
 * ==============================================================================
 * UNIT TESTS: CARO ONLINE MATCH SCREEN (SRC/GAMES/CARO/ONLINEMATCHSCREEN.TEST.TSX)
 * ==============================================================================
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OnlineMatchScreen } from './OnlineMatchScreen';
import { refereeRepository } from '@/repositories/refereeRepository';
import { matchRepository } from '@/repositories/matchRepository';
import { caroEngine, DEFAULT_CARO_OPTIONS } from '@engines/caro';
import type { TransportEnvelope } from '@/transport';

// Mock Referee Repository
vi.mock('@/repositories/refereeRepository', () => ({
  refereeRepository: {
    initMatch: vi.fn(),
    submitMove: vi.fn(),
  },
}));

// Mock Match Repository
vi.mock('@/repositories/matchRepository', () => ({
  matchRepository: {
    getLiveState: vi.fn(),
    getMatchById: vi.fn(),
  },
}));

// Mock Transport useMatchChannel
let messageHandler: ((env: TransportEnvelope) => void) | null = null;
const mockReconnect = vi.fn();
let mockTransportStatus: 'idle' | 'connecting' | 'connected' | 'error' = 'connected';
let mockMembers: { userId: string; displayName: string; joinedAt: string }[] = [];

vi.mock('@/transport', () => ({
  useMatchChannel: vi.fn(
    (opts: { onMessage: (env: TransportEnvelope) => void; enabled?: boolean }) => {
      messageHandler = opts.onMessage;
      return {
        status: mockTransportStatus,
        members: mockMembers,
        reconnect: mockReconnect,
        send: vi.fn(),
      };
    },
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Caro OnlineMatchScreen Component Tests (P3.3c)', () => {
  const initialEmptyState = caroEngine.init({ playerCount: 2, options: DEFAULT_CARO_OPTIONS });
  const serializedEmpty = caroEngine.serialize(initialEmptyState);

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransportStatus = 'connected';
    mockMembers = [
      { userId: 'player-1', displayName: 'Người chơi 1', joinedAt: '2026-08-22T23:00:00Z' },
      { userId: 'player-2', displayName: 'Người chơi 2', joinedAt: '2026-08-22T23:00:01Z' },
    ];
  });

  const renderScreen = (mySeat = 0) => {
    return render(
      <MemoryRouter initialEntries={['/game/caro/online/match-uuid-123']}>
        <Routes>
          <Route
            path="/game/caro/online/:matchId"
            element={
              <OnlineMatchScreen matchId="match-uuid-123" mySeat={mySeat} roomCode="ABC234" />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('1. Khởi động: Gọi initMatch và dựng bàn cờ ban đầu từ server state', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });
    vi.mocked(matchRepository.getMatchById).mockResolvedValueOnce({
      id: 'match-uuid-123',
      gameId: 'caro',
      mode: 'online_1v1',
      isRanked: true,
      startedAt: '2026-08-22T23:00:00Z',
      endedAt: null,
      durationMs: null,
      endReason: null,
      participants: [
        {
          seatIndex: 0,
          userId: 'p1',
          isBot: false,
          botLevel: null,
          result: null,
          placement: null,
          score: null,
          ratingDelta: null,
          displayName: 'Tôi',
        },
        {
          seatIndex: 1,
          userId: 'p2',
          isBot: false,
          botLevel: null,
          result: null,
          placement: null,
          score: null,
          ratingDelta: null,
          displayName: 'Đối Thủ Pro',
        },
      ],
    });

    renderScreen(0);

    await waitFor(() => {
      expect(refereeRepository.initMatch).toHaveBeenCalledWith('match-uuid-123');
      expect(screen.getByTestId('caro-online-match-screen')).toBeDefined();
      expect(screen.getByText('Lượt của bạn!')).toBeDefined();
      expect(screen.getByText('Đối Thủ Pro')).toBeDefined();
    });
  });

  it('2. Lượt đối thủ (Seat 1 khi mySeat = 0) -> banner báo Đối thủ đang suy nghĩ', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 1,
      currentSeat: 1, // Lượt của Seat 1 (O)
      movesSerialized: '0',
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByText(/đang suy nghĩ/i)).toBeDefined();
    });
  });

  it('3. Đánh nước đi hợp lệ -> gọi submitMove (KHÔNG optimistic) và chờ Broadcast áp', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });
    vi.mocked(refereeRepository.submitMove).mockResolvedValueOnce({
      kind: 'accepted',
      moveIndex: 1,
      currentSeat: 1,
      stateSerialized: serializedEmpty,
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByText('Lượt của bạn!')).toBeDefined();
    });

    // Bấm vào ô cờ 0 (2 chạm)
    const cell0 = screen.getByTestId('caro-cell-0');
    fireEvent.pointerDown(cell0, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cell0, { clientX: 50, clientY: 50 });
    fireEvent.pointerDown(cell0, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cell0, { clientX: 50, clientY: 50 });

    await waitFor(() => {
      expect(refereeRepository.submitMove).toHaveBeenCalledWith('match-uuid-123', '0', 0);
    });

    // Giả lập Broadcast từ server gửi về cho cả 2 tab
    const stateAfterMove0 = caroEngine.applyMove(initialEmptyState, 0, 0);
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'move_accepted',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          moveIndex: 1,
          seatIndex: 0,
          moveSerialized: '0',
          stateSerialized: caroEngine.serialize(stateAfterMove0),
          isTerminal: false,
        },
      });
    });

    await waitFor(() => {
      // Lượt chuyển sang đối thủ
      expect(screen.getByText(/đang suy nghĩ/i)).toBeDefined();
      expect(screen.getByText('Nước #2')).toBeDefined();
    });
  });

  it('4. Nhận Broadcast lệch nhịp (+2) -> Tự động gọi getLiveState để Resync', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });

    const stateAfter3Moves = caroEngine.init({ playerCount: 2, options: DEFAULT_CARO_OPTIONS });
    const freshSerialized = caroEngine.serialize(stateAfter3Moves);

    vi.mocked(matchRepository.getLiveState).mockResolvedValueOnce({
      stateSerialized: freshSerialized,
      moveIndex: 3,
      currentSeat: 1,
      movesSerialized: '0,15,1',
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('caro-online-match-screen')).toBeDefined();
    });

    // Giả lập nhận gói tin nhảy cóc moveIndex = 3 trong khi local moveIndex = 0
    await act(async () => {
      await messageHandler?.({
        v: 1,
        type: 'move_accepted',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          moveIndex: 3,
          seatIndex: 0,
          moveSerialized: '1',
          stateSerialized: freshSerialized,
          isTerminal: false,
        },
      });
    });

    await waitFor(() => {
      expect(matchRepository.getLiveState).toHaveBeenCalledWith('match-uuid-123');
      expect(screen.getByTestId('resync-toast')).toBeDefined();
    });
  });

  it('5. Gặp lỗi RETRYABLE khi gửi nước -> hiển thị nút Gửi lại cùng expectedMoveIndex', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });
    vi.mocked(refereeRepository.submitMove).mockRejectedValueOnce({
      message: 'Mất kết nối tới trọng tài server',
      isRetryable: true,
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByText('Lượt của bạn!')).toBeDefined();
    });

    // Bấm đánh ô 0
    const cell0 = screen.getByTestId('caro-cell-0');
    fireEvent.pointerDown(cell0, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cell0, { clientX: 50, clientY: 50 });
    fireEvent.pointerDown(cell0, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cell0, { clientX: 50, clientY: 50 });

    await waitFor(() => {
      expect(screen.getByTestId('submit-error-banner')).toBeDefined();
      expect(screen.getByTestId('retry-submit-btn')).toBeDefined();
    });

    // Bấm nút Gửi lại
    vi.mocked(refereeRepository.submitMove).mockResolvedValueOnce({
      kind: 'accepted',
      moveIndex: 1,
      currentSeat: 1,
      stateSerialized: serializedEmpty,
    });

    fireEvent.click(screen.getByTestId('retry-submit-btn'));

    await waitFor(() => {
      expect(refereeRepository.submitMove).toHaveBeenCalledTimes(2);
      expect(refereeRepository.submitMove).toHaveBeenLastCalledWith('match-uuid-123', '0', 0);
    });
  });

  it('6. Kết thúc ván đấu (Terminal) -> hiển thị MatchEndOverlay với kết quả chính xác', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 8,
      currentSeat: 0,
      movesSerialized: '0,15,1,16,2,17,3,18',
    });

    renderScreen(0); // MySeat = 0

    await waitFor(() => {
      expect(screen.getByTestId('caro-online-match-screen')).toBeDefined();
    });

    // Giả lập Broadcast nước đi chiến thắng cho Seat 0
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'move_accepted',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          moveIndex: 9,
          seatIndex: 0,
          moveSerialized: '4',
          stateSerialized: serializedEmpty,
          isTerminal: true,
          terminal: {
            winner: 0,
            isDraw: false,
            reason: 'five_in_a_row',
          },
        },
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('match-end-overlay')).toBeDefined();
        expect(screen.getByText(/QUÂN X THẮNG/i)).toBeDefined();
      },
      { timeout: 2000 },
    );
  });
});
