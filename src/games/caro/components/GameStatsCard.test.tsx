// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameStatsCard } from './GameStatsCard';
import type { GameLocalStats, LocalMatchRecord } from '../../../core/gameLocalData';

describe('Caro GameStatsCard Component Tests (GameStatsCard.tsx - P1.5c)', () => {
  const emptyStats: GameLocalStats = {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    byMode: {},
    currentStreak: 0,
    bestStreak: 0,
    updatedAt: new Date().toISOString(),
  };

  const sampleStats: GameLocalStats = {
    totalMatches: 10,
    wins: 7,
    losses: 2,
    draws: 1,
    byMode: {
      'vs_ai:easy': { matches: 3, wins: 3, losses: 0, draws: 0 },
      'vs_ai:hard': { matches: 5, wins: 3, losses: 1, draws: 1 },
      local_pvp: { matches: 2, wins: 0, losses: 0, draws: 0 },
    },
    currentStreak: 3,
    bestStreak: 5,
    updatedAt: new Date().toISOString(),
  };

  const sampleHistory: LocalMatchRecord[] = [
    {
      id: 'rec_1',
      finishedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      modeKey: 'vs_ai:hard',
      outcome: 'win',
      summary: { moveCount: 15 },
    },
    {
      id: 'rec_2',
      finishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      modeKey: 'local_pvp',
      outcome: 'none',
      summary: { moveCount: 22 },
    },
  ];

  it('1. Ẩn khối Thành tích khi chưa chơi ván nào (totalMatches = 0)', () => {
    render(<GameStatsCard stats={emptyStats} history={[]} />);

    expect(screen.queryByTestId('caro-stats-card')).toBeNull();
    expect(screen.queryByTestId('caro-recent-history-card')).toBeNull();
  });

  it('2. Hiển thị đầy đủ thông số thành tích khi totalMatches > 0', () => {
    render(<GameStatsCard stats={sampleStats} history={sampleHistory} />);

    expect(screen.getByTestId('caro-stats-card')).not.toBeNull();
    expect(screen.getByText('Tổng 10 ván')).not.toBeNull();
    expect(screen.getByText('70%')).not.toBeNull(); // 7/10 win rate
    expect(screen.getByText('3 🔥')).not.toBeNull();
    expect(screen.getByText('5 🏆')).not.toBeNull();

    expect(screen.getByText(/Máy Dễ:/i)).not.toBeNull();
    expect(screen.getByText(/3T - 0B - 0H \(3 ván\)/i)).not.toBeNull();
  });

  it('3. Hiển thị danh sách ván gần đây với đúng badge kết quả', () => {
    render(<GameStatsCard stats={sampleStats} history={sampleHistory} />);

    expect(screen.getByTestId('caro-recent-history-card')).not.toBeNull();
    expect(screen.getByTestId('history-item-rec_1')).not.toBeNull();
    expect(screen.getByTestId('history-item-rec_2')).not.toBeNull();

    expect(screen.getByText('🏆 Thắng')).not.toBeNull();
    expect(screen.getByText('👥 2 Người')).not.toBeNull();
    expect(screen.getByText('15 nước')).not.toBeNull();
  });
});
