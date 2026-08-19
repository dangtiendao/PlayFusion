/**
 * ==============================================================================
 * STATS REPOSITORY (TẦNG TRUY VẤN THỐNG KÊ TRỰC TUYẾN - CLOUD STATS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. NGUỒN CHÂN LÝ THỐNG KÊ (SINGLE SOURCE OF TRUTH):
 *    - Thống kê người chơi được tổng hợp từ lịch sử trận đấu thật trên bảng `matches`
 *      và `match_participants` (các trận offline đã sync từ P2.5 và online sau này).
 * 2. QUYẾT ĐỊNH KỸ THUẬT CLIENT-SIDE AGGREGATE (PHASE P2.6a):
 *    - Sử dụng tổng hợp in-memory phía client từ danh sách rows `match_participants`
 *      của người dùng hiện tại (kèm join bảng `matches`).
 *    - Lý do: Không cần tạo thêm SQL Stored Procedure/Migration mới, dữ liệu của một
 *      người dùng gọn nhẹ (100–500 ván < 15KB), PostgREST select cực nhanh.
 *    - Nợ kỹ thuật: Giới hạn trần `.limit(1000)` trận mới nhất. Khi người chơi vượt quá
 *      1,000 trận hoặc khi làm thống kê admin toàn server (P5.2), sẽ chuyển sang RPC DB.
 * 3. QUY TẮC PHÂN RÃ & TÁCH BẠCH CHẾ ĐỘ (MODE KEY & LOCAL PVP):
 *    - Map `mode + bot_level` -> `modeKey`:
 *      + `vs_ai` + `bot_level` (ví dụ: 'hard') -> `'vs_ai:hard'`.
 *      + `local_pvp` -> `'local_pvp'`.
 *      + `online_1v1` -> `'online_1v1'`.
 *    - Quy tắc `local_pvp`: 2 người chơi chung trên 1 thiết bị không phản ánh thành tích
 *      cá nhân của riêng chủ tài khoản (quy tắc bất biến từ P1.5a). Do đó `local_pvp`
 *      chỉ đếm `matches` và `draws`, KHÔNG tính `wins`/`losses` vào thành tích.
 * ==============================================================================
 */

import { supabase } from './supabaseClient';
import { type PlayerGameStats, type ModeStats, RepoError } from './types';

export { RepoError };

interface DbParticipantStatsRow {
  result: 'win' | 'loss' | 'draw' | null;
  bot_level: string | null;
  match: {
    game_id: string;
    mode: string;
  } | null;
}

/**
 * Lấy toàn bộ số liệu thống kê thành tích các trò chơi của người dùng hiện tại từ Cloud DB.
 *
 * @returns Mảng thống kê chi tiết theo từng game `PlayerGameStats[]`.
 */
export async function getMyGameStats(): Promise<PlayerGameStats[]> {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw new RepoError(
        'Không thể xác thực phiên người dùng khi lấy thống kê.',
        'RETRYABLE',
        authError,
      );
    }

    if (!user) {
      return [];
    }

    // Truy vấn danh sách các trận đấu người dùng tham gia (giới hạn 1000 trận mới nhất)
    const { data, error } = await supabase
      .from('match_participants')
      .select(
        `
        result,
        bot_level,
        match:matches!inner (
          game_id,
          mode
        )
      `,
      )
      .eq('user_id', user.id)
      .limit(1000);

    if (error) {
      throw new RepoError('Lỗi khi truy vấn dữ liệu thống kê ván đấu.', 'RETRYABLE', error);
    }

    if (!data || data.length === 0) {
      return [];
    }

    const rows = data as unknown as DbParticipantStatsRow[];

    // Map gom nhóm theo gameId
    const gameStatsMap = new Map<
      string,
      {
        totalMatches: number;
        byModeKey: Record<string, { matches: number; wins: number; losses: number; draws: number }>;
      }
    >();

    for (const row of rows) {
      if (!row.match?.game_id || !row.match?.mode) {
        continue;
      }

      const gameId = row.match.game_id;
      const rawMode = row.match.mode;

      // Sinh modeKey chuẩn hóa
      let modeKey: string = rawMode;
      if (rawMode === 'vs_ai' && row.bot_level) {
        modeKey = `vs_ai:${row.bot_level}`;
      }

      let gameEntry = gameStatsMap.get(gameId);
      if (!gameEntry) {
        gameEntry = {
          totalMatches: 0,
          byModeKey: {},
        };
        gameStatsMap.set(gameId, gameEntry);
      }
      gameEntry.totalMatches += 1;

      let modeStats = gameEntry.byModeKey[modeKey];
      if (!modeStats) {
        modeStats = {
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
        };
        gameEntry.byModeKey[modeKey] = modeStats;
      }
      modeStats.matches += 1;

      // Áp dụng quy tắc tính kết quả theo chế độ chơi
      if (rawMode === 'local_pvp') {
        // Local PvP: 2 người 1 máy không phải thành tích cá nhân -> chỉ đếm trận & hòa
        if (row.result === 'draw') {
          modeStats.draws += 1;
        }
      } else {
        // Các chế độ khác (vs_ai, online_1v1...): Ghi nhận đầy đủ thắng/thua/hòa
        if (row.result === 'win') {
          modeStats.wins += 1;
        } else if (row.result === 'loss') {
          modeStats.losses += 1;
        } else if (row.result === 'draw') {
          modeStats.draws += 1;
        }
      }
    }

    // Chuyển Map thành mảng PlayerGameStats[]
    const results: PlayerGameStats[] = [];
    for (const [gameId, entry] of gameStatsMap.entries()) {
      const byModeKeyClean: Record<string, ModeStats> = {};
      for (const [key, stats] of Object.entries(entry.byModeKey)) {
        byModeKeyClean[key] = {
          matches: stats.matches,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
        };
      }

      results.push({
        gameId,
        totalMatches: entry.totalMatches,
        byModeKey: byModeKeyClean,
      });
    }

    return results;
  } catch (err: unknown) {
    if (err instanceof RepoError) throw err;
    throw new RepoError(
      'Không thể tổng hợp thống kê người chơi do lỗi không xác định.',
      'FATAL',
      err,
    );
  }
}
