// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyRankFooter } from './MyRankFooter';
import type { MyLeaderboardRank } from '../../repositories/types';

describe('MyRankFooter Component Tests (MyRankFooter.tsx - P4.4b)', () => {
  it('1. Nhánh 1 (myRank = null) -> Hiển thị thông điệp chưa đấu', () => {
    render(<MyRankFooter myRank={null} minMatches={10} />);

    expect(screen.getByTestId('my-rank-footer-unranked')).toBeDefined();
    expect(screen.getByText('Bạn chưa có hạng game này — đấu online để định hạng!')).toBeDefined();
  });

  it('2. Nhánh 2 (eligible = false, gamesPlayed < 10) -> Hiển thị số trận cần thêm và điểm Elo', () => {
    const mockIneligible: MyLeaderboardRank = {
      rank: null,
      rating: 1230,
      gamesPlayed: 6,
      eligible: false,
    };

    render(<MyRankFooter myRank={mockIneligible} minMatches={10} />);

    expect(screen.getByTestId('my-rank-footer-ineligible')).toBeDefined();
    expect(screen.getByText('Cần thêm 4 trận để lên bảng (6/10)')).toBeDefined();
    expect(screen.getByText('1230 Elo')).toBeDefined();
  });

  it('3. Nhánh 3 (eligible = true) -> Hiển thị thứ hạng, số điểm Elo và Huy hiệu Rank', () => {
    const mockEligible: MyLeaderboardRank = {
      rank: 12,
      rating: 1450, // Bạch Kim
      gamesPlayed: 25,
      eligible: true,
    };

    render(<MyRankFooter myRank={mockEligible} minMatches={10} />);

    expect(screen.getByTestId('my-rank-footer-eligible')).toBeDefined();
    expect(screen.getByText('#12')).toBeDefined();
    expect(screen.getByText('1.450')).toBeDefined();
    expect(screen.getByText('25 trận')).toBeDefined();
    expect(screen.getByText('Bạch Kim')).toBeDefined();
  });
});
