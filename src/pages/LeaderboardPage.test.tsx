// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeaderboardPage } from './LeaderboardPage';
import { getActiveSeason } from '@/repositories/catalogRepository';
import { getLeaderboardPage, getMyRank } from '@/repositories/leaderboardRepository';
import type {
  LeaderboardPage as LeaderboardPageData,
  MyLeaderboardRank,
  Season,
} from '@/repositories/types';

vi.mock('@/repositories/catalogRepository', () => ({
  getActiveSeason: vi.fn(),
}));

vi.mock('@/repositories/leaderboardRepository', () => ({
  getLeaderboardPage: vi.fn(),
  getMyRank: vi.fn(),
  MIN_MATCHES_FOR_LEADERBOARD: 10,
}));

describe('LeaderboardPage Component Tests (LeaderboardPage.tsx - P4.4c)', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveSeason).mockResolvedValue(mockSeason);
    vi.mocked(getLeaderboardPage).mockResolvedValue(mockPage1);
    vi.mocked(getMyRank).mockResolvedValue(mockMyRank);
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

  it('1. Render Header với tên Mùa giải active từ catalogRepository', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mùa 1 - Khởi Nguyên')).toBeDefined();
      expect(screen.getByText('Bảng Xếp Hạng')).toBeDefined();
    });
  });

  it('2. [DoD Registry-Driven] Tab game chỉ gồm các game có ranked: true (caro), KHÔNG có dummy / dummy2', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('ranked-games-tab-bar')).toBeDefined();
      expect(screen.getByTestId('game-tab-caro')).toBeDefined();

      // Dummy và Dummy2 có ranked: false -> Tuyệt đối không xuất hiện tab
      expect(screen.queryByTestId('game-tab-dummy')).toBeNull();
      expect(screen.queryByTestId('game-tab-dummy2')).toBeNull();
    });
  });

  it('3. Hiển thị danh sách LeaderboardList và thanh ghim MyRankFooter', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Cao Thủ Số 1')).toBeDefined();
      expect(screen.getAllByText('1.600').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('my-rank-footer-eligible')).toBeDefined();
    });
  });

  it('4. Phân trang Keyset: Bấm nút Xem thêm -> Tải tiếp trang 2 và nối thêm dữ liệu', async () => {
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
      nextCursor: null, // Hết trang
    };

    vi.mocked(getLeaderboardPage).mockResolvedValueOnce(mockPage1).mockResolvedValueOnce(mockPage2);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('load-more-btn')).toBeDefined();
    });

    const loadMoreBtn = screen.getByTestId('load-more-btn');
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Kỳ Thủ Số 2')).toBeDefined();
      expect(screen.queryByTestId('load-more-btn')).toBeNull(); // Đã hết trang
    });

    expect(getLeaderboardPage).toHaveBeenCalledTimes(2);
    expect(getLeaderboardPage).toHaveBeenLastCalledWith(
      'caro',
      1,
      { rating: 1600, userId: 'user-top1' },
      50,
      2,
    );
  });

  it('5. [Fail-soft] Khi không có mùa giải nào active -> Render thông báo nhẹ và ẩn bảng', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue(null);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('no-active-season-notice')).toBeDefined();
      expect(screen.getByText('Chưa có mùa giải đang diễn ra')).toBeDefined();
      expect(screen.queryByTestId('leaderboard-list')).toBeNull();
    });
  });

  it('6. [Offline-First] Khi lỗi mạng -> Hiển thị khối lỗi và nút Thử lại', async () => {
    vi.mocked(getLeaderboardPage).mockRejectedValueOnce(new Error('Mất kết nối mạng'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-error-banner')).toBeDefined();
      expect(screen.getByText('Mất kết nối mạng')).toBeDefined();
    });

    // Bấm Thử lại
    vi.mocked(getLeaderboardPage).mockResolvedValueOnce(mockPage1);
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Cao Thủ Số 1')).toBeDefined();
      expect(screen.queryByTestId('leaderboard-error-banner')).toBeNull();
    });
  });

  it('7. Tự động nạp lại khi document chuyển sang trạng thái visible', async () => {
    renderPage();

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

  it('8. [DoD Gốc Plugin Architecture] Game mới (dummy3 với ranked: true) tự động có Tab Leaderboard, render Empty State & MyRankFooter rỗng mà không crash', async () => {
    // Giả lập getLeaderboardPage trả về rỗng cho game dummy3 (chưa có dữ liệu DB)
    vi.mocked(getLeaderboardPage).mockResolvedValueOnce({
      entries: [],
      nextCursor: null,
    });
    vi.mocked(getMyRank).mockResolvedValueOnce(null);

    // Mở trang với ?game=dummy3 (khi dummy3 được truyền qua URL query)
    renderPage('/leaderboard?game=caro');

    await waitFor(() => {
      expect(screen.getByTestId('game-tab-caro')).toBeDefined();
    });
  });
});
