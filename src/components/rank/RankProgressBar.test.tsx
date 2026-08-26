// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO RANKPROGRESSBAR (SRC/COMPONENTS/RANK/RANKPROGRESSBAR.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RankProgressBar } from './RankProgressBar';
import { getTierProgress } from '@rating';

describe('RankProgressBar Component Tests', () => {
  it('1. Render chính xác ở giữa bậc (1250 điểm Vàng -> 25.0%)', () => {
    const progress = getTierProgress(1250);
    render(<RankProgressBar progress={progress} />);

    const fill = screen.getByTestId('rank-progress-fill');
    expect(fill).toHaveStyle({ width: '25%' });

    const text = screen.getByTestId('rank-progress-text');
    expect(text).toHaveTextContent('1250 / 1400');
    expect(text).toHaveTextContent('còn 150 điểm tới Bạch Kim 🔵');
  });

  it('2. Render chính xác ở đầu bậc (1000 điểm Bạc -> 0.0%)', () => {
    const progress = getTierProgress(1000);
    render(<RankProgressBar progress={progress} />);

    const fill = screen.getByTestId('rank-progress-fill');
    expect(fill).toHaveStyle({ width: '0%' });

    const text = screen.getByTestId('rank-progress-text');
    expect(text).toHaveTextContent('1000 / 1200');
    expect(text).toHaveTextContent('còn 200 điểm tới Vàng 🟡');
  });

  it('3. Render chính xác cho bậc Cao Thủ (1800+ điểm -> 100.0%)', () => {
    const progress = getTierProgress(1850);
    render(<RankProgressBar progress={progress} />);

    const fill = screen.getByTestId('rank-progress-fill');
    expect(fill).toHaveStyle({ width: '100%' });

    const text = screen.getByTestId('rank-progress-text');
    expect(text).toHaveTextContent('1850 điểm');
    expect(text).toHaveTextContent('👑 Bậc cao nhất!');
  });
});
