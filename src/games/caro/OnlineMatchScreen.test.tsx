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
import { useMatchChannel, type TransportEnvelope } from '@/transport';

// Mock Referee Repository
vi.mock('@/repositories/refereeRepository', () => ({
  refereeRepository: {
    initMatch: vi.fn(),
    submitMove: vi.fn(),
    resign: vi.fn(),
    claimTimeout: vi.fn(),
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
let mockTransportStatus: import('@/transport').ChannelStatus = 'connected';
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

describe('Caro OnlineMatchScreen Component Tests (P3.3c & P3.4c)', () => {
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

  it('1. Khởi động: Gọi initMatch và dựng bàn cờ ban đầu từ server state kèm đồng hồ', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
      clock: { '0': 300000, '1': 300000 },
      turnDeadline: new Date(Date.now() + 300000).toISOString(),
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
      expect(screen.getByTestId('match-clock-container')).toBeDefined();
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
      clock: { '0': 295000, '1': 300000 },
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
      clock: { '0': 300000, '1': 300000 },
    });
    vi.mocked(refereeRepository.submitMove).mockResolvedValueOnce({
      kind: 'accepted',
      moveIndex: 1,
      currentSeat: 1,
      stateSerialized: serializedEmpty,
      clock: { '0': 295000, '1': 300000 },
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
          currentSeat: 1,
          moveSerialized: '0',
          stateSerialized: caroEngine.serialize(stateAfterMove0),
          isTerminal: false,
          clock: { '0': 295000, '1': 300000 },
        },
      });
    });

    await waitFor(() => {
      // Lượt chuyển sang đối thủ
      expect(screen.getByText(/đang suy nghĩ/i)).toBeDefined();
      expect(screen.getByText('Nước #2')).toBeDefined();
    });
  });

  it('4. Nút Đầu hàng / Hủy ván thay đổi nhãn theo moveIndex', async () => {
    // moveIndex = 0 (< 3) -> Hiển thị "Hủy ván"
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('resign-btn').textContent).toContain('Hủy ván');
    });

    // Mở confirm dialog
    fireEvent.click(screen.getByTestId('resign-btn'));
    expect(screen.getByText(/Hủy ván đấu\?/i)).toBeDefined();

    // Xác nhận hủy bên trong dialog
    vi.mocked(refereeRepository.resign).mockResolvedValueOnce({
      matchId: 'match-uuid-123',
      reason: 'abort',
    });

    const confirmButtons = screen.getAllByRole('button', { name: 'Hủy ván' });
    const modalConfirmBtn = confirmButtons[1];
    expect(modalConfirmBtn).toBeDefined();
    if (modalConfirmBtn) {
      fireEvent.click(modalConfirmBtn);
    }

    await waitFor(() => {
      expect(refereeRepository.resign).toHaveBeenCalledWith('match-uuid-123');
    });
  });

  it('5. Nhận Broadcast match_ended reason: timeout -> hiển thị thông báo hết giờ', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 4,
      currentSeat: 1,
      movesSerialized: '0,1,2,3',
    });

    renderScreen(0); // MySeat = 0

    await waitFor(() => {
      expect(screen.getByTestId('caro-online-match-screen')).toBeDefined();
    });

    // Giả lập Broadcast match_ended do đối thủ hết giờ (Seat 1 timeout -> Seat 0 win)
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_ended',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          reason: 'timeout',
          outcomes: [
            { playerIndex: 0, outcome: 'win' },
            { playerIndex: 1, outcome: 'loss' },
          ],
        },
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('match-end-overlay')).toBeDefined();
        expect(screen.getByText(/ĐỐI THỦ HẾT GIỜ/i)).toBeDefined();
      },
      { timeout: 2000 },
    );
  });

  it('6. onReconnected -> gọi resyncFromServer thay toàn bộ thế cờ', async () => {
    let capturedOnReconnected: (() => void) | undefined;
    vi.mocked(useMatchChannel).mockImplementationOnce((opts) => {
      messageHandler = opts.onMessage;
      capturedOnReconnected = opts.onReconnected;
      return {
        status: 'connected',
        members: mockMembers,
        reconnect: mockReconnect,
        send: vi.fn(),
      };
    });

    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('caro-online-match-screen')).toBeDefined();
    });

    // Giả lập Server đã có 2 nước mới
    const stateAfter2Moves = caroEngine.applyMove(
      caroEngine.applyMove(initialEmptyState, 0, 0),
      1,
      1,
    );
    vi.mocked(matchRepository.getLiveState).mockResolvedValueOnce({
      stateSerialized: caroEngine.serialize(stateAfter2Moves),
      moveIndex: 2,
      currentSeat: 0,
      movesSerialized: '0,1',
      clock: { '0': 290000, '1': 295000 },
      turnStartedAt: new Date().toISOString(),
      turnDeadline: new Date(Date.now() + 290000).toISOString(),
    });

    // Kích hoạt onReconnected
    act(() => {
      capturedOnReconnected?.();
    });

    await waitFor(() => {
      expect(matchRepository.getLiveState).toHaveBeenCalledWith('match-uuid-123');
      expect(screen.getByText('Nước #3')).toBeDefined();
    });
  });

  it('7. Resync khi trận đã kết thúc trong lúc offline (liveState null) -> hiện MatchEndOverlay đúng lý do', async () => {
    let capturedOnReconnected: (() => void) | undefined;
    vi.mocked(useMatchChannel).mockImplementationOnce((opts) => {
      messageHandler = opts.onMessage;
      capturedOnReconnected = opts.onReconnected;
      return {
        status: 'connected',
        members: mockMembers,
        reconnect: mockReconnect,
        send: vi.fn(),
      };
    });

    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 2,
      currentSeat: 0,
      movesSerialized: '0,1',
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('caro-online-match-screen')).toBeDefined();
    });

    // Live state đã bị xóa do trận đã kết thúc
    vi.mocked(matchRepository.getLiveState).mockResolvedValueOnce(null);

    // matchDetail có endedAt do đối thủ claim timeout
    vi.mocked(matchRepository.getMatchById).mockResolvedValueOnce({
      id: 'match-uuid-123',
      gameId: 'caro',
      mode: 'online_1v1',
      isRanked: true,
      startedAt: '2026-08-22T23:00:00Z',
      endedAt: '2026-08-22T23:05:00Z',
      durationMs: 300000,
      endReason: 'timeout',
      participants: [
        {
          seatIndex: 0,
          userId: 'p1',
          isBot: false,
          botLevel: null,
          result: 'loss',
          placement: 2,
          score: 0,
          ratingDelta: -10,
        },
        {
          seatIndex: 1,
          userId: 'p2',
          isBot: false,
          botLevel: null,
          result: 'win',
          placement: 1,
          score: 1,
          ratingDelta: 10,
        },
      ],
    });

    act(() => {
      capturedOnReconnected?.();
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('match-end-overlay')).toBeDefined();
        expect(screen.getByText(/BẠN THUA VÌ HẾT GIỜ/i)).toBeDefined();
      },
      { timeout: 2000 },
    );
  });

  it('8. Trạng thái reconnecting -> hiện banner vàng; trạng thái failed -> hiện banner đỏ kèm nút Thử lại', async () => {
    vi.mocked(useMatchChannel).mockImplementation((opts) => {
      messageHandler = opts.onMessage;
      return {
        status: mockTransportStatus,
        members: mockMembers,
        reconnect: mockReconnect,
        send: vi.fn(),
      };
    });

    mockTransportStatus = 'reconnecting';
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
    });

    const { rerender } = renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('transport-reconnecting-banner')).toBeDefined();
    });

    // Chuyển sang failed
    mockTransportStatus = 'failed';
    rerender(
      <MemoryRouter initialEntries={['/game/caro/online/match-uuid-123']}>
        <Routes>
          <Route
            path="/game/caro/online/:matchId"
            element={<OnlineMatchScreen matchId="match-uuid-123" mySeat={0} roomCode="ABC234" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('transport-failed-banner')).toBeDefined();
      expect(screen.getByTestId('manual-retry-btn')).toBeDefined();
    });
  });

  it('9. Ván đấu correspondence: Render CorrespondenceDeadline và Thoát tự do không gọi resign', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
      clock: null,
      turnDeadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      timeControl: { kind: 'correspondence', perMoveSeconds: 86400 },
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('correspondence-deadline-banner')).toBeDefined();
      expect(screen.queryByTestId('my-clock-box')).toBeNull(); // KHÔNG RENDER MATCHCLOCK REALTIME
    });

    // Bấm nút Thoát
    const exitBtn = screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i });
    fireEvent.click(exitBtn);

    // Modal thoát hiện thông báo lưu ván chờ quay lại
    await waitFor(() => {
      expect(screen.getByText(/Ván cờ sẽ được lưu và chờ bạn quay lại/i)).toBeDefined();
    });

    // Xác nhận thoát
    const confirmExitBtn = screen.getByText('Rời ván');
    fireEvent.click(confirmExitBtn);

    expect(refereeRepository.resign).not.toHaveBeenCalled(); // TUYỆT ĐỐI KHÔNG GỌI RESIGN
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('10. Ván đấu realtime: Render MatchClock và Thoát gọi resign', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
      clock: { '0': 300000, '1': 300000 },
      turnDeadline: new Date(Date.now() + 300000).toISOString(),
      timeControl: { kind: 'realtime', baseSeconds: 300, incrementSeconds: 5 },
    });

    renderScreen(0);

    await waitFor(() => {
      expect(screen.getByTestId('my-clock-box')).toBeDefined();
      expect(screen.queryByTestId('correspondence-deadline-banner')).toBeNull();
    });

    // Bấm nút Thoát
    const exitBtn = screen.getByRole('button', { name: /Quay lại Sảnh trò chơi/i });
    fireEvent.click(exitBtn);

    // Modal thoát cảnh báo xử thua / hủy ván
    await waitFor(() => {
      expect(screen.getByText(/Thoát ra sẽ hủy ván đấu/i)).toBeDefined();
    });

    // Xác nhận thoát
    const confirmExitBtn = screen.getByRole('button', { name: 'Rời trận' });
    fireEvent.click(confirmExitBtn);

    expect(refereeRepository.resign).toHaveBeenCalledWith('match-uuid-123'); // GỌI RESIGN
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('11. [P4.3c match_settled] Nhận broadcast match_settled -> truyền settledData vào MatchEndOverlay với delta đúng của tôi', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
      clock: { '0': 300000, '1': 300000 },
      turnDeadline: new Date(Date.now() + 300000).toISOString(),
    });

    renderScreen(0);

    await waitFor(() => {
      expect(messageHandler).not.toBeNull();
    });

    // 1. Nhận match_ended trước
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_ended',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          reason: 'normal',
          outcomes: [
            { playerIndex: 0, outcome: 'win' },
            { playerIndex: 1, outcome: 'loss' },
          ],
        },
      });
    });

    // 2. Nhận match_settled sau
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_settled',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          deltas: [
            { userId: 'player-anon', ratingDelta: 16, newRating: 1216, coins: 50 },
            { userId: 'player-2', ratingDelta: -16, newRating: 1184, coins: 5 },
          ],
        },
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('match-end-overlay')).toBeDefined();
        expect(screen.getByTestId('rank-settled-card')).toBeDefined();
        expect(screen.getByTestId('rating-delta-text').textContent).toContain('+16 điểm');
        expect(screen.getByTestId('coins-reward-text').textContent).toContain('+50 xu');
      },
      { timeout: 2000 },
    );
  });

  it('12. [P4.3c THĂNG HẠNG & Idempotency] match_settled vượt ngưỡng 1200 -> hiển thị THĂNG HẠNG, broadcast trùng lặp bị bỏ qua', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
      clock: { '0': 300000, '1': 300000 },
      turnDeadline: new Date(Date.now() + 300000).toISOString(),
    });

    renderScreen(0);

    await waitFor(() => {
      expect(messageHandler).not.toBeNull();
    });

    // Nhận match_ended
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_ended',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          reason: 'normal',
          outcomes: [
            { playerIndex: 0, outcome: 'win' },
            { playerIndex: 1, outcome: 'loss' },
          ],
        },
      });
    });

    // Nhận match_settled lần 1 (1195 -> 1211: Thăng hạng Vàng)
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_settled',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          deltas: [
            { userId: 'player-anon', ratingDelta: 16, newRating: 1211, coins: 50 },
            { userId: 'player-2', ratingDelta: -16, newRating: 1184, coins: 5 },
          ],
        },
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('rank-up-banner')).toBeDefined();
        expect(screen.getByText('🌟 THĂNG HẠNG! 🌟')).toBeDefined();
      },
      { timeout: 2000 },
    );

    // Nhận lại cùng broadcast match_settled lần 2 (giả lập trùng lặp)
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_settled',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          deltas: [
            { userId: 'player-anon', ratingDelta: 16, newRating: 1211, coins: 50 },
            { userId: 'player-2', ratingDelta: -16, newRating: 1184, coins: 5 },
          ],
        },
      });
    });

    // Không crash, overlay vẫn giữ trạng thái ổn định
    expect(screen.getByTestId('rank-up-banner')).toBeDefined();
  });

  it('13. [P4.3c KHIÊN BẢO VỆ] match_settled rớt ngưỡng lần đầu (1205 -> 1189) -> hiển thị thông điệp khiên bảo vệ', async () => {
    vi.mocked(refereeRepository.initMatch).mockResolvedValueOnce({
      stateSerialized: serializedEmpty,
      moveIndex: 0,
      currentSeat: 0,
      movesSerialized: '',
      clock: { '0': 300000, '1': 300000 },
      turnDeadline: new Date(Date.now() + 300000).toISOString(),
    });

    renderScreen(0);

    await waitFor(() => {
      expect(messageHandler).not.toBeNull();
    });

    // Nhận match_ended (thua)
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_ended',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          reason: 'normal',
          outcomes: [
            { playerIndex: 1, outcome: 'win' },
            { playerIndex: 0, outcome: 'loss' },
          ],
        },
      });
    });

    // Nhận match_settled (1205 -> 1189)
    act(() => {
      messageHandler?.({
        v: 1,
        type: 'match_settled',
        senderId: 'server',
        sentAt: new Date().toISOString(),
        payload: {
          matchId: 'match-uuid-123',
          deltas: [
            { userId: 'player-anon', ratingDelta: -16, newRating: 1189, coins: 5 },
            { userId: 'player-2', ratingDelta: 16, newRating: 1221, coins: 50 },
          ],
        },
      });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('demotion-shield-message')).toBeDefined();
        expect(
          screen.getByText(/Được bảo vệ rớt hạng — thắng trận sau để giữ Vàng!/),
        ).toBeDefined();
      },
      { timeout: 2000 },
    );
  });
});
