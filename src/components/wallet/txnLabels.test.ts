import { describe, it, expect } from 'vitest';
import { getTxnDisplayInfo } from './txnLabels';

describe('Transaction Labels Mapping (txnLabels.ts - P4.5c)', () => {
  it('1. Ánh xạ đúng nhãn cho daily_bonus (Điểm danh hàng ngày)', () => {
    const info = getTxnDisplayInfo({ type: 'daily_bonus', amount: 20, refType: 'system' });
    expect(info.label).toBe('Điểm danh hàng ngày');
    expect(info.icon).toBe('🎁');
    expect(info.isCredit).toBe(true);
  });

  it('2. Ánh xạ đúng nhãn cho match_reward theo các mức amount', () => {
    // Thắng >= 50
    const winInfo = getTxnDisplayInfo({ type: 'match_reward', amount: 50, refType: 'match' });
    expect(winInfo.label).toBe('Thưởng thắng xếp hạng');
    expect(winInfo.icon).toBe('⚔️');
    expect(winInfo.isCredit).toBe(true);

    // Hòa == 20
    const drawInfo = getTxnDisplayInfo({ type: 'match_reward', amount: 20, refType: 'match' });
    expect(drawInfo.label).toBe('Thưởng hòa xếp hạng');

    // Thua / An ủi (ví dụ 5 xu hoặc 2 xu)
    const lossInfo = getTxnDisplayInfo({ type: 'match_reward', amount: 5, refType: 'match' });
    expect(lossInfo.label).toBe('Thưởng ván xếp hạng');
  });

  it('3. Ánh xạ đúng nhãn cho match_penalty (Phạt bỏ trận)', () => {
    const penaltyInfo = getTxnDisplayInfo({ type: 'match_penalty', amount: -20, refType: 'match' });
    expect(penaltyInfo.label).toBe('Phạt bỏ trận (Timeout/AFK)');
    expect(penaltyInfo.icon).toBe('⚠️');
    expect(penaltyInfo.isCredit).toBe(false);
  });

  it('4. Ánh xạ đúng nhãn cho purchase, admin_adjust, topup, refund', () => {
    const purchaseInfo = getTxnDisplayInfo({ type: 'purchase', amount: -100, refType: 'purchase' });
    expect(purchaseInfo.label).toBe('Mua vật phẩm');

    const adminCredit = getTxnDisplayInfo({ type: 'admin_adjust', amount: 100, refType: 'audit' });
    expect(adminCredit.label).toBe('Thưởng hệ thống');

    const adminDebit = getTxnDisplayInfo({ type: 'admin_adjust', amount: -50, refType: 'audit' });
    expect(adminDebit.label).toBe('Điều chỉnh hệ thống');

    const topupInfo = getTxnDisplayInfo({ type: 'topup', amount: 500, refType: 'order' });
    expect(topupInfo.label).toBe('Nạp xu');

    const refundInfo = getTxnDisplayInfo({ type: 'refund', amount: 50, refType: 'order' });
    expect(refundInfo.label).toBe('Hoàn trả xu');
  });
});
