// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useActiveMatchesStore } from './activeMatchesStore';
import { matchRepository, type ActiveMatchItem } from '@/repositories/matchRepository';

describe('Active Matches Store Tests (activeMatchesStore.ts - P3.6c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useActiveMatchesStore.getState().clear();
  });

  it('1. Trạng thái khởi tạo mặc định là rỗng và 0 lượt', () => {
    const state = useActiveMatchesStore.getState();
    expect(state.matches).toEqual([]);
    expect(state.myTurnCount).toBe(0);
    expect(state.isLoading).toBe(false);
  });

  it('2. Refresh nạp đúng danh sách trận và đếm số lượng myTurn', async () => {
    const mockMatches: ActiveMatchItem[] = [
      {
        matchId: 'm-1',
        gameId: 'caro',
        mode: 'online_correspondence',
        mySeat: 0,
        currentSeat: 0,
        myTurn: true,
        turnDeadline: '2026-08-24T08:00:00Z',
        opponentName: 'Player 2',
        startedAt: '2026-08-23T08:00:00Z',
      },
      {
        matchId: 'm-2',
        gameId: 'caro',
        mode: 'online_correspondence',
        mySeat: 1,
        currentSeat: 0,
        myTurn: false,
        turnDeadline: '2026-08-24T09:00:00Z',
        opponentName: 'Player 3',
        startedAt: '2026-08-23T09:00:00Z',
      },
      {
        matchId: 'm-3',
        gameId: 'caro',
        mode: 'online_1v1',
        mySeat: 0,
        currentSeat: 0,
        myTurn: true,
        turnDeadline: '2026-08-23T08:05:00Z',
        opponentName: 'Player 4',
        startedAt: '2026-08-23T08:00:00Z',
      },
    ];

    vi.spyOn(matchRepository, 'getMyActiveMatches').mockResolvedValue(mockMatches);

    await useActiveMatchesStore.getState().refresh();

    const state = useActiveMatchesStore.getState();
    expect(state.matches).toHaveLength(3);
    expect(state.myTurnCount).toBe(2); // m-1 và m-3
    expect(state.isLoading).toBe(false);
  });

  it('3. Refresh khi gặp lỗi thì reset về rỗng an toàn', async () => {
    vi.spyOn(matchRepository, 'getMyActiveMatches').mockRejectedValue(new Error('Network error'));

    await useActiveMatchesStore.getState().refresh();

    const state = useActiveMatchesStore.getState();
    expect(state.matches).toEqual([]);
    expect(state.myTurnCount).toBe(0);
    expect(state.isLoading).toBe(false);
  });
});
