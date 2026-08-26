// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO RANKCARD (SRC/COMPONENTS/RANK/RANKCARD.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RankCard } from './RankCard';
import type { GameDefinition, Engine } from '@/games/types';
import { resolveRankView, PLACEMENT_GAMES_DEFAULT } from '@rating';

describe('RankCard Component Tests', () => {
  const mockEngine: Engine<unknown, unknown> = {
    init: () => ({}),
    legalMoves: () => [],
    applyMove: (s) => s,
    currentPlayer: () => 0,
    isTerminal: () => ({ over: false }),
    serialize: () => '{}',
    deserialize: () => ({}),
  };

  const rankedGameDef: GameDefinition = {
    id: 'test_game',
    name: 'Cờ Thử Nghiệm',
    description: 'Game thử nghiệm xếp hạng.',
    icon: '🎲',
    category: 'board',
    scoring: 'win_loss',
    ratingSystem: 'elo',
    turnBased: true,
    hasDraw: true,
    avgMatchSeconds: 300,
    players: { min: 2, max: 2 },
    modes: ['local_pvp', 'online_1v1'],
    ranked: true,
    loadEngine: async () => mockEngine,
  };

  const unrankedGameDef: GameDefinition = {
    ...rankedGameDef,
    id: 'unranked_game',
    name: 'Game Không Ranked',
    ranked: false,
  };

  it('1. TỰ VỆ: Game không có ranked (definition.ranked=false) -> return null không render DOM', () => {
    const { container } = render(<RankCard definition={unrankedGameDef} rankView={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('2. Skeleton loading: Khi isLoading=true -> render khung skeleton', () => {
    render(<RankCard definition={rankedGameDef} rankView={null} isLoading={true} />);

    expect(screen.getByTestId('rank-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('rank-card')).not.toBeInTheDocument();
  });

  it('3. Nhánh 1 (placement): Render tiến độ định hạng 5/15 trận', () => {
    const rankView = resolveRankView({
      rating: 1200,
      gamesPlayed: 5,
      placementGames: PLACEMENT_GAMES_DEFAULT,
      lastMatch: null,
    });

    render(<RankCard definition={rankedGameDef} rankView={rankView} />);

    expect(screen.getByTestId('rank-card')).toBeInTheDocument();
    expect(screen.getByTestId('placement-badge')).toHaveTextContent('Định Hạng');
    expect(screen.getByText('5 / 15 trận')).toBeInTheDocument();
    expect(screen.getByTestId('placement-progress-fill')).toBeInTheDocument();
    expect(screen.getByText(/Cần thêm 10 trận/)).toBeInTheDocument();
  });

  it('4. Nhánh 2 (ranked): Render RankBadge (displayTier + shield) và điểm số Elo', () => {
    const rankView = resolveRankView({
      rating: 1189,
      gamesPlayed: 20,
      placementGames: PLACEMENT_GAMES_DEFAULT,
      lastMatch: {
        ratingBefore: 1205, // Vàng
        ratingAfter: 1189, // Bạc (vừa rớt ngưỡng)
      },
    });

    render(<RankCard definition={rankedGameDef} rankView={rankView} />);

    expect(screen.getByTestId('rank-badge')).toBeInTheDocument();
    expect(screen.getByText('Vàng')).toBeInTheDocument(); // Bậc hiển thị được bảo vệ
    expect(screen.getByTestId('rank-shield-icon')).toBeInTheDocument(); // Có icon khiên
    expect(screen.getByTestId('rank-rating-value')).toHaveTextContent('1189');
    expect(screen.getByTestId('rank-progress-bar')).toBeInTheDocument();
  });

  it('5. Nhánh 3 (null - Chưa đấu ranked): Render thông báo và nút Đấu Ngay', () => {
    const handlePlay = vi.fn();

    render(<RankCard definition={rankedGameDef} rankView={null} onPlay={handlePlay} />);

    expect(screen.getByTestId('unranked-badge')).toHaveTextContent('Chưa có hạng');
    expect(screen.getByText('Chưa có thành tích ranked mùa này.')).toBeInTheDocument();

    const playBtn = screen.getByTestId('rank-play-btn');
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);
    expect(handlePlay).toHaveBeenCalledTimes(1);
  });

  it('6. Cảnh báo Decay: Render dòng thông báo bị trừ điểm khi có decayInfo', () => {
    const rankView = resolveRankView({
      rating: 1690,
      gamesPlayed: 25,
      placementGames: PLACEMENT_GAMES_DEFAULT,
      lastMatch: null,
    });

    render(
      <RankCard
        definition={rankedGameDef}
        rankView={rankView}
        decayInfo={{ points: 10, weekKey: '2026-35' }}
      />,
    );

    const decayWarning = screen.getByTestId('rank-decay-warning');
    expect(decayWarning).toBeInTheDocument();
    expect(decayWarning).toHaveTextContent('-10 điểm');
    expect(decayWarning).toHaveTextContent('không hoạt động');
  });
});
