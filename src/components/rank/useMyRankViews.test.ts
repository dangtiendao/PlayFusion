// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO HOOK USEMYRANKVIEWS (SRC/COMPONENTS/RANK/USEMYRANKVIEWS.TEST.TS)
 * ==============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMyRankViews } from './useMyRankViews';
import * as authStore from '@/stores/authStore';
import * as ratingRepo from '@/repositories/ratingRepository';
import type { PlayerRating } from '@/repositories/types';
import type { AppAuthUser } from '@/repositories/authRepository';

describe('useMyRankViews React Hook Tests', () => {
  const mockUser: AppAuthUser = {
    id: 'user-1',
    isAnonymous: false,
    provider: 'google',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Khi chưa đăng nhập (user = null): Trả về rankViews rỗng và isLoading = false', async () => {
    vi.spyOn(authStore, 'useAuthStore').mockReturnValue(null);

    const { result } = renderHook(() => useMyRankViews());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.rankViews).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('2. Khi đã đăng nhập: Tải điểm rating, lấy delta trận gần nhất và suy diễn đúng trạng thái có khiên bảo vệ', async () => {
    vi.spyOn(authStore, 'useAuthStore').mockReturnValue(mockUser);

    const mockRatings: PlayerRating[] = [
      {
        userId: 'user-1',
        gameId: 'caro',
        seasonId: 1,
        rating: 1189,
        gamesPlayed: 20,
        wins: 10,
        losses: 10,
        draws: 0,
        streak: 0,
        bestRating: 1216,
        placementDone: true,
        lastPlayedAt: '2026-08-26T12:00:00Z',
      },
    ];

    vi.spyOn(ratingRepo, 'getMyRatings').mockResolvedValue(mockRatings);
    vi.spyOn(ratingRepo, 'getMyLastRankedMatchDelta').mockResolvedValue({
      ratingBefore: 1205, // Vàng
      ratingAfter: 1189, // Bạc (vừa rớt ngưỡng)
    });

    const { result } = renderHook(() => useMyRankViews());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const caroRank = result.current.rankViews['caro'];
    expect(caroRank).toBeTruthy();
    expect(caroRank?.kind).toBe('ranked');
    if (caroRank?.kind === 'ranked') {
      expect(caroRank.tier.id).toBe('silver');
      expect(caroRank.displayTier.id).toBe('gold');
      expect(caroRank.shield).toBe(true); // Kích hoạt khiên bảo vệ
    }
  });

  it('3. Khi game ranked chưa từng thi đấu: rankView trả về null', async () => {
    vi.spyOn(authStore, 'useAuthStore').mockReturnValue(mockUser);
    vi.spyOn(ratingRepo, 'getMyRatings').mockResolvedValue([]);
    vi.spyOn(ratingRepo, 'getMyLastRankedMatchDelta').mockResolvedValue(null);

    const { result } = renderHook(() => useMyRankViews());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.rankViews['caro']).toBeNull();
  });

  it('4. Tự động gọi làm mới khi sự kiện visibilitychange kích hoạt', async () => {
    vi.spyOn(authStore, 'useAuthStore').mockReturnValue(mockUser);
    const getRatingsSpy = vi.spyOn(ratingRepo, 'getMyRatings').mockResolvedValue([]);
    vi.spyOn(ratingRepo, 'getMyLastRankedMatchDelta').mockResolvedValue(null);

    renderHook(() => useMyRankViews());

    await waitFor(() => {
      expect(getRatingsSpy).toHaveBeenCalledTimes(1);
    });

    // Giả lập tab trình duyệt chuyển sang active (visible)
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(getRatingsSpy).toHaveBeenCalledTimes(2);
    });
  });
});
