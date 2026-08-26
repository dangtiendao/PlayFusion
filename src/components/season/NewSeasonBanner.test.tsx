// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO NEWSEASONBANNER (SRC/COMPONENTS/SEASON/NEWSEASONBANNER.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NewSeasonBanner, LAST_SEEN_SEASON_KEY } from './NewSeasonBanner';
import type { Season } from '@/repositories/types';

describe('NewSeasonBanner Component Tests', () => {
  const season1: Season = {
    id: 1,
    name: 'Mùa 1 - Khởi Nguyên',
    startedAt: '2026-08-01T00:00:00Z',
    endedAt: null,
    isActive: true,
  };

  const season2: Season = {
    id: 2,
    name: 'Mùa 2 - Kỷ Nguyên Mới',
    startedAt: '2026-08-26T20:00:00Z',
    endedAt: null,
    isActive: true,
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Lần đầu vào app ở Mùa 1 -> Lưu storage và ẩn banner', () => {
    const { container } = render(<NewSeasonBanner activeSeason={season1} />);
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(LAST_SEEN_SEASON_KEY)).toBe('1');
  });

  it('2. Đã lưu Mùa 1, nay hệ thống mở Mùa 2 -> Render banner chào mừng', () => {
    localStorage.setItem(LAST_SEEN_SEASON_KEY, '1');

    render(<NewSeasonBanner activeSeason={season2} />);

    expect(screen.getByTestId('new-season-banner')).toBeInTheDocument();
    expect(screen.getByText('Mùa 2 - Kỷ Nguyên Mới đã chính thức khởi tranh!')).toBeInTheDocument();
    expect(screen.getByText(/Soft-Reset/)).toBeInTheDocument();
  });

  it('3. Nhấn nút "Đã hiểu" -> Cập nhật LocalStorage và ẩn banner', () => {
    localStorage.setItem(LAST_SEEN_SEASON_KEY, '1');

    render(<NewSeasonBanner activeSeason={season2} />);

    const dismissBtn = screen.getByTestId('dismiss-season-banner-btn');
    expect(dismissBtn).toBeInTheDocument();

    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId('new-season-banner')).not.toBeInTheDocument();
    expect(localStorage.getItem(LAST_SEEN_SEASON_KEY)).toBe('2');
  });

  it('4. Đã lưu Mùa 2 trong storage -> Không render banner', () => {
    localStorage.setItem(LAST_SEEN_SEASON_KEY, '2');

    const { container } = render(<NewSeasonBanner activeSeason={season2} />);
    expect(container).toBeEmptyDOMElement();
  });
});
