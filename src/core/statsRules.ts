/**
 * ==============================================================================
 * STATS RULES (LOGIC THUẦN QUY TẮC HIỂN THỊ THỐNG KÊ NGƯỜI CHƠI)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. LOGIC THUẦN (PURE BUSINESS LOGIC):
 *    - Toàn bộ các hàm trong file này là pure function, KHÔNG phụ thuộc React,
 *      KHÔNG gọi DB, KHÔNG gọi Web API.
 *    - Dễ dàng unit test độc lập và tái sử dụng nhất quán giữa các View/Components.
 * 2. CÁC QUY TẮC NGHIỆP VỤ ĐÃ CHỐT:
 *    - (a) Ngưỡng mở khóa Winrate: Ẩn khi chưa đủ 10 trận (`MIN_MATCHES_FOR_WINRATE = 10`),
 *          hiển thị "Cần thêm N trận để mở khóa".
 *    - (b) Công thức Winrate: `wins / (wins + losses)` (HÒA KHÔNG tính vào mẫu số vì
 *          hòa không phải thất bại). Nếu toàn hòa (wins + losses = 0) -> Ẩn.
 *    - (c) Phân cấp nhóm thống kê chính (`pickPrimaryModeStats`):
 *          Ưu tiên 'online_1v1' (khi có) -> Gộp 'vs_ai:*' (3 level) -> null
 *          (Local PvP không bao giờ là thống kê chính).
 * ==============================================================================
 */

import type { ModeStats } from '../repositories/types';

/**
 * Ngưỡng số trận tối thiểu để mở khóa hiển thị Tỷ Lệ Thắng (Winrate).
 * Tránh việc tỷ lệ thắng bị méo mó/ảo do cỡ mẫu quá nhỏ (ví dụ mới thắng 1/1 ván -> 100%).
 */
export const MIN_MATCHES_FOR_WINRATE = 10;

/**
 * Kết quả tính toán hiển thị tỷ lệ thắng.
 */
export type WinrateViewResult =
  | {
      readonly kind: 'hidden';
      /** Số trận quyết định (thắng/thua) cần thi đấu thêm để mở khóa */
      readonly needMore: number;
    }
  | {
      readonly kind: 'visible';
      /** Tỷ lệ thắng tính theo phần trăm (0 - 100%), đã làm tròn 1 chữ số thập phân */
      readonly winratePct: number;
    };

/**
 * Tính toán trạng thái hiển thị tỷ lệ thắng dựa trên số liệu ModeStats.
 *
 * QUY ƯỚC NGHIỆP VỤ:
 * 1. Nếu tổng số trận < 10: Trả về `hidden` kèm `needMore = 10 - matches`.
 * 2. Mẫu số tính winrate là `(wins + losses)`. Kết quả hòa KHÔNG tính vào mẫu số.
 * 3. Nếu tổng số trận >= 10 nhưng toàn hòa (wins + losses = 0): Trả về `hidden` kèm `needMore = 10`.
 *
 * @param stats Số liệu thống kê của chế độ chơi cần tính.
 * @returns Trạng thái hiển thị Winrate (ẩn hoặc hiện kèm số %).
 */
export function computeWinrateView(stats: ModeStats): WinrateViewResult {
  if (stats.matches < MIN_MATCHES_FOR_WINRATE) {
    return {
      kind: 'hidden',
      needMore: MIN_MATCHES_FOR_WINRATE - stats.matches,
    };
  }

  const decisiveMatches = stats.wins + stats.losses;
  if (decisiveMatches === 0) {
    return {
      kind: 'hidden',
      needMore: MIN_MATCHES_FOR_WINRATE,
    };
  }

  const rawPct = (stats.wins / decisiveMatches) * 100;
  const winratePct = Math.round(rawPct * 10) / 10;

  return {
    kind: 'visible',
    winratePct,
  };
}

/**
 * Kết quả gộp thống kê chế độ Đấu Máy (VS AI).
 */
export interface VsAiAggregatedResult {
  /** Tổng hợp toàn bộ các cấp độ đấu máy */
  readonly overall: ModeStats;
  /** Phân rã chi tiết theo từng cấp độ ('easy', 'medium', 'hard') */
  readonly byLevel: Record<string, ModeStats>;
}

/**
 * Gom nhóm tất cả các thống kê Đấu Máy (các key bắt đầu bằng 'vs_ai') thành một khối duy nhất.
 *
 * @param byModeKey Bảng thống kê phân rã theo modeKey của game.
 * @returns Đối tượng chứa thống kê tổng hợp `overall` và chi tiết `byLevel`.
 */
export function aggregateVsAi(byModeKey: Record<string, ModeStats>): VsAiAggregatedResult {
  let totalMatches = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalDraws = 0;

  const byLevel: Record<string, ModeStats> = {};

  for (const [key, stats] of Object.entries(byModeKey)) {
    if (key === 'vs_ai' || key.startsWith('vs_ai:')) {
      totalMatches += stats.matches;
      totalWins += stats.wins;
      totalLosses += stats.losses;
      totalDraws += stats.draws;

      const levelName = key.includes(':') ? key.split(':')[1] || key : 'normal';
      byLevel[levelName] = {
        matches: stats.matches,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
      };
    }
  }

  return {
    overall: {
      matches: totalMatches,
      wins: totalWins,
      losses: totalLosses,
      draws: totalDraws,
    },
    byLevel,
  };
}

/**
 * Lựa chọn nhóm thống kê CHÍNH để làm nổi bật trên giao diện (Hero Card / Primary Stats).
 *
 * THỨ TỰ ƯU TIÊN:
 * 1. Chế độ 'online_1v1' (hoặc online PvP leo rank sau này khi có trận đấu).
 * 2. Chế độ 'vs_ai' (tổng hợp từ cả 3 level nếu có ít nhất 1 trận đấu).
 * 3. Trả về `null` nếu chỉ có 'local_pvp' hoặc chưa có trận đấu nào (Local PvP không bao giờ là primary).
 *
 * @param byModeKey Bảng thống kê phân rã theo modeKey của game.
 * @returns Khối thống kê chính kèm định danh `modeKey`, hoặc `null`.
 */
export function pickPrimaryModeStats(
  byModeKey: Record<string, ModeStats>,
): { readonly modeKey: string; readonly stats: ModeStats } | null {
  // 1. Ưu tiên hàng đầu: Online 1v1 PvP
  if (byModeKey['online_1v1'] && byModeKey['online_1v1'].matches > 0) {
    return {
      modeKey: 'online_1v1',
      stats: byModeKey['online_1v1'],
    };
  }

  // 2. Ưu tiên thứ hai: Đấu máy (Gộp tất cả level)
  const vsAiAgg = aggregateVsAi(byModeKey);
  if (vsAiAgg.overall.matches > 0) {
    return {
      modeKey: 'vs_ai:all',
      stats: vsAiAgg.overall,
    };
  }

  // 3. Không có chế độ chính phù hợp (Local PvP không làm primary)
  return null;
}
