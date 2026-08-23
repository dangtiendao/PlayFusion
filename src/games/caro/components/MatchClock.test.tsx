// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatchClock } from './MatchClock';

describe('Caro MatchClock Component Tests (MatchClock.tsx - P3.4c)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Render chính xác tên và thời gian của cả 2 đấu thủ', () => {
    const baseNow = new Date('2026-08-23T12:00:00.000Z').getTime();
    vi.setSystemTime(baseNow);

    const deadline = new Date(baseNow + 300000).toISOString();

    render(
      <MatchClock
        clock={{ '0': 300000, '1': 300000 }}
        turnDeadline={deadline}
        currentSeat={0}
        mySeat={0}
        opponentName="Đại Ca Cờ"
        clockOffset={0}
      />,
    );

    expect(screen.getByTestId('my-clock-box')).toBeDefined();
    expect(screen.getByTestId('opponent-clock-box')).toBeDefined();
    expect(screen.getByText('Đại Ca Cờ (O)')).toBeDefined();
    expect(screen.getByTestId('my-clock-time').textContent).toBe('05:00');
    expect(screen.getByTestId('opponent-clock-time').textContent).toBe('05:00');
  });

  it('2. Đồng hồ của người đang tới lượt đếm ngược mỗi 500ms, bên kia đứng yên', () => {
    const baseNow = new Date('2026-08-23T12:00:00.000Z').getTime();
    vi.setSystemTime(baseNow);

    const deadline = new Date(baseNow + 300000).toISOString();

    render(
      <MatchClock
        clock={{ '0': 300000, '1': 300000 }}
        turnDeadline={deadline}
        currentSeat={0}
        mySeat={0}
        opponentName="Đại Ca Cờ"
        clockOffset={0}
      />,
    );

    // Trôi 2 giây
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId('my-clock-time').textContent).toBe('04:58');
    expect(screen.getByTestId('opponent-clock-time').textContent).toBe('05:00');
  });

  it('3. Khi thời gian < 30 giây: hiển thị trạng thái cảnh báo nguy hiểm', () => {
    const baseNow = new Date('2026-08-23T12:00:00.000Z').getTime();
    vi.setSystemTime(baseNow);

    // Còn 20 giây
    const deadline = new Date(baseNow + 20000).toISOString();

    render(
      <MatchClock
        clock={{ '0': 20000, '1': 300000 }}
        turnDeadline={deadline}
        currentSeat={0}
        mySeat={0}
        opponentName="Đại Ca Cờ"
        clockOffset={0}
      />,
    );

    expect(screen.getByTestId('my-clock-time').textContent).toBe('00:20');
    expect(screen.getByTestId('my-clock-box').className).toContain('border-red-500');
  });

  it('4. Khi thời gian < 10 giây trong lượt của mình: gọi callback onHapticTick định kỳ mỗi 2s', () => {
    const baseNow = new Date('2026-08-23T12:00:00.000Z').getTime();
    vi.setSystemTime(baseNow);

    // Còn 8 giây
    const deadline = new Date(baseNow + 8000).toISOString();
    const mockHaptic = vi.fn();

    render(
      <MatchClock
        clock={{ '0': 8000, '1': 300000 }}
        turnDeadline={deadline}
        currentSeat={0}
        mySeat={0}
        opponentName="Đại Ca Cờ"
        clockOffset={0}
        onHapticTick={mockHaptic}
      />,
    );

    expect(mockHaptic).toHaveBeenCalledTimes(1);

    // Trôi thêm 2 giây
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockHaptic).toHaveBeenCalledTimes(2);
  });
});
