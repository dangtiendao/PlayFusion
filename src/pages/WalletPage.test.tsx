// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { WalletPage } from './WalletPage';
import { walletRepository } from '@/repositories/walletRepository';
import { audioManager } from '@/core/audio';

vi.mock('@/repositories/walletRepository', () => ({
  walletRepository: {
    getMyBalance: vi.fn(),
    getDailyBonusStatus: vi.fn(),
    getRewardConfigs: vi.fn(),
    getMyTransactions: vi.fn(),
    claimDailyBonus: vi.fn(),
    invalidateWalletCache: vi.fn(),
  },
}));

vi.mock('@/core/audio', () => ({
  audioManager: {
    playSfx: vi.fn(),
  },
}));

vi.mock('@/core/haptics', () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
}));

describe('WalletPage Component Tests (WalletPage.tsx - P4.5c)', () => {
  const mockConfigs = {
    winRanked: 50,
    lossRanked: 5,
    drawRanked: 20,
    dailyCap: 500,
    dailyLogin: 20,
    abandonPenalty: -20,
  };

  const mockTxns = [
    {
      id: 'txn-1',
      userId: 'u1',
      amount: 50,
      balanceAfter: 500,
      type: 'match_reward' as const,
      refType: 'match',
      refId: 'm-1',
      idempotencyKey: 'settle:m-1:u1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'txn-2',
      userId: 'u1',
      amount: -20,
      balanceAfter: 450,
      type: 'match_penalty' as const,
      refType: 'match',
      refId: 'm-2',
      idempotencyKey: 'settle:m-2:u1',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(walletRepository.getMyBalance).mockResolvedValue(500);
    vi.mocked(walletRepository.getDailyBonusStatus).mockResolvedValue(false);
    vi.mocked(walletRepository.getRewardConfigs).mockResolvedValue(mockConfigs);
    vi.mocked(walletRepository.getMyTransactions).mockResolvedValue({
      entries: mockTxns,
      nextCursor: null,
      hasMore: false,
    });
  });

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <WalletPage />
      </BrowserRouter>,
    );

  it('1. Render đầy đủ 4 khối: Hero số dư, Điểm danh, Quy tắc thưởng, Lịch sử giao dịch', async () => {
    renderComponent();

    expect(screen.getByTestId('wallet-page')).toBeDefined();

    await waitFor(() => {
      // Khối 1: Hero số dư
      expect(screen.getByTestId('wallet-hero-card')).toBeDefined();
      expect(screen.getByTestId('wallet-balance-amount').textContent).toContain('500');

      // Khối 2: Điểm danh
      expect(screen.getByTestId('daily-bonus-card')).toBeDefined();

      // Khối 3: Bảng quy tắc thưởng
      expect(screen.getByTestId('reward-rules-card')).toBeDefined();

      // Khối 4: Lịch sử giao dịch
      expect(screen.getByTestId('wallet-history-list')).toBeDefined();
      expect(screen.getByText('Thưởng thắng xếp hạng')).toBeDefined();
      expect(screen.getByText('Phạt bỏ trận (Timeout/AFK)')).toBeDefined();
    });
  });

  it('2. Điểm danh 1 chạm: Bấm nút -> Nhận thưởng +20 xu và chuyển trạng thái "Đã điểm danh"', async () => {
    vi.mocked(walletRepository.claimDailyBonus).mockResolvedValue({
      claimed: true,
      coins: 20,
      balance: 520,
    });

    renderComponent();

    const claimBtn = await screen.findByTestId('daily-bonus-claim-btn');
    expect(claimBtn).toBeDefined();

    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(walletRepository.claimDailyBonus).toHaveBeenCalledTimes(1);
      expect(audioManager.playSfx).toHaveBeenCalledWith('success');
      expect(screen.getByTestId('daily-bonus-claimed-btn')).toBeDefined();
      expect(screen.getByTestId('wallet-balance-amount').textContent).toContain('520');
    });
  });

  it('3. Khi đã điểm danh trước đó -> Hiển thị nút disabled "Đã điểm danh hôm nay"', async () => {
    vi.mocked(walletRepository.getDailyBonusStatus).mockResolvedValue(true);

    renderComponent();

    await waitFor(() => {
      const claimedBtn = screen.getByTestId('daily-bonus-claimed-btn');
      expect(claimedBtn).toBeDefined();
      expect((claimedBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('4. Bật mở bảng quy tắc thưởng -> Hiển thị số liệu động từ config', async () => {
    renderComponent();

    const toggleBtn = await screen.findByTestId('reward-rules-toggle-btn');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      const content = screen.getByTestId('reward-rules-content');
      expect(content).toBeDefined();
      expect(content.textContent).toContain('50');
      expect(content.textContent).toContain('500');
      expect(content.textContent).toContain('-20');
    });
  });

  it('5. [Offline-First] Khi lỗi mạng -> Hiển thị thông báo lỗi và nút Thử lại', async () => {
    vi.mocked(walletRepository.getMyBalance).mockRejectedValue(new Error('Mất kết nối máy chủ'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByTestId('wallet-error-banner')).toBeDefined();
      expect(screen.getByTestId('wallet-retry-btn')).toBeDefined();
    });
  });
});
