// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CorrespondenceDeadline } from './CorrespondenceDeadline';
import { formatCorrespondenceRemaining } from '@/core/serverClock';

describe('CorrespondenceDeadline Component Unit Tests (P3.6c)', () => {
  it('1. formatCorrespondenceRemaining: Format đúng 3 mức độ (giờ, phút, đếm giây) và quá hạn', () => {
    // Mức 1: >= 1h (ví dụ 23h 45m)
    const normal = formatCorrespondenceRemaining((23 * 3600 + 45 * 60) * 1000);
    expect(normal.level).toBe('normal');
    expect(normal.text).toBe('Còn 23 giờ 45 phút');

    // Mức 2: < 1h (ví dụ 45 phút)
    const warning = formatCorrespondenceRemaining(45 * 60 * 1000);
    expect(warning.level).toBe('warning');
    expect(warning.text).toBe('Còn 45 phút');

    // Mức 3: < 10 phút (ví dụ 9m 45s = 585s)
    const danger = formatCorrespondenceRemaining(585 * 1000);
    expect(danger.level).toBe('danger');
    expect(danger.text).toBe('09:45');

    // Quá hạn: <= 0
    const expired = formatCorrespondenceRemaining(0);
    expect(expired.level).toBe('expired');
    expect(expired.text).toBe('Đã quá hạn!');
  });

  it('2. Render đúng banner khi là lượt của mình (isMyTurn = true)', () => {
    const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    render(
      <CorrespondenceDeadline
        turnDeadline={deadline}
        clockOffset={0}
        isMyTurn={true}
        isGameOver={false}
        opponentName="Đối thủ A"
      />,
    );

    expect(screen.getByTestId('correspondence-deadline-banner')).toBeDefined();
    expect(screen.getByText('Lượt của bạn')).toBeDefined();
    expect(screen.getByText(/Còn 23 giờ/)).toBeDefined();
  });

  it('3. Render đúng banner khi là lượt của đối thủ (isMyTurn = false)', () => {
    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    render(
      <CorrespondenceDeadline
        turnDeadline={deadline}
        clockOffset={0}
        isMyTurn={false}
        isGameOver={false}
        opponentName="Đối thủ B"
      />,
    );

    expect(screen.getByText('Chờ Đối thủ B')).toBeDefined();
    expect(screen.getByText(/Còn 30 phút/)).toBeDefined();
  });

  it('4. Ẩn hoàn toàn khi ván đấu đã kết thúc (isGameOver = true)', () => {
    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { container } = render(
      <CorrespondenceDeadline
        turnDeadline={deadline}
        clockOffset={0}
        isMyTurn={false}
        isGameOver={true}
        opponentName="Đối thủ B"
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
