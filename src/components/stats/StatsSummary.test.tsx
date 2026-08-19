// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlayerGameStats } from '@/repositories/types';
import { StatsSummary } from './StatsSummary';

describe('StatsSummary Generic Component Tests (StatsSummary.tsx - P2.6b)', () => {
  const mockGetGameName = vi.fn((gameId: string) => {
    if (gameId === 'game_one') return 'Trò Chơi Thứ Nhất';
    if (gameId === 'game_two') return 'Trò Chơi Thứ Hai';
    return gameId;
  });

  it('1. Trạng thái Loading -> Render khung skeleton loading', () => {
    render(<StatsSummary allStats={[]} getGameName={mockGetGameName} isLoading={true} />);

    expect(screen.getByTestId('stats-summary-skeleton')).not.toBeNull();
  });

  it('2. Trạng thái rỗng -> Hiển thị 0 ván, top game Chưa có, 0 thắng bot', () => {
    render(<StatsSummary allStats={[]} getGameName={mockGetGameName} />);

    expect(screen.getByTestId('summary-total-matches').textContent).toBe('0');
    expect(screen.getByTestId('summary-top-game').textContent).toBe('Chưa có');
    expect(screen.getByTestId('summary-ai-wins').textContent).toBe('0');
  });

  it('3. Tổng hợp chính xác từ nhiều game khác nhau', () => {
    const allStats: PlayerGameStats[] = [
      {
        gameId: 'game_one',
        totalMatches: 20,
        byModeKey: {
          'vs_ai:easy': { matches: 8, wins: 8, losses: 0, draws: 0 },
          'vs_ai:hard': { matches: 12, wins: 4, losses: 8, draws: 0 },
        },
      },
      {
        gameId: 'game_two',
        totalMatches: 10,
        byModeKey: {
          'vs_ai:medium': { matches: 5, wins: 3, losses: 2, draws: 0 },
          local_pvp: { matches: 5, wins: 0, losses: 0, draws: 1 },
        },
      },
    ];

    render(<StatsSummary allStats={allStats} getGameName={mockGetGameName} />);

    // Tổng số ván = 20 + 10 = 30
    expect(screen.getByTestId('summary-total-matches').textContent).toBe('30');

    // Game chơi nhiều nhất là game_one (20 ván) -> Trò Chơi Thứ Nhất
    expect(screen.getByTestId('summary-top-game').textContent).toBe('Trò Chơi Thứ Nhất');
    expect(screen.getByText('20 ván đã hoàn thành')).not.toBeNull();

    // Tổng ván thắng bot = (8 + 4) + (3) = 15
    expect(screen.getByTestId('summary-ai-wins').textContent).toBe('15');
  });
});
