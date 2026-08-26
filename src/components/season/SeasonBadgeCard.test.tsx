// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO SEASONBADGECARD (SRC/COMPONENTS/SEASON/SEASONBADGECARD.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SeasonBadgeCard } from './SeasonBadgeCard';
import type { SeasonBadge } from '@/repositories/types';

describe('SeasonBadgeCard Component Tests', () => {
  const sampleBadge: SeasonBadge = {
    id: 'badge-111',
    seasonId: 1,
    seasonName: 'Mùa 1 - Khởi Nguyên',
    gameId: 'dummy_game',
    finalRating: 1750,
    finalTier: 'diamond',
    finalRank: 1,
    gamesPlayed: 25,
    wins: 20,
    losses: 4,
    draws: 1,
    createdAt: '2026-08-26T20:00:00Z',
  };

  it('1. Render đầy đủ thông tin huy hiệu: Mùa, tên game, Tier Kim Cương, Rank 1 🥇 và điểm Elo', () => {
    render(<SeasonBadgeCard badge={sampleBadge} gameName="Trò Chơi Thử Nghiệm" />);

    expect(screen.getByTestId('season-badge-card')).toBeInTheDocument();
    expect(screen.getByText('Mùa 1 - Khởi Nguyên')).toBeInTheDocument();
    expect(screen.getByText('Trò Chơi Thử Nghiệm')).toBeInTheDocument();
    expect(screen.getByText('🥇 Top #1')).toBeInTheDocument();
    expect(screen.getByText('1.750')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText(/25 ván/)).toBeInTheDocument();
  });

  it('2. Top 2 và Top 3 hiển thị huy chương tương ứng 🥈 và 🥉', () => {
    const badgeTop2: SeasonBadge = { ...sampleBadge, finalRank: 2 };
    const { rerender } = render(<SeasonBadgeCard badge={badgeTop2} gameName="Game A" />);
    expect(screen.getByText('🥈 Top #2')).toBeInTheDocument();

    const badgeTop3: SeasonBadge = { ...sampleBadge, finalRank: 3 };
    rerender(<SeasonBadgeCard badge={badgeTop3} gameName="Game A" />);
    expect(screen.getByText('🥉 Top #3')).toBeInTheDocument();

    const badgeTop10: SeasonBadge = { ...sampleBadge, finalRank: 10 };
    rerender(<SeasonBadgeCard badge={badgeTop10} gameName="Game A" />);
    expect(screen.getByText('Top #10')).toBeInTheDocument();
  });

  it('3. Kỳ thủ < 10 trận (finalRank = null) -> Hiển thị "Hoàn thành (x ván)"', () => {
    const badgeUnranked: SeasonBadge = {
      ...sampleBadge,
      finalRank: null,
      gamesPlayed: 5,
      wins: 3,
      losses: 2,
      draws: 0,
    };

    render(<SeasonBadgeCard badge={badgeUnranked} gameName="Game B" />);
    expect(screen.getByText('Hoàn thành (5 ván)')).toBeInTheDocument();
  });

  it('4. TỰ VỆ: Game đã bị gỡ khỏi Registry -> Render tên game an toàn không crash', () => {
    render(<SeasonBadgeCard badge={sampleBadge} gameName="removed_game_id" />);
    expect(screen.getByText('removed_game_id')).toBeInTheDocument();
  });
});
