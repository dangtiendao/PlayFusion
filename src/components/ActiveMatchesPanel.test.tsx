// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveMatchesPanel } from './ActiveMatchesPanel';
import { formatShortDeadline } from '@/core/serverClock';
import { useActiveMatchesStore } from '@/stores/activeMatchesStore';
import type { ActiveMatchItem } from '@/repositories/matchRepository';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('ActiveMatchesPanel Component Tests (P3.6c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useActiveMatchesStore.getState().clear();
    mockNavigate.mockReset();
  });

  it('1. formatShortDeadline: Format đúng giờ, phút, quá hạn', () => {
    // Quá hạn
    const expired = formatShortDeadline(new Date(Date.now() - 1000).toISOString());
    expect(expired.text).toBe('QUÁ HẠN');
    expect(expired.isExpired).toBe(true);

    // 45 phút
    const mins = formatShortDeadline(new Date(Date.now() + 45 * 60 * 1000).toISOString());
    expect(mins.text).toBe('45m');
    expect(mins.isExpired).toBe(false);

    // 23 giờ
    const hours = formatShortDeadline(new Date(Date.now() + 23 * 3600 * 1000).toISOString());
    expect(hours.text).toBe('23h');
    expect(hours.isExpired).toBe(false);
  });

  it('2. Render danh sách ván đấu: myTurn lên đầu, đúng tên đối thủ và deadline', () => {
    const mockMatches: ActiveMatchItem[] = [
      {
        matchId: 'match-1',
        gameId: 'caro',
        mode: 'online_correspondence',
        mySeat: 0,
        currentSeat: 0,
        myTurn: true,
        turnDeadline: new Date(Date.now() + 23 * 3600 * 1000).toISOString(),
        opponentName: 'Đối thủ A',
        startedAt: '2026-08-23T08:00:00Z',
      },
      {
        matchId: 'match-2',
        gameId: 'caro',
        mode: 'online_1v1',
        mySeat: 1,
        currentSeat: 0,
        myTurn: false,
        turnDeadline: new Date(Date.now() - 5000).toISOString(),
        opponentName: 'Đối thủ B',
        startedAt: '2026-08-23T08:10:00Z',
      },
    ];

    useActiveMatchesStore.setState({
      matches: mockMatches,
      myTurnCount: 1,
      isLoading: false,
    });

    render(<ActiveMatchesPanel />);

    expect(screen.getByTestId('active-matches-panel')).toBeDefined();
    expect(screen.getByText('vs Đối thủ A')).toBeDefined();
    expect(screen.getByText('👉 Tới lượt bạn!')).toBeDefined();
    expect(screen.getByText('vs Đối thủ B')).toBeDefined();
    expect(screen.getByText('⚠️ Đối thủ quá hạn (Bấm để claim)')).toBeDefined();
  });

  it('3. Bấm vào dòng trận đấu điều hướng đúng route /game/:gameId/online/:matchId', () => {
    const mockMatches: ActiveMatchItem[] = [
      {
        matchId: 'match-123',
        gameId: 'caro',
        mode: 'online_correspondence',
        mySeat: 0,
        currentSeat: 0,
        myTurn: true,
        turnDeadline: new Date(Date.now() + 100000).toISOString(),
        opponentName: 'Player X',
        startedAt: '2026-08-23T08:00:00Z',
      },
    ];

    useActiveMatchesStore.setState({
      matches: mockMatches,
      myTurnCount: 1,
      isLoading: false,
    });

    render(<ActiveMatchesPanel />);

    const row = screen.getByTestId('active-match-row-match-123');
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith('/game/caro/online/match-123');
  });

  it('4. Không render gì khi danh sách matches rỗng (0 ván)', () => {
    useActiveMatchesStore.setState({
      matches: [],
      myTurnCount: 0,
      isLoading: false,
    });

    const { container } = render(<ActiveMatchesPanel />);
    expect(container.firstChild).toBeNull();
  });
});
