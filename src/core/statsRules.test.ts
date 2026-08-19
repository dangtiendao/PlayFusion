import { describe, it, expect } from 'vitest';
import {
  MIN_MATCHES_FOR_WINRATE,
  computeWinrateView,
  aggregateVsAi,
  pickPrimaryModeStats,
} from './statsRules';
import type { ModeStats } from '../repositories/types';

describe('Stats Business Rules Unit Tests (statsRules.ts - P2.6a)', () => {
  describe('MIN_MATCHES_FOR_WINRATE constant', () => {
    it('1. Ngưỡng số trận tối thiểu để mở khóa winrate được chốt là 10', () => {
      expect(MIN_MATCHES_FOR_WINRATE).toBe(10);
    });
  });

  describe('computeWinrateView', () => {
    it('2. Dưới 10 trận (9 trận) -> Ẩn và báo cần thêm 1 trận để mở khóa', () => {
      const stats: ModeStats = { matches: 9, wins: 5, losses: 3, draws: 1 };
      const result = computeWinrateView(stats);

      expect(result).toEqual({
        kind: 'hidden',
        needMore: 1,
      });
    });

    it('3. 0 trận đấu -> Ẩn và báo cần thêm 10 trận', () => {
      const stats: ModeStats = { matches: 0, wins: 0, losses: 0, draws: 0 };
      const result = computeWinrateView(stats);

      expect(result).toEqual({
        kind: 'hidden',
        needMore: 10,
      });
    });

    it('4. Đạt 10 trận (6W, 3L, 1D) -> Hiển thị 66.7% (Hòa bị loại khỏi mẫu số)', () => {
      const stats: ModeStats = { matches: 10, wins: 6, losses: 3, draws: 1 };
      const result = computeWinrateView(stats);

      expect(result).toEqual({
        kind: 'visible',
        winratePct: 66.7,
      });
    });

    it('5. Đạt 10 trận nhưng toàn hòa (0W, 0L, 10D) -> Ẩn do không có trận quyết định', () => {
      const stats: ModeStats = { matches: 10, wins: 0, losses: 0, draws: 10 };
      const result = computeWinrateView(stats);

      expect(result).toEqual({
        kind: 'hidden',
        needMore: 10,
      });
    });

    it('6. 20 trận (15W, 5L, 0D) -> Hiển thị 75.0%', () => {
      const stats: ModeStats = { matches: 20, wins: 15, losses: 5, draws: 0 };
      const result = computeWinrateView(stats);

      expect(result).toEqual({
        kind: 'visible',
        winratePct: 75,
      });
    });

    it('7. 10 trận toàn thua (0W, 10L, 0D) -> Hiển thị 0%', () => {
      const stats: ModeStats = { matches: 10, wins: 0, losses: 10, draws: 0 };
      const result = computeWinrateView(stats);

      expect(result).toEqual({
        kind: 'visible',
        winratePct: 0,
      });
    });
  });

  describe('aggregateVsAi', () => {
    it('8. Gộp chính xác 3 cấp độ đấu máy thành 1 overall và giữ chi tiết byLevel', () => {
      const byModeKey: Record<string, ModeStats> = {
        'vs_ai:easy': { matches: 3, wins: 2, losses: 1, draws: 0 },
        'vs_ai:medium': { matches: 6, wins: 3, losses: 2, draws: 1 },
        'vs_ai:hard': { matches: 5, wins: 1, losses: 4, draws: 0 },
        local_pvp: { matches: 8, wins: 0, losses: 0, draws: 2 },
      };

      const result = aggregateVsAi(byModeKey);

      expect(result.overall).toEqual({
        matches: 14,
        wins: 6,
        losses: 7,
        draws: 1,
      });

      expect(result.byLevel['easy']).toEqual({ matches: 3, wins: 2, losses: 1, draws: 0 });
      expect(result.byLevel['medium']).toEqual({ matches: 6, wins: 3, losses: 2, draws: 1 });
      expect(result.byLevel['hard']).toEqual({ matches: 5, wins: 1, losses: 4, draws: 0 });
      expect(result.byLevel['local_pvp']).toBeUndefined();
    });

    it('9. Không có trận vs_ai nào -> Trả về overall rỗng và byLevel rỗng', () => {
      const byModeKey: Record<string, ModeStats> = {
        local_pvp: { matches: 5, wins: 0, losses: 0, draws: 1 },
      };

      const result = aggregateVsAi(byModeKey);

      expect(result.overall).toEqual({
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      });
      expect(result.byLevel).toEqual({});
    });
  });

  describe('pickPrimaryModeStats', () => {
    it('10. Ưu tiên hàng đầu: Chọn online_1v1 khi có trận đấu', () => {
      const byModeKey: Record<string, ModeStats> = {
        online_1v1: { matches: 5, wins: 4, losses: 1, draws: 0 },
        'vs_ai:hard': { matches: 20, wins: 12, losses: 8, draws: 0 },
        local_pvp: { matches: 15, wins: 0, losses: 0, draws: 3 },
      };

      const result = pickPrimaryModeStats(byModeKey);

      expect(result).toEqual({
        modeKey: 'online_1v1',
        stats: { matches: 5, wins: 4, losses: 1, draws: 0 },
      });
    });

    it('11. Ưu tiên thứ hai: Chọn vs_ai:all (gộp các level) khi chưa có online_1v1', () => {
      const byModeKey: Record<string, ModeStats> = {
        'vs_ai:easy': { matches: 4, wins: 3, losses: 1, draws: 0 },
        'vs_ai:hard': { matches: 6, wins: 2, losses: 3, draws: 1 },
        local_pvp: { matches: 10, wins: 0, losses: 0, draws: 1 },
      };

      const result = pickPrimaryModeStats(byModeKey);

      expect(result).toEqual({
        modeKey: 'vs_ai:all',
        stats: { matches: 10, wins: 5, losses: 4, draws: 1 },
      });
    });

    it('12. Chỉ có local_pvp -> Trả về null (Local PvP không bao giờ là primary stats)', () => {
      const byModeKey: Record<string, ModeStats> = {
        local_pvp: { matches: 25, wins: 0, losses: 0, draws: 4 },
      };

      const result = pickPrimaryModeStats(byModeKey);

      expect(result).toBeNull();
    });

    it('13. byModeKey rỗng -> Trả về null', () => {
      const result = pickPrimaryModeStats({});
      expect(result).toBeNull();
    });
  });
});
