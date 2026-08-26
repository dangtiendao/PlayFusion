// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO SEASONBADGESSECTION (SRC/COMPONENTS/SEASON/SEASONBADGESSECTION.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SeasonBadgesSection } from './SeasonBadgesSection';
import type { SeasonBadge } from '@/repositories/types';

describe('SeasonBadgesSection Component Tests', () => {
  const sampleBadges: SeasonBadge[] = [
    {
      id: 'b1',
      seasonId: 1,
      seasonName: 'Mùa 1',
      gameId: 'game_1',
      finalRating: 1600,
      finalTier: 'diamond',
      finalRank: 1,
      gamesPlayed: 20,
      wins: 15,
      losses: 5,
      draws: 0,
      createdAt: '2026-08-26T20:00:00Z',
    },
    {
      id: 'b2',
      seasonId: 1,
      seasonName: 'Mùa 1',
      gameId: 'game_2',
      finalRating: 1250,
      finalTier: 'gold',
      finalRank: null,
      gamesPlayed: 8,
      wins: 5,
      losses: 3,
      draws: 0,
      createdAt: '2026-08-26T20:00:00Z',
    },
  ];

  const getGameName = (id: string) => (id === 'game_1' ? 'Trò Chơi 1' : 'Trò Chơi 2');

  it('1. TỰ VỆ: Khi badges rỗng (badges = []) -> Trả về null không render DOM', () => {
    const { container } = render(
      <SeasonBadgesSection badges={[]} getGameName={getGameName} isLoading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('2. Skeleton loading: Khi isLoading = true -> Render khung skeleton', () => {
    render(<SeasonBadgesSection badges={[]} getGameName={getGameName} isLoading={true} />);
    expect(screen.getByTestId('season-badges-skeleton')).toBeInTheDocument();
  });

  it('3. Render danh sách huy hiệu khi có dữ liệu', () => {
    render(<SeasonBadgesSection badges={sampleBadges} getGameName={getGameName} />);

    expect(screen.getByTestId('season-badges-section')).toBeInTheDocument();
    expect(screen.getByText('Kỷ Vật & Huy Hiệu Mùa Giải')).toBeInTheDocument();
    expect(screen.getByText('2 huy hiệu')).toBeInTheDocument();

    const cards = screen.getAllByTestId('season-badge-card');
    expect(cards).toHaveLength(2);
  });
});
