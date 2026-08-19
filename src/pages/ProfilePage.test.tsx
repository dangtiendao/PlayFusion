// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import { useAuthStore, _resetAuthStoreForTesting } from '../stores/authStore';
import * as statsRepoModule from '../repositories/statsRepository';
import * as matchRepoModule from '../repositories/matchRepository';
import * as gameLocalDataModule from '../core/gameLocalData';
import * as syncOutboxModule from '../core/syncOutbox';
import { getAllGames } from '@/games/registry';

describe('ProfilePage Component & Stats Integration Tests (ProfilePage.tsx - P2.6c)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetAuthStoreForTesting();

    // Default guest user
    useAuthStore.setState({
      user: {
        id: 'anon-user-1234-abcd',
        isAnonymous: true,
        provider: 'anonymous',
      },
      profile: {
        id: 'anon-user-1234-abcd',
        userId: 'anon-user-1234-abcd',
        displayName: 'Khách-123456',
        avatarUrl: null,
        role: 'player',
        isAnonymous: true,
        createdAt: '2026-08-18T10:00:00.000Z',
        updatedAt: '2026-08-18T10:00:00.000Z',
      },
      status: 'authenticated',
      isInitialized: true,
      error: null,
    });

    // Default mocks for repositories
    vi.spyOn(statsRepoModule, 'getMyGameStats').mockResolvedValue([]);
    vi.spyOn(matchRepoModule, 'getMyRecentMatches').mockResolvedValue([]);
    vi.spyOn(syncOutboxModule, 'useSyncOutboxCount').mockReturnValue(0);
  });

  const renderProfilePage = async () => {
    let result: ReturnType<typeof render> | undefined;
    await act(async () => {
      result = render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );
    });
    if (!result) throw new Error('Render failed');
    return result;
  };

  it('1. Render đầy đủ thông tin tài khoản khách: tên hiển thị, nhãn Khách, ID rút gọn', async () => {
    await renderProfilePage();

    expect(screen.getByTestId('profile-card')).not.toBeNull();
    expect(screen.getByTestId('profile-display-name').textContent).toBe('Khách-123456');
    expect(screen.getByTestId('profile-status-badge').textContent).toBe('Khách (Ẩn danh)');
    expect(screen.getByText(/ID: anon-use\.\.\.abcd/i)).not.toBeNull();
  });

  it('2. Hiển thị banner nâng cấp Google khi đang ở tài khoản khách & bấm liên kết', async () => {
    const linkSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ linkGoogle: linkSpy });

    await renderProfilePage();

    expect(screen.getByTestId('google-upgrade-banner')).not.toBeNull();
    const btn = screen.getByTestId('google-signin-btn');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(linkSpy).toHaveBeenCalled();
  });

  it('3. Hiển thị thông tin tài khoản Google khi đã đăng nhập chính thức (ẩn banner nâng cấp)', async () => {
    useAuthStore.setState({
      user: {
        id: 'google-user-9999-wxyz',
        isAnonymous: false,
        email: 'player@gmail.com',
        displayName: 'VuaChơiGame',
        avatarUrl: 'https://example.com/avatar.png',
        provider: 'google',
      },
      profile: {
        id: 'google-user-9999-wxyz',
        userId: 'google-user-9999-wxyz',
        displayName: 'VuaChơiGame',
        avatarUrl: 'https://example.com/avatar.png',
        role: 'player',
        isAnonymous: false,
        createdAt: '2026-08-18T10:00:00.000Z',
        updatedAt: '2026-08-18T10:00:00.000Z',
      },
      status: 'authenticated',
      isInitialized: true,
    });

    await renderProfilePage();

    expect(screen.queryByTestId('google-upgrade-banner')).toBeNull();
    expect(screen.getByText(/Đã liên kết với Google:/i)).not.toBeNull();
    expect(screen.getByText('player@gmail.com')).not.toBeNull();
    expect(screen.getByTestId('profile-sign-out-btn')).not.toBeNull();
  });

  it('4. Đổi tên hiển thị: validation và kích hoạt updateDisplayName', async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ updateDisplayName: updateSpy });

    await renderProfilePage();

    const input = screen.getByTestId('display-name-input');
    const saveBtn = screen.getByTestId('save-name-btn');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'ChiếnBinhX' } });
    });

    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(updateSpy).toHaveBeenCalledWith('ChiếnBinhX');
  });

  it('5. Đăng xuất: mở modal xác nhận và gọi signOut', async () => {
    useAuthStore.setState({
      user: {
        id: 'google-user-9999-wxyz',
        isAnonymous: false,
        provider: 'google',
      },
    });

    const signOutSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ signOut: signOutSpy });

    await renderProfilePage();

    const signOutBtn = screen.getByTestId('profile-sign-out-btn');
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    const confirmBtns = screen.getAllByRole('button', { name: /^Đăng xuất$/i });
    const targetConfirmBtn = confirmBtns[confirmBtns.length - 1];
    expect(targetConfirmBtn).toBeDefined();
    if (!targetConfirmBtn) return;

    await act(async () => {
      fireEvent.click(targetConfirmBtn);
    });

    expect(signOutSpy).toHaveBeenCalled();
  });

  it('6. BẰNG CHỨNG DoD GỐC: Render đầy đủ thẻ GameStatCard cho mọi game trong Registry', async () => {
    await renderProfilePage();

    const allGames = getAllGames();
    expect(allGames.length).toBeGreaterThan(0);

    for (const game of allGames) {
      expect(screen.getByTestId(`game-stat-card-${game.definition.id}`)).not.toBeNull();
    }
  });

  it('7. Tải dữ liệu Cloud: Hiển thị StatsSummary và MatchHistoryList', async () => {
    const mockAllStats = [
      {
        gameId: 'caro',
        totalMatches: 25,
        byModeKey: {
          'vs_ai:hard': { matches: 25, wins: 15, losses: 10, draws: 0 },
        },
      },
    ];

    const mockMatches = [
      {
        id: 'match-1',
        gameId: 'caro',
        mode: 'vs_ai',
        isRanked: false,
        startedAt: '2026-08-19T10:00:00Z',
        endedAt: '2026-08-19T10:02:00Z',
        durationMs: 120000,
        endReason: 'normal',
        participants: [
          {
            seatIndex: 0,
            userId: 'anon-user-1234-abcd',
            isBot: false,
            botLevel: null,
            result: 'win' as const,
            placement: 1,
            score: null,
            ratingDelta: null,
          },
        ],
      },
    ];

    vi.spyOn(statsRepoModule, 'getMyGameStats').mockResolvedValue(mockAllStats);
    vi.spyOn(matchRepoModule, 'getMyRecentMatches').mockResolvedValue(mockMatches);

    await renderProfilePage();

    expect(screen.getByTestId('stats-summary-card')).not.toBeNull();
    expect(screen.getByTestId('summary-total-matches').textContent).toBe('25');
    expect(screen.getByTestId('summary-ai-wins').textContent).toBe('15');
    expect(screen.getByTestId('match-row-match-1')).not.toBeNull();
  });

  it('8. Lỗi mạng Cloud: Hiển thị banner cảnh báo và VẪN hiển thị mục thành tích local (Offline-first)', async () => {
    vi.spyOn(statsRepoModule, 'getMyGameStats').mockRejectedValue(new Error('Network error'));
    vi.spyOn(matchRepoModule, 'getMyRecentMatches').mockRejectedValue(new Error('Network error'));

    vi.spyOn(gameLocalDataModule, 'hasGameData').mockReturnValue(true);
    vi.spyOn(gameLocalDataModule, 'getStats').mockReturnValue({
      totalMatches: 10,
      wins: 7,
      losses: 3,
      draws: 0,
      byMode: {},
      currentStreak: 2,
      bestStreak: 4,
      updatedAt: '2026-08-19T10:00:00.000Z',
    });

    await renderProfilePage();

    expect(screen.getByTestId('cloud-error-banner')).not.toBeNull();

    // Mở mục Thành tích trên máy này
    const toggleBtn = screen.getByTestId('toggle-local-stats-btn');
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(screen.getByTestId('stats-card-caro')).not.toBeNull();
    expect(screen.getAllByText('10 ván').length).toBeGreaterThan(0);
  });

  it('9. Hiển thị badge chỉ báo đồng bộ khi có item trong hàng đợi Outbox', async () => {
    vi.spyOn(syncOutboxModule, 'useSyncOutboxCount').mockReturnValue(3);

    await renderProfilePage();

    expect(screen.getByTestId('sync-pending-badge')).not.toBeNull();
    expect(screen.getByText('Chờ đồng bộ: 3 trận')).not.toBeNull();
  });
});
