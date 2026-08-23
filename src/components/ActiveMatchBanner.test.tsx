// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActiveMatchBanner } from './ActiveMatchBanner';
import { matchRepository } from '@/repositories/matchRepository';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/repositories/matchRepository', () => ({
  matchRepository: {
    getMyActiveMatch: vi.fn(),
  },
}));

describe('ActiveMatchBanner Component Tests (P3.5b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Render banner khi có trận đấu đang diễn ra và click navigate đúng route', async () => {
    vi.mocked(matchRepository.getMyActiveMatch).mockResolvedValueOnce({
      matchId: 'm-live-123',
      gameId: 'caro',
    });

    render(
      <MemoryRouter>
        <ActiveMatchBanner />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-match-banner')).toBeDefined();
      expect(screen.getByText('Bạn đang có trận đấu dở dang!')).toBeDefined();
    });

    const returnBtn = screen.getByRole('button', { name: /Quay lại ngay/i });
    fireEvent.click(returnBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/game/caro/online/m-live-123');
  });

  it('2. Không render (trả về null) khi không có trận đấu nào đang sống', async () => {
    vi.mocked(matchRepository.getMyActiveMatch).mockResolvedValueOnce(null);

    render(
      <MemoryRouter>
        <ActiveMatchBanner />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('active-match-banner')).toBeNull();
    });
  });

  it('3. Tự động kiểm tra lại khi sự kiện visibilitychange chuyển sang visible', async () => {
    vi.mocked(matchRepository.getMyActiveMatch).mockResolvedValueOnce(null);

    render(
      <MemoryRouter>
        <ActiveMatchBanner />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('active-match-banner')).toBeNull();
    });

    // Giả lập sau đó có ván mới và user quay lại tab
    vi.mocked(matchRepository.getMyActiveMatch).mockResolvedValueOnce({
      matchId: 'm-live-456',
      gameId: 'caro',
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-match-banner')).toBeDefined();
    });
  });
});
