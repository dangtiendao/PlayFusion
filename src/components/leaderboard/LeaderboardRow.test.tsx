// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeaderboardRow } from './LeaderboardRow';
import type { LeaderboardEntry } from '../../repositories/types';

describe('LeaderboardRow Component Tests (LeaderboardRow.tsx - P4.4b)', () => {
  const baseEntry: LeaderboardEntry = {
    rank: 1,
    userId: 'user-top1',
    displayName: 'Nguyễn Văn A',
    avatarUrl: null,
    rating: 1650, // Kim Cương
    gamesPlayed: 30,
    wins: 25,
    losses: 5,
    bestRating: 1680,
  };

  it('1. Top 1 hiển thị huân chương vàng 🥇, avatar chữ cái đầu và RankBadge Kim Cương', () => {
    render(<LeaderboardRow entry={baseEntry} isMe={false} />);

    expect(screen.getByRole('img', { name: 'Hạng 1' })).toBeDefined();
    expect(screen.getByText('🥇')).toBeDefined();
    expect(screen.getByText('Nguyễn Văn A')).toBeDefined();
    expect(screen.getByText('N')).toBeDefined(); // Chữ cái đầu
    expect(screen.getByTestId('row-rating').textContent).toContain('1.650');
    expect(screen.getByText('30 trận • 25W/5L')).toBeDefined();
    expect(screen.getByText('Kim Cương')).toBeDefined();
    expect(screen.queryByTestId('is-me-badge')).toBeNull();
  });

  it('2. Top 2 và Top 3 hiển thị huân chương bạc 🥈 và đồng 🥉', () => {
    const { rerender } = render(
      <LeaderboardRow entry={{ ...baseEntry, rank: 2, userId: 'user-top2' }} isMe={false} />,
    );
    expect(screen.getByRole('img', { name: 'Hạng 2' })).toBeDefined();
    expect(screen.getByText('🥈')).toBeDefined();

    rerender(
      <LeaderboardRow entry={{ ...baseEntry, rank: 3, userId: 'user-top3' }} isMe={false} />,
    );
    expect(screen.getByRole('img', { name: 'Hạng 3' })).toBeDefined();
    expect(screen.getByText('🥉')).toBeDefined();
  });

  it('3. Rank >= 4 hiển thị số thứ tự dạng #4, #10', () => {
    render(<LeaderboardRow entry={{ ...baseEntry, rank: 4, userId: 'user-top4' }} isMe={false} />);
    expect(screen.getByText('#4')).toBeDefined();
  });

  it('4. isMe = true -> Hiển thị badge Bạn và viền/nền highlight', () => {
    render(<LeaderboardRow entry={{ ...baseEntry, rank: 5, userId: 'my-user-id' }} isMe={true} />);

    expect(screen.getByTestId('is-me-badge')).toBeDefined();
    expect(screen.getByText('Bạn')).toBeDefined();
  });

  it('5. Hiển thị ảnh avatar khi có avatarUrl', () => {
    render(
      <LeaderboardRow
        entry={{ ...baseEntry, avatarUrl: 'https://example.com/avatar.jpg' }}
        isMe={false}
      />,
    );

    const img = screen.getByRole('img', { name: 'Nguyễn Văn A' });
    expect(img.getAttribute('src')).toBe('https://example.com/avatar.jpg');
  });

  it('6. Kích hoạt callback onClick khi click vào dòng', () => {
    const handleClick = vi.fn();
    render(<LeaderboardRow entry={baseEntry} isMe={false} onClick={handleClick} />);

    fireEvent.click(screen.getByTestId('leaderboard-row-user-top1'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
