// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GameDefinition, Engine } from '@engines/types';
import type { PlayerGameStats } from '@/repositories/types';
import { GameStatCard } from './GameStatCard';

const mockEngine: Engine<unknown, unknown> = {
  init: () => ({ board: [] }),
  legalMoves: () => [],
  applyMove: (state) => state,
  currentPlayer: () => 0,
  isTerminal: () => ({ over: false }),
  serialize: () => '{}',
  deserialize: () => ({ board: [] }),
};

const mockWinLossDefinition: GameDefinition = {
  id: 'test_board_game',
  name: 'Cờ Bàn Thử Nghiệm',
  description: 'Trò chơi cờ bàn thử nghiệm luật thi đấu.',
  category: 'board',
  scoring: 'win_loss',
  players: { min: 2, max: 2 },
  modes: ['vs_ai', 'local_pvp'],
  turnBased: true,
  ranked: true,
  ratingSystem: 'elo',
  hasDraw: true,
  avgMatchSeconds: 300,
  aiLevels: ['easy', 'medium', 'hard'],
  loadEngine: async () => mockEngine,
};

const mockScoreDefinition: GameDefinition = {
  id: 'test_arcade_game',
  name: 'Phi Thuyền Thử Nghiệm',
  description: 'Game arcade tính điểm.',
  category: 'arcade',
  scoring: 'score',
  players: { min: 1, max: 1 },
  modes: ['solo'],
  turnBased: false,
  ranked: false,
  ratingSystem: 'leaderboard_only',
  hasDraw: false,
  avgMatchSeconds: 120,
  loadEngine: async () => mockEngine,
};

const mockTimeDefinition: GameDefinition = {
  id: 'test_puzzle_game',
  name: 'Xếp Hình Thử Nghiệm',
  description: 'Game giải đố tính thời gian.',
  category: 'puzzle',
  scoring: 'time',
  players: { min: 1, max: 1 },
  modes: ['solo'],
  turnBased: false,
  ranked: false,
  ratingSystem: 'leaderboard_only',
  hasDraw: false,
  avgMatchSeconds: 120,
  loadEngine: async () => mockEngine,
};

describe('GameStatCard Generic Component Tests (GameStatCard.tsx - P2.6b)', () => {
  it('1. Trạng thái Loading -> Render khung Skeleton loading', () => {
    render(<GameStatCard definition={mockWinLossDefinition} stats={null} isLoading={true} />);

    expect(screen.getByTestId(`stat-card-skeleton-${mockWinLossDefinition.id}`)).not.toBeNull();
  });

  it('2. Trạng thái Empty (chưa có ván đấu) -> Hiển thị Empty State và bấm nút Chơi ngay', () => {
    const handlePlay = vi.fn();
    render(<GameStatCard definition={mockWinLossDefinition} stats={null} onPlay={handlePlay} />);

    expect(screen.getByTestId(`empty-stat-${mockWinLossDefinition.id}`)).not.toBeNull();
    expect(screen.getByText('Chưa có ván đấu nào được ghi nhận trên Cloud.')).not.toBeNull();

    const playBtn = screen.getByTestId(`play-now-btn-${mockWinLossDefinition.id}`);
    expect(playBtn).not.toBeNull();
    fireEvent.click(playBtn);
    expect(handlePlay).toHaveBeenCalledTimes(1);
  });

  it('3. Trạng thái Mở Khóa Winrate (>= 10 trận) -> Hiển thị Winrate % to và chi tiết Đấu Máy', () => {
    const stats: PlayerGameStats = {
      gameId: mockWinLossDefinition.id,
      totalMatches: 15,
      byModeKey: {
        'vs_ai:easy': { matches: 5, wins: 5, losses: 0, draws: 0 },
        'vs_ai:hard': { matches: 10, wins: 5, losses: 5, draws: 0 },
      },
    };

    render(<GameStatCard definition={mockWinLossDefinition} stats={stats} />);

    // Kiểm tra số ván tổng
    expect(screen.getByText('15 ván đã đấu')).not.toBeNull();

    // 15 trận vs_ai (10W, 5L) -> 10 / 15 * 100 = 66.7%
    expect(screen.getByTestId(`winrate-pct-${mockWinLossDefinition.id}`).textContent).toContain(
      '66.7%',
    );
    expect(screen.getByText('Tỷ lệ thắng')).not.toBeNull();

    // Kiểm tra hiển thị chi tiết các cấp độ
    expect(screen.getByText('Dễ')).not.toBeNull();
    expect(screen.getByText('5 ván (5W - 0L)')).not.toBeNull();
    expect(screen.getByText('Khó')).not.toBeNull();
    expect(screen.getByText('10 ván (5W - 5L)')).not.toBeNull();
  });

  it('4. Trạng thái Ẩn Winrate (< 10 trận) -> Hiển thị thanh tiến độ và số trận cần thêm', () => {
    const stats: PlayerGameStats = {
      gameId: mockWinLossDefinition.id,
      totalMatches: 6,
      byModeKey: {
        'vs_ai:easy': { matches: 6, wins: 4, losses: 2, draws: 0 },
      },
    };

    render(<GameStatCard definition={mockWinLossDefinition} stats={stats} />);

    expect(screen.getByText('Cần thêm 4 trận để mở khóa Tỷ lệ thắng')).not.toBeNull();
    expect(screen.getByText('6/10')).not.toBeNull();
    expect(screen.queryByTestId(`winrate-pct-${mockWinLossDefinition.id}`)).toBeNull();
  });

  it('5. Game có scoring = "score" -> Render khối hiển thị Điểm cao nhất (Bằng chứng generic)', () => {
    const stats: PlayerGameStats = {
      gameId: mockScoreDefinition.id,
      totalMatches: 8,
      byModeKey: {
        solo: { matches: 8, wins: 0, losses: 0, draws: 0 },
      },
    };

    render(<GameStatCard definition={mockScoreDefinition} stats={stats} />);

    expect(screen.getByTestId(`score-hero-${mockScoreDefinition.id}`)).not.toBeNull();
    expect(screen.getByText('🏆 Điểm cao nhất')).not.toBeNull();
    expect(screen.getByText('8 ván đã hoàn thành')).not.toBeNull();
  });

  it('6. Game có scoring = "time" -> Render khối hiển thị Thời gian tốt nhất (Bằng chứng generic)', () => {
    const stats: PlayerGameStats = {
      gameId: mockTimeDefinition.id,
      totalMatches: 12,
      byModeKey: {
        solo: { matches: 12, wins: 0, losses: 0, draws: 0 },
      },
    };

    render(<GameStatCard definition={mockTimeDefinition} stats={stats} />);

    expect(screen.getByTestId(`score-hero-${mockTimeDefinition.id}`)).not.toBeNull();
    expect(screen.getByText('⏱️ Thời gian tốt nhất')).not.toBeNull();
    expect(screen.getByText('12 ván đã hoàn thành')).not.toBeNull();
  });
});
