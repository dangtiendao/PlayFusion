// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeaderboardList } from './LeaderboardList';
import type { LeaderboardEntry } from '../../repositories/types';

describe('LeaderboardList Component Tests (LeaderboardList.tsx - P4.4b)', () => {
  const mockEntries: LeaderboardEntry[] = [
    {
      rank: 1,
      userId: 'user-1',
      displayName: 'Kỳ Thủ 1',
      avatarUrl: null,
      rating: 1500,
      gamesPlayed: 20,
      wins: 15,
      losses: 5,
      bestRating: 1520,
    },
    {
      rank: 2,
      userId: 'user-2',
      displayName: 'Kỳ Thủ 2',
      avatarUrl: null,
      rating: 1450,
      gamesPlayed: 18,
      wins: 12,
      losses: 6,
      bestRating: 1450,
    },
  ];

  it('1. Trạng thái isLoading = true -> Render LeaderboardSkeleton', () => {
    render(
      <LeaderboardList
        entries={[]}
        myUserId="user-me"
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
        isLoading={true}
      />,
    );

    expect(screen.getByTestId('leaderboard-skeleton')).toBeDefined();
    expect(screen.queryByTestId('leaderboard-empty-state')).toBeNull();
    expect(screen.queryByTestId('leaderboard-list')).toBeNull();
  });

  it('2. Trạng thái entries rỗng (length = 0) -> Render Empty State với thông điệp mặc định hoặc tùy biến', () => {
    const { rerender } = render(
      <LeaderboardList
        entries={[]}
        myUserId="user-me"
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByTestId('leaderboard-empty-state')).toBeDefined();
    expect(screen.getByText('Chưa có ai trên bảng — hãy là người đầu tiên!')).toBeDefined();

    // Override emptyText
    rerender(
      <LeaderboardList
        entries={[]}
        myUserId="user-me"
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
        isLoading={false}
        emptyText="Không tìm thấy kỳ thủ phù hợp"
      />,
    );
    expect(screen.getByText('Không tìm thấy kỳ thủ phù hợp')).toBeDefined();
  });

  it('3. Trạng thái có dữ liệu -> Render danh sách LeaderboardRow và đánh dấu đúng isMe', () => {
    render(
      <LeaderboardList
        entries={mockEntries}
        myUserId="user-1"
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByTestId('leaderboard-list')).toBeDefined();
    expect(screen.getByTestId('leaderboard-row-user-1')).toBeDefined();
    expect(screen.getByTestId('leaderboard-row-user-2')).toBeDefined();

    // User-1 là "Bạn"
    expect(screen.getByTestId('is-me-badge')).toBeDefined();
    expect(screen.queryByTestId('load-more-btn')).toBeNull(); // hasMore = false
  });

  it('4. Trạng thái hasMore = true -> Render nút Xem thêm và gọi onLoadMore khi bấm', () => {
    const handleLoadMore = vi.fn();

    render(
      <LeaderboardList
        entries={mockEntries}
        myUserId="user-me"
        hasMore={true}
        isLoadingMore={false}
        onLoadMore={handleLoadMore}
        isLoading={false}
      />,
    );

    const loadMoreBtn = screen.getByTestId('load-more-btn');
    expect(loadMoreBtn).toBeDefined();
    expect(screen.getByText('Xem thêm')).toBeDefined();

    fireEvent.click(loadMoreBtn);
    expect(handleLoadMore).toHaveBeenCalledTimes(1);
  });

  it('5. Trạng thái isLoadingMore = true -> Nút Xem thêm bị disable và hiện text Đang tải thêm...', () => {
    const handleLoadMore = vi.fn();

    render(
      <LeaderboardList
        entries={mockEntries}
        myUserId="user-me"
        hasMore={true}
        isLoadingMore={true}
        onLoadMore={handleLoadMore}
        isLoading={false}
      />,
    );

    const loadMoreBtn = screen.getByTestId('load-more-btn');
    expect(loadMoreBtn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Đang tải thêm...')).toBeDefined();

    fireEvent.click(loadMoreBtn);
    expect(handleLoadMore).not.toHaveBeenCalled();
  });
});
