// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO GLOBALLEADERBOARDLIST (SRC/COMPONENTS/LEADERBOARD/GLOBALLEADERBOARDLIST.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GlobalLeaderboardList } from './GlobalLeaderboardList';
import type { MasterEntry, GrinderEntry } from '../../repositories/types';

describe('GlobalLeaderboardList Component Tests (P4.7b)', () => {
  const sampleMasters: MasterEntry[] = [
    {
      rank: 1,
      userId: 'user-1',
      displayName: 'Kỳ Thủ Top 1',
      avatarUrl: 'https://avatar.dev/1.png',
      weightedRating: 1650,
      gamesCount: 2,
      totalGames: 50,
      bestTierRating: 1700,
    },
    {
      rank: 2,
      userId: 'user-2',
      displayName: 'Kỳ Thủ Top 2',
      avatarUrl: null,
      weightedRating: 1420,
      gamesCount: 1,
      totalGames: 25,
      bestTierRating: 1420,
    },
    {
      rank: 3,
      userId: 'user-3',
      displayName: 'Kỳ Thủ Top 3',
      avatarUrl: null,
      weightedRating: 1300,
      gamesCount: 1,
      totalGames: 12,
      bestTierRating: 1300,
    },
  ];

  const sampleGrinders: GrinderEntry[] = [
    {
      rank: 1,
      userId: 'user-1',
      displayName: 'Cày Cuốc Top 1',
      avatarUrl: null,
      earnedCoins: 1250,
      totalMatches: 30,
    },
    {
      rank: 2,
      userId: 'user-2',
      displayName: 'Cày Cuốc Top 2',
      avatarUrl: null,
      earnedCoins: 800,
      totalMatches: 20,
    },
  ];

  describe('1. Trạng Thái Loading Skeleton', () => {
    it('Render khung xương skeleton khi isLoading = true', () => {
      render(
        <GlobalLeaderboardList
          variant="masters"
          entries={[]}
          myUserId={null}
          isLoading={true}
          myRank={null}
        />,
      );

      expect(screen.getByTestId('global-leaderboard-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('global-leaderboard-list')).not.toBeInTheDocument();
    });
  });

  describe('2. Trạng Thái Danh Sách Rỗng (Empty State)', () => {
    it('2.1 Bảng Cao Thủ: Render thông điệp rỗng mặc định cho Masters', () => {
      render(
        <GlobalLeaderboardList
          variant="masters"
          entries={[]}
          myUserId={null}
          isLoading={false}
          myRank={null}
        />,
      );

      expect(screen.getByTestId('global-leaderboard-empty')).toBeInTheDocument();
      expect(
        screen.getByText('Chưa có kỳ thủ nào hoàn thành định hạng (≥10 ván) trong mùa này.'),
      ).toBeInTheDocument();
    });

    it('2.2 Bảng Chăm Chỉ: Render thông điệp rỗng mặc định cho Grinders', () => {
      render(
        <GlobalLeaderboardList
          variant="grinders"
          entries={[]}
          myUserId={null}
          isLoading={false}
          myRank={null}
        />,
      );

      expect(screen.getByTestId('global-leaderboard-empty')).toBeInTheDocument();
      expect(
        screen.getByText('Chưa có người chơi nào nhận thưởng xu từ ván đấu trong mùa này.'),
      ).toBeInTheDocument();
    });
  });

  describe('3. Biến Thể Bảng Cao Thủ (variant = masters)', () => {
    it('Render đầy đủ huân chương Top 1 🥇, 2 🥈, 3 🥉, điểm Elo, RankBadge và thông tin game', () => {
      render(
        <GlobalLeaderboardList
          variant="masters"
          entries={sampleMasters}
          myUserId="user-2"
          isLoading={false}
          myRank={{ rank: 2, value: 1420 }}
        />,
      );

      expect(screen.getByTestId('global-leaderboard-list')).toBeInTheDocument();
      expect(screen.getByTestId('rank-medal-1')).toBeInTheDocument();
      expect(screen.getByTestId('rank-medal-2')).toBeInTheDocument();
      expect(screen.getByTestId('rank-medal-3')).toBeInTheDocument();

      expect(screen.getByText('Kỳ Thủ Top 1')).toBeInTheDocument();
      expect(screen.getByText('1.650')).toBeInTheDocument();
      expect(screen.getByText('2 game • 50 trận')).toBeInTheDocument();

      // Dòng của tôi: có nhãn Bạn
      expect(screen.getByTestId('badge-is-me')).toHaveTextContent('Bạn');

      // Footer hạng của tôi
      expect(screen.getByTestId('global-my-rank-footer')).toBeInTheDocument();
      expect(screen.getByTestId('my-global-rank-value')).toHaveTextContent('#2');
    });

    it('Footer Bảng Cao Thủ khi rank = null: Render hướng dẫn cần định hạng ≥10 ván', () => {
      render(
        <GlobalLeaderboardList
          variant="masters"
          entries={sampleMasters}
          myUserId="user-unranked"
          isLoading={false}
          myRank={null}
        />,
      );

      const guidance = screen.getByTestId('my-global-rank-guidance');
      expect(guidance).toBeInTheDocument();
      expect(guidance).toHaveTextContent(/Cần hoàn thành định hạng ít nhất 1 trò chơi/);
    });
  });

  describe('4. Biến Thể Bảng Chăm Chỉ (variant = grinders)', () => {
    it('Render đầy đủ huân chương, xu kiếm được 🪙 và số trận mùa này', () => {
      render(
        <GlobalLeaderboardList
          variant="grinders"
          entries={sampleGrinders}
          myUserId="user-1"
          isLoading={false}
          myRank={{ rank: 1, value: 1250 }}
        />,
      );

      expect(screen.getByTestId('global-leaderboard-list')).toBeInTheDocument();
      expect(screen.getByText('Cày Cuốc Top 1')).toBeInTheDocument();
      expect(screen.getAllByText(/1\.250/).length).toBeGreaterThan(0);
      expect(screen.getByText('30 trận mùa này')).toBeInTheDocument();

      // Footer hạng 1
      expect(screen.getByTestId('my-global-rank-value')).toHaveTextContent('#1');
    });

    it('Footer Bảng Chăm Chỉ khi rank = null: Render hướng dẫn tham gia đấu để nhận xu', () => {
      render(
        <GlobalLeaderboardList
          variant="grinders"
          entries={sampleGrinders}
          myUserId="user-new"
          isLoading={false}
          myRank={{ rank: null, value: null }}
        />,
      );

      const guidance = screen.getByTestId('my-global-rank-guidance');
      expect(guidance).toBeInTheDocument();
      expect(guidance).toHaveTextContent(/Chưa kiếm được xu nào từ đấu ván mùa này/);
    });
  });
});
