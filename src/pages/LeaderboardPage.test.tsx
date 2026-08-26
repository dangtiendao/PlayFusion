// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeaderboardPage } from './LeaderboardPage';
import { getActiveSeason } from '@/repositories/catalogRepository';
import { getLeaderboardPage, getMyRank } from '@/repositories/leaderboardRepository';
import { globalLeaderboardRepository } from '@/repositories/globalLeaderboardRepository';
import type {
  LeaderboardPage as LeaderboardPageData,
  MyLeaderboardRank,
  Season,
  MasterEntry,
  GrinderEntry,
} from '@/repositories/types';

vi.mock('@/repositories/catalogRepository', () => ({
  getActiveSeason: vi.fn(),
}));

vi.mock('@/repositories/leaderboardRepository', () => ({
  getLeaderboardPage: vi.fn(),
  getMyRank: vi.fn(),
  MIN_MATCHES_FOR_LEADERBOARD: 10,
}));

vi.mock('@/repositories/globalLeaderboardRepository', () => ({
  globalLeaderboardRepository: {
    getMasters: vi.fn(),
    getGrinders: vi.fn(),
    getMyGlobalRank: vi.fn(),
  },
}));

describe('LeaderboardPage Component Tests (LeaderboardPage.tsx - P4.4c & P4.7c)', () => {
  const mockSeason: Season = {
    id: 1,
    name: 'Mùa 1 - Khởi Nguyên',
    startedAt: '2026-08-01T00:00:00Z',
    endedAt: null,
    isActive: true,
  };

  const mockPage1: LeaderboardPageData = {
    entries: [
      {
        rank: 1,
        userId: 'user-top1',
        displayName: 'Cao Thủ Số 1',
        avatarUrl: null,
        rating: 1600,
        gamesPlayed: 25,
        wins: 20,
        losses: 5,
        bestRating: 1620,
      },
    ],
    nextCursor: { rating: 1600, userId: 'user-top1' },
  };

  const mockMyRank: MyLeaderboardRank = {
    rank: 1,
    rating: 1600,
    gamesPlayed: 25,
    eligible: true,
  };

  const mockMasters: MasterEntry[] = [
    {
      rank: 1,
      userId: 'user-master-1',
      displayName: 'Đại Cao Thủ',
      avatarUrl: null,
      weightedRating: 1750,
      gamesCount: 2,
      totalGames: 60,
      bestTierRating: 1750,
    },
  ];

  const mockGrinders: GrinderEntry[] = [
    {
      rank: 1,
      userId: 'user-grinder-1',
      displayName: 'Siêu Cày Cuốc',
      avatarUrl: null,
      earnedCoins: 2500,
      totalMatches: 40,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveSeason).mockResolvedValue(mockSeason);
    vi.mocked(getLeaderboardPage).mockResolvedValue(mockPage1);
    vi.mocked(getMyRank).mockResolvedValue(mockMyRank);
    vi.mocked(globalLeaderboardRepository.getMasters).mockResolvedValue(mockMasters);
    vi.mocked(globalLeaderboardRepository.getGrinders).mockResolvedValue(mockGrinders);
    vi.mocked(globalLeaderboardRepository.getMyGlobalRank).mockResolvedValue({
      rank: 1,
      value: 1750,
    });
  });

  const renderPage = (initialUrl = '/leaderboard') => {
    return render(
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/leaderboard" element={<LeaderboardPage />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('1. Render Header với tên Mùa giải active và Tab Tổng mặc định', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mùa 1 - Khởi Nguyên')).toBeDefined();
      expect(screen.getByText('Bảng Xếp Hạng')).toBeDefined();
      expect(screen.getByTestId('game-tab-global')).toBeDefined();
    });
  });

  it('2. [P4.7c Tab Tổng] Render Segmented Control (Cao Thủ vs Chăm Chỉ) và Dòng chú thích độ trễ ~10 phút', async () => {
    renderPage('/leaderboard?game=global&board=masters');

    await waitFor(() => {
      expect(screen.getByTestId('global-board-segmented-control')).toBeDefined();
      expect(screen.getByTestId('global-board-tab-masters')).toBeDefined();
      expect(screen.getByTestId('global-board-tab-grinders')).toBeDefined();
      expect(screen.getByTestId('global-latency-notice')).toBeDefined();
      expect(screen.getByText(/Cập nhật ~10 phút\/lần/)).toBeDefined();
      expect(screen.getByText('Đại Cao Thủ')).toBeDefined();
    });
  });

  it('3. [P4.7c Chuyển Bảng] Bấm chuyển sang Chăm Chỉ -> Tải dữ liệu getGrinders', async () => {
    renderPage('/leaderboard?game=global&board=masters');

    await waitFor(() => {
      expect(screen.getByTestId('global-board-tab-grinders')).toBeDefined();
    });

    const grindersBtn = screen.getByTestId('global-board-tab-grinders');
    fireEvent.click(grindersBtn);

    await waitFor(() => {
      expect(globalLeaderboardRepository.getGrinders).toHaveBeenCalled();
      expect(screen.getByText('Siêu Cày Cuốc')).toBeDefined();
    });
  });

  it('4. [DoD Registry-Driven] Chuyển sang tab Game Caro -> Render LeaderboardList và MyRankFooter của game', async () => {
    renderPage('/leaderboard?game=caro');

    await waitFor(() => {
      expect(screen.getByTestId('game-tab-caro')).toBeDefined();
      expect(getLeaderboardPage).toHaveBeenCalledWith('caro', 1, null, 50, 1);
      expect(screen.getByText('Cao Thủ Số 1')).toBeDefined();
      expect(screen.getByTestId('my-rank-footer-eligible')).toBeDefined();
    });
  });

  it('5. Phân trang Keyset trên Tab Game: Bấm nút Xem thêm -> Tải tiếp trang 2', async () => {
    const mockPage2: LeaderboardPageData = {
      entries: [
        {
          rank: 2,
          userId: 'user-top2',
          displayName: 'Kỳ Thủ Số 2',
          avatarUrl: null,
          rating: 1550,
          gamesPlayed: 18,
          wins: 14,
          losses: 4,
          bestRating: 1550,
        },
      ],
      nextCursor: null,
    };

    vi.mocked(getLeaderboardPage).mockResolvedValueOnce(mockPage1).mockResolvedValueOnce(mockPage2);

    renderPage('/leaderboard?game=caro');

    await waitFor(() => {
      expect(screen.getByTestId('load-more-btn')).toBeDefined();
    });

    const loadMoreBtn = screen.getByTestId('load-more-btn');
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Kỳ Thủ Số 2')).toBeDefined();
      expect(screen.queryByTestId('load-more-btn')).toBeNull();
    });
  });

  it('6. [Fail-soft] Khi không có mùa giải nào active -> Render thông báo nhẹ và ẩn bảng', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue(null);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('no-active-season-notice')).toBeDefined();
      expect(screen.getByText('Chưa có mùa giải đang diễn ra')).toBeDefined();
    });
  });

  it('7. [Offline-First] Khi lỗi mạng -> Hiển thị khối lỗi và nút Thử lại', async () => {
    vi.mocked(globalLeaderboardRepository.getMasters).mockRejectedValueOnce(
      new Error('Mất kết nối mạng'),
    );

    renderPage('/leaderboard?game=global&board=masters');

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-error-banner')).toBeDefined();
      expect(screen.getByText('Mất kết nối mạng')).toBeDefined();
    });

    // Bấm Thử lại
    vi.mocked(globalLeaderboardRepository.getMasters).mockResolvedValueOnce(mockMasters);
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Đại Cao Thủ')).toBeDefined();
      expect(screen.queryByTestId('leaderboard-error-banner')).toBeNull();
    });
  });

  it('8. Tự động nạp lại khi document chuyển sang trạng thái visible', async () => {
    renderPage('/leaderboard?game=caro');

    await waitFor(() => {
      expect(getLeaderboardPage).toHaveBeenCalledTimes(1);
    });

    // Giả lập sự kiện visibilitychange
    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(getLeaderboardPage).toHaveBeenCalledTimes(2);
    });
  });
});
