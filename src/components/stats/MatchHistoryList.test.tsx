// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MatchSummary } from '@/repositories/types';
import { MatchHistoryList } from './MatchHistoryList';

describe('MatchHistoryList Generic Component Tests (MatchHistoryList.tsx - P2.6b)', () => {
  const mockGetGameName = vi.fn((gameId: string) => {
    if (gameId === 'game_alpha') return 'Trò Chơi Alpha';
    if (gameId === 'game_beta') return 'Trò Chơi Beta';
    return gameId;
  });

  it('1. Trạng thái Loading -> Render khung skeleton loading', () => {
    render(<MatchHistoryList matches={[]} getGameName={mockGetGameName} isLoading={true} />);

    expect(screen.getByTestId('match-history-skeleton')).not.toBeNull();
  });

  it('2. Trạng thái Empty -> Render thông điệp trống tùy chỉnh', () => {
    render(
      <MatchHistoryList
        matches={[]}
        getGameName={mockGetGameName}
        emptyText="Chưa có trận nào được ghi nhận."
      />,
    );

    expect(screen.getByTestId('match-history-empty')).not.toBeNull();
    expect(screen.getByText('Chưa có trận nào được ghi nhận.')).not.toBeNull();
  });

  it('3. Hiển thị chính xác kết quả Thắng (✓), Thua (✗), Hòa (=) theo myUserId', () => {
    const myId = 'user-me-123';
    const matches: MatchSummary[] = [
      {
        id: 'match-win',
        gameId: 'game_alpha',
        mode: 'vs_ai',
        isRanked: false,
        startedAt: '2026-08-19T10:00:00Z',
        endedAt: '2026-08-19T10:02:00Z',
        durationMs: 120000,
        endReason: 'normal',
        participants: [
          {
            seatIndex: 0,
            userId: myId,
            isBot: false,
            botLevel: null,
            result: 'win',
            placement: 1,
            score: null,
            ratingDelta: null,
          },
          {
            seatIndex: 1,
            userId: null,
            isBot: true,
            botLevel: 'hard',
            result: 'loss',
            placement: 2,
            score: null,
            ratingDelta: null,
          },
        ],
      },
      {
        id: 'match-loss',
        gameId: 'game_beta',
        mode: 'online_1v1',
        isRanked: true,
        startedAt: '2026-08-19T09:00:00Z',
        endedAt: '2026-08-19T09:05:00Z',
        durationMs: 300000,
        endReason: 'normal',
        participants: [
          {
            seatIndex: 0,
            userId: myId,
            isBot: false,
            botLevel: null,
            result: 'loss',
            placement: 2,
            score: null,
            ratingDelta: -15,
          },
          {
            seatIndex: 1,
            userId: 'user-opponent-456',
            isBot: false,
            botLevel: null,
            result: 'win',
            placement: 1,
            score: null,
            ratingDelta: 15,
          },
        ],
      },
      {
        id: 'match-draw',
        gameId: 'game_alpha',
        mode: 'vs_ai',
        isRanked: false,
        startedAt: '2026-08-19T08:00:00Z',
        endedAt: '2026-08-19T08:01:30Z',
        durationMs: 90000,
        endReason: 'normal',
        participants: [
          {
            seatIndex: 0,
            userId: myId,
            isBot: false,
            botLevel: null,
            result: 'draw',
            placement: null,
            score: null,
            ratingDelta: 0,
          },
        ],
      },
    ];

    render(<MatchHistoryList matches={matches} myUserId={myId} getGameName={mockGetGameName} />);

    // Kiểm tra tên game do resolver cung cấp
    expect(screen.getAllByText('Trò Chơi Alpha')).toHaveLength(2);
    expect(screen.getByText('Trò Chơi Beta')).not.toBeNull();

    // Kiểm tra Badge Thắng / Thua / Hòa
    const winBadge = screen.getByTestId('outcome-badge-match-win');
    expect(winBadge.textContent).toBe('✓');

    const lossBadge = screen.getByTestId('outcome-badge-match-loss');
    expect(lossBadge.textContent).toBe('✗');

    const drawBadge = screen.getByTestId('outcome-badge-match-draw');
    expect(drawBadge.textContent).toBe('=');

    // Kiểm tra định dạng thời lượng
    expect(screen.getByText('⏱️ 02:00')).not.toBeNull();
    expect(screen.getByText('⏱️ 05:00')).not.toBeNull();
    expect(screen.getByText('⏱️ 01:30')).not.toBeNull();
  });

  it('4. Quy tắc local_pvp: Luôn hiển thị icon trung tính (👥) bất kể kết quả', () => {
    const matches: MatchSummary[] = [
      {
        id: 'match-local',
        gameId: 'game_alpha',
        mode: 'local_pvp',
        isRanked: false,
        startedAt: '2026-08-19T10:00:00Z',
        endedAt: '2026-08-19T10:03:00Z',
        durationMs: 180000,
        endReason: 'normal',
        participants: [
          {
            seatIndex: 0,
            userId: 'user-me-123',
            isBot: false,
            botLevel: null,
            result: 'win',
            placement: 1,
            score: null,
            ratingDelta: null,
          },
        ],
      },
    ];

    render(
      <MatchHistoryList matches={matches} myUserId="user-me-123" getGameName={mockGetGameName} />,
    );

    const neutralBadge = screen.getByTestId('outcome-badge-match-local');
    expect(neutralBadge.textContent).toBe('👥');
    expect(screen.getByText('2 người 1 máy')).not.toBeNull();
  });
});
