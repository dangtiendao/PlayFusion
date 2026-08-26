// @vitest-environment jsdom
/**
 * ==============================================================================
 * UNIT TESTS CHO RANKBADGE (SRC/COMPONENTS/RANK/RANKBADGE.TEST.TSX)
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RankBadge } from './RankBadge';
import { TIER_TABLE, type TierDef } from '@rating';

describe('RankBadge Component Tests', () => {
  const defaultTier: TierDef = { id: 'bronze', name: 'Đồng', minRating: 0, maxRating: 999 };
  const goldTier: TierDef = TIER_TABLE.find((t) => t.id === 'gold') ?? defaultTier;
  const masterTier: TierDef = TIER_TABLE.find((t) => t.id === 'master') ?? defaultTier;

  it('1. Render đúng tên bậc, icon và màu sắc cho bậc Vàng', () => {
    render(<RankBadge tier={goldTier} size="md" />);

    const badge = screen.getByTestId('rank-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-tier', 'gold');
    expect(screen.getByText('Vàng')).toBeInTheDocument();
    expect(screen.getByText('🟡')).toBeInTheDocument();
  });

  it('2. Render đúng cho bậc Cao Thủ (Master) kích thước lớn lg', () => {
    render(<RankBadge tier={masterTier} size="lg" />);

    const badge = screen.getByTestId('rank-badge');
    expect(badge).toHaveAttribute('data-tier', 'master');
    expect(screen.getByText('Cao Thủ')).toBeInTheDocument();
    expect(screen.getByText('👑')).toBeInTheDocument();
  });

  it('3. Khi shield=false: KHÔNG render icon khiên 🛡️', () => {
    render(<RankBadge tier={goldTier} shield={false} />);

    expect(screen.queryByTestId('rank-shield-icon')).not.toBeInTheDocument();
  });

  it('4. Khi shield=true: Render icon khiên 🛡️ kèm tooltip giải thích', () => {
    render(<RankBadge tier={goldTier} shield={true} />);

    const shieldIcon = screen.getByTestId('rank-shield-icon');
    expect(shieldIcon).toBeInTheDocument();
    expect(shieldIcon).toHaveAttribute('title', 'Đang được bảo vệ rớt hạng');
    expect(shieldIcon).toHaveAttribute('aria-label', 'Đang được bảo vệ rớt hạng');
  });
});
