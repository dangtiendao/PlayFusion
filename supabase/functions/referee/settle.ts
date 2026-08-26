/**
 * ==============================================================================
 * BỘ NÃO KẾT TOÁN TRẬN ĐẤU (SUPABASE/FUNCTIONS/REFEREE/SETTLE.TS)
 * ==============================================================================
 *
 * MỤC TIÊU & NGUYÊN TẮC KIẾN TRÚC:
 * 1. BỘ NÃO TÍNH TOÁN (SETTLEMENT BRAIN):
 *    - Nhận dữ liệu ván đấu và danh sách đấu thủ đã được finalize bởi Trọng tài.
 *    - Sử dụng module TS thuần `@rating` (P4.1) để tính toán biến động điểm Elo (Dynamic K-Factor).
 *    - Tra cứu bảng thưởng xu `reward.*`, `penalty.*` và luật chống farm `reward.repeat_opponent`.
 *    - Đóng gói payload gửi sang Stored Function `apply_match_settlement` (P4.5a) để áp dụng nguyên tử.
 * 2. ĐỘC LẬP & DETERMINISTIC:
 *    - Hàm `buildSettlement` là Pure Logic 100%, nhận dependencies inject, dễ dàng unit test không cần DB.
 * 3. NGUYÊN TẮC FAIL-SAFE BẤT BIẾN:
 *    - Nếu quá trình settle gặp sự cố (lỗi mạng DB, timeout...), hệ thống GHI LOG LỖI CÓ CẤU TRÚC
 *      và TUYỆT ĐỐI KHÔNG throw làm hỏng response 200 OK của ván đấu.
 *    - Idempotency guard của DB đảm bảo ván cờ có thể được kích hoạt re-settle lại mà không sợ cộng dồn.
 * 4. XỬ LÝ LỆCH NHỊP RATING (OPTIMISTIC RETRY):
 *    - Nếu DB ném lỗi 'STALE_RATING', referee tự động re-fetch rating mới nhất và tính lại ĐÚNG 1 LẦN.
 * 5. PHÁT SÓNG REALTIME:
 *    - Khi kết toán thành công, phát sóng sự kiện Realtime `match_settled` (SAU `match_ended`).
 * 6. LUẬT CHỐNG FARM XU (PHASE P4.5a):
 *    - Trần ngày (Daily Cap): Truyền `daily_cap` vào RPC, enforce trong DB transaction sau khi lock ví.
 *    - Giảm thưởng gặp lại (Repeat Opponent Dampening): Tính toán theo số trận đã đấu hôm nay giữa cặp kỳ thủ.
 *    - Phạt Abandon (Timeout Penalty): Thua do hết giờ bị phạt `-20` xu thay vì nhận xu an ủi. Resign không bị phạt.
 *    - Điểm Elo BẤT BIẾN: Mọi quy tắc giảm thưởng / phạt xu TUYỆT ĐỐI KHÔNG làm sai lệch biến động Elo.
 * ==============================================================================
 */

import {
  updatePair,
  parseEloConfig,
  type PlayerRatingInput,
  type EloConfig,
} from '../../../packages/rating/index.ts';

export interface SettleMatchRecord {
  readonly id?: string;
  readonly is_ranked: boolean;
  readonly season_id: number | null;
  readonly end_reason: string | null;
  readonly game_id: string;
  readonly mode: string;
}

export interface SettleParticipantRecord {
  readonly user_id: string | null;
  readonly seat_index: number;
  readonly result: 'win' | 'loss' | 'draw' | null;
  readonly is_bot?: boolean;
}

export interface SettleRatingState {
  readonly rating: number;
  readonly gamesPlayed: number;
}

export interface BuildSettlementInput {
  readonly match: SettleMatchRecord;
  readonly participants: readonly SettleParticipantRecord[];
  readonly currentRatings: Record<string, SettleRatingState>;
  readonly configRows: Record<string, unknown>;
  readonly todayPairCount?: number; // Số trận ranked đã settle hôm nay giữa cặp đấu thủ này
}

export interface SettlementEntry {
  readonly user_id: string;
  readonly seat_index: number;
  readonly rating_before: number;
  readonly rating_after: number;
  readonly rating_delta: number;
  readonly outcome: 'win' | 'loss' | 'draw';
  readonly coins: number;
}

export interface SettlementPayload {
  readonly placement_games: number;
  readonly daily_cap: number;
  readonly entries: readonly SettlementEntry[];
}

export type SettlementDecision =
  | { readonly is_noop: true; readonly reason: string }
  | { readonly is_noop: false; readonly payload: SettlementPayload; readonly eloConfig: EloConfig };

export interface SettlementRpcEntryResult {
  readonly user_id: string;
  readonly coins_applied: number;
  readonly capped: boolean;
}

export interface SettlementRpcResult {
  readonly applied?: boolean;
  readonly noop?: boolean;
  readonly reason?: string;
  readonly entries?: number | SettlementRpcEntryResult[];
}

export interface SettleQueryBuilder {
  readonly select: (...args: unknown[]) => SettleQueryBuilder;
  readonly eq: (...args: unknown[]) => SettleQueryBuilder;
  readonly gte: (...args: unknown[]) => SettleQueryBuilder;
  readonly neq: (...args: unknown[]) => SettleQueryBuilder;
  readonly in: (...args: unknown[]) => SettleQueryBuilder;
  readonly single: () => Promise<{ data: unknown; error: { message?: string } | null }>;
  readonly then: (
    onfulfilled?: (value: { data: unknown; error: { message?: string } | null }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

export interface SettleDatabaseClient {
  readonly from: (table: string) => SettleQueryBuilder;
  readonly rpc: (
    fn: string,
    params: { readonly p: Record<string, unknown> },
  ) => Promise<{
    readonly data: SettlementRpcResult | null;
    readonly error: { readonly message?: string; readonly code?: string } | null;
  }>;
}

/**
 * Trích xuất mốc 0h00 sáng hôm nay theo múi giờ Việt Nam (UTC+7) dưới dạng ISO string.
 */
export function getVietnamStartOfDayIso(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const vnDateStr = formatter.format(now); // 'YYYY-MM-DD'
  return `${vnDateStr}T00:00:00+07:00`;
}

/**
 * Cấu hình giảm thưởng khi gặp lại cùng đối thủ trong ngày.
 */
export interface RepeatOpponentConfig {
  readonly fullMatches: number;
  readonly dampenFactor: number;
  readonly zeroAfter: number;
}

export function parseRepeatOpponentConfig(rows: Record<string, unknown>): RepeatOpponentConfig {
  const val = rows['reward.repeat_opponent'];
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    const fullMatches =
      typeof obj.full_matches === 'number' && Number.isFinite(obj.full_matches)
        ? Math.max(0, Math.floor(obj.full_matches))
        : 2;
    const dampenFactor =
      typeof obj.dampen_factor === 'number' && Number.isFinite(obj.dampen_factor)
        ? Math.max(0, Math.min(1, obj.dampen_factor))
        : 0.5;
    const zeroAfter =
      typeof obj.zero_after === 'number' && Number.isFinite(obj.zero_after)
        ? Math.max(fullMatches, Math.floor(obj.zero_after))
        : 5;
    return { fullMatches, dampenFactor, zeroAfter };
  }
  return { fullMatches: 2, dampenFactor: 0.5, zeroAfter: 5 };
}

/**
 * Trích xuất trần thưởng xu theo ngày (Daily Cap) với fallback an toàn là 500 xu.
 */
export function parseDailyCap(rows: Record<string, unknown>): number {
  const val = rows['reward.daily_cap'];
  if (
    typeof val === 'object' &&
    val !== null &&
    'coins' in val &&
    typeof (val as { coins?: unknown }).coins === 'number' &&
    Number.isFinite((val as { coins: number }).coins)
  ) {
    return Math.max(1, Math.floor((val as { coins: number }).coins));
  }
  return 500;
}

/**
 * Trích xuất mức phạt bỏ cuộc (Abandon Penalty) với fallback an toàn là -20 xu.
 */
export function parseAbandonPenalty(rows: Record<string, unknown>): number {
  const val = rows['penalty.abandon'];
  if (
    typeof val === 'object' &&
    val !== null &&
    'coins' in val &&
    typeof (val as { coins?: unknown }).coins === 'number' &&
    Number.isFinite((val as { coins: number }).coins)
  ) {
    const num = Math.floor((val as { coins: number }).coins);
    return num > 0 ? -num : num; // Luôn đảm bảo là số âm
  }
  return -20;
}

/**
 * Trích xuất cấu hình thưởng xu từ system_config với giá trị fallback an toàn.
 */
function parseReward(value: unknown, fallback: number): number {
  if (
    typeof value === 'object' &&
    value !== null &&
    'coins' in value &&
    typeof (value as { coins?: unknown }).coins === 'number' &&
    Number.isFinite((value as { coins: number }).coins)
  ) {
    return Math.max(0, Math.floor((value as { coins: number }).coins));
  }
  return fallback;
}

export function parseRewardConfig(rows: Record<string, unknown>): {
  winRanked: number;
  lossRanked: number;
  drawRanked: number;
} {
  return {
    winRanked: parseReward(rows['reward.win_ranked'], 50),
    lossRanked: parseReward(rows['reward.loss_ranked'], 5),
    drawRanked: parseReward(rows['reward.draw_ranked'], 20),
  };
}

/**
 * Hàm thuần tính toán quyết định kết toán ván đấu (Pure Logic).
 *
 * LUẬT QUYẾT ĐỊNH (a -> e):
 * a. NOOP khi: is_ranked = false | end_reason = 'abort' | season_id = null | có bot | thiếu result | khác 2 người.
 * b. Ranked 1v1: parseEloConfig -> updatePair -> entries (rating_before/after/delta).
 * c. LUẬT XU & CHỐNG FARM (P4.5a):
 *    - Hệ số gặp lại đối thủ:
 *      + todayPairCount < fullMatches (2 trận đầu): multiplier = 1 (100%)
 *      + fullMatches <= count < zeroAfter (trận 3-5): multiplier = dampenFactor (50%)
 *      + count >= zeroAfter (từ trận 6): multiplier = 0
 *    - Phạt Abandon do Timeout:
 *      + end_reason = 'timeout': Người THUA nhận penalty.abandon (-20 xu) thay vì xu an ủi.
 *      + end_reason = 'resign' hoặc bình thường: Người THUA nhận loss reward (+5 xu * multiplier).
 *    - Penalty TUYỆT ĐỐI KHÔNG bị nhân hệ số dampen.
 * d. Điểm Elo BẤT BIẾN: Mọi biến động Elo giữ nguyên 100%, không bị ảnh hưởng bởi giảm xu hay phạt xu.
 * e. placement_games & daily_cap: Đóng gói đầy đủ gửi sang RPC Database.
 */
export function buildSettlement(input: BuildSettlementInput): SettlementDecision {
  const { match, participants, currentRatings, configRows, todayPairCount = 0 } = input;

  // 1. LUẬT a: KIỂM TRA ĐIỀU KIỆN NO-OP
  if (!match.is_ranked) {
    return { is_noop: true, reason: 'unranked_match' };
  }

  if (match.end_reason === 'abort') {
    return { is_noop: true, reason: 'match_aborted' };
  }

  if (match.season_id === null || match.season_id === undefined) {
    return { is_noop: true, reason: 'missing_season' };
  }

  if (participants.some((p) => p.is_bot || !p.user_id)) {
    return { is_noop: true, reason: 'has_bot_or_anonymous_participant' };
  }

  if (participants.some((p) => !p.result)) {
    return { is_noop: true, reason: 'missing_participant_result' };
  }

  if (participants.length !== 2) {
    return { is_noop: true, reason: 'unsupported_participant_count' };
  }

  // Sắp xếp đấu thủ theo seat_index tăng dần (Seat 0 và Seat 1)
  const sortedParticipants = [...participants].sort((a, b) => a.seat_index - b.seat_index);
  const p0 = sortedParticipants[0];
  const p1 = sortedParticipants[1];

  const u0 = p0.user_id;
  const u1 = p1.user_id;

  if (!u0 || !u1) {
    return { is_noop: true, reason: 'has_bot_or_anonymous_participant' };
  }

  // 2. LUẬT b: TÍNH TOÁN RATING ELO 1v1 (ĐỘC LẬP 100% VỚI XU)
  const { config: eloConfig } = parseEloConfig(configRows);

  const r0 = currentRatings[u0] ?? { rating: 1200, gamesPlayed: 0 };
  const r1 = currentRatings[u1] ?? { rating: 1200, gamesPlayed: 0 };

  const playerAInput: PlayerRatingInput = {
    rating: r0.rating,
    gamesPlayed: r0.gamesPlayed,
  };
  const playerBInput: PlayerRatingInput = {
    rating: r1.rating,
    gamesPlayed: r1.gamesPlayed,
  };

  let scoreA: 1 | 0.5 | 0;
  if (p0.result === 'win') {
    scoreA = 1;
  } else if (p0.result === 'loss') {
    scoreA = 0;
  } else {
    scoreA = 0.5;
  }

  const pairResult = updatePair(playerAInput, playerBInput, scoreA, eloConfig);

  // 3. LUẬT c: TÍNH TOÁN XU THƯỞNG & PHẠT VỚI HỆ SỐ GIẢM THƯỞNG GẶP LẠI (P4.5a)
  const rewards = parseRewardConfig(configRows);
  const repeatConfig = parseRepeatOpponentConfig(configRows);
  const dailyCap = parseDailyCap(configRows);
  const abandonPenalty = parseAbandonPenalty(configRows);

  // Tính hệ số giảm thưởng gặp lại
  let multiplier = 1;
  if (todayPairCount < repeatConfig.fullMatches) {
    multiplier = 1;
  } else if (todayPairCount < repeatConfig.zeroAfter) {
    multiplier = repeatConfig.dampenFactor;
  } else {
    multiplier = 0;
  }

  const calculateCoins = (outcome: 'win' | 'loss' | 'draw'): number => {
    if (outcome === 'win') {
      return Math.floor(rewards.winRanked * multiplier);
    }
    if (outcome === 'draw') {
      return Math.floor(rewards.drawRanked * multiplier);
    }
    // outcome === 'loss'
    if (match.end_reason === 'timeout') {
      // Phạt abandon do hết giờ -> Phạt trừ xu, KHÔNG áp hệ số giảm thưởng
      return abandonPenalty;
    }
    // Đầu hàng (resign) hoặc thua bình thường -> Thưởng xu an ủi có áp hệ số
    return Math.floor(rewards.lossRanked * multiplier);
  };

  const outcome0 = p0.result as 'win' | 'loss' | 'draw';
  const outcome1 = p1.result as 'win' | 'loss' | 'draw';

  const entries: SettlementEntry[] = [
    {
      user_id: u0,
      seat_index: p0.seat_index,
      rating_before: r0.rating,
      rating_after: pairResult.newRatingA,
      rating_delta: pairResult.deltaA,
      outcome: outcome0,
      coins: calculateCoins(outcome0),
    },
    {
      user_id: u1,
      seat_index: p1.seat_index,
      rating_before: r1.rating,
      rating_after: pairResult.newRatingB,
      rating_delta: pairResult.deltaB,
      outcome: outcome1,
      coins: calculateCoins(outcome1),
    },
  ];

  // 4. LUẬT e: PLACEMENT GAMES & DAILY CAP
  return {
    is_noop: false,
    payload: {
      placement_games: eloConfig.placementGames,
      daily_cap: dailyCap,
      entries,
    },
    eloConfig,
  };
}

/**
 * Thực thi quy trình kết toán ván đấu và phát sóng Realtime:
 * 1. Tải thông tin trận đấu, người chơi, cấu hình và rating hiện tại.
 * 2. Đếm số trận đã đấu hôm nay giữa cặp đấu thủ (todayPairCount).
 * 3. Gọi hàm thuần buildSettlement để đưa ra quyết định (noop hay ranked).
 * 4. Gọi RPC apply_match_settlement.
 * 5. Xử lý kết quả:
 *    - applied: true (có entries) -> broadcast 'match_settled' (SAU 'match_ended').
 *    - applied: false -> log info already_settled (idempotent guard).
 *    - STALE_RATING -> đọc lại rating mới nhất, tính lại và retry RPC đúng 1 lần.
 *    - Lỗi khác -> log error, không throw ra ngoài (fail-safe).
 */
export async function executeSettlement(
  matchId: string,
  adminClient: SettleDatabaseClient,
  broadcast: (id: string, eventType: string, payload: unknown) => Promise<void>,
  log: (entry: Record<string, unknown>) => void,
): Promise<void> {
  try {
    // 1. Tải thông tin ván đấu
    const { data: matchDataRaw, error: matchErr } = await adminClient
      .from('matches')
      .select('id, game_id, mode, is_ranked, season_id, end_reason, ended_at, settled_at')
      .eq('id', matchId)
      .single();

    const matchData = matchDataRaw as SettleMatchRecord | null;

    if (matchErr || !matchData) {
      log({
        fn: 'referee',
        action: 'settle',
        matchId,
        outcome: 'match_not_found',
        error: matchErr?.message,
      });
      return;
    }

    // 2. Tải danh sách người chơi
    const { data: participantsDataRaw, error: partErr } = await adminClient
      .from('match_participants')
      .select('user_id, seat_index, result, is_bot')
      .eq('match_id', matchId);

    const participantsData = participantsDataRaw as SettleParticipantRecord[] | null;

    if (partErr || !participantsData || participantsData.length === 0) {
      log({
        fn: 'referee',
        action: 'settle',
        matchId,
        outcome: 'participants_not_found',
        error: partErr?.message,
      });
      return;
    }

    // 3. Tải toàn bộ config hệ thống (elo.*, reward.*, penalty.*)
    const { data: configDataRaw } = await adminClient.from('system_config').select('key, value');

    const configRows: Record<string, unknown> = {};
    if (Array.isArray(configDataRaw)) {
      for (const row of configDataRaw) {
        if (
          row &&
          typeof row === 'object' &&
          'key' in row &&
          typeof (row as { key?: unknown }).key === 'string' &&
          'value' in row
        ) {
          configRows[(row as { key: string }).key] = (row as { value: unknown }).value;
        }
      }
    }

    // 4. Tra cứu số trận đấu hôm nay giữa cặp đấu thủ (todayPairCount)
    const userIds = participantsData
      .map((p: SettleParticipantRecord) => p.user_id)
      .filter((id: string | null): id is string => typeof id === 'string');

    let todayPairCount = 0;
    if (userIds.length === 2 && matchData.is_ranked) {
      try {
        const u0 = userIds[0];
        const u1 = userIds[1];
        const startOfDayIso = getVietnamStartOfDayIso();

        const { data: u0Rows } = await adminClient
          .from('match_participants')
          .select('match_id, matches!inner(id, game_id, is_ranked, settled_at)')
          .eq('user_id', u0)
          .eq('matches.game_id', matchData.game_id)
          .eq('matches.is_ranked', true)
          .gte('matches.settled_at', startOfDayIso)
          .neq('match_id', matchId);

        if (Array.isArray(u0Rows) && u0Rows.length > 0) {
          const candidateMatchIds = (u0Rows as { match_id: string }[]).map((r) => r.match_id);
          const { data: u1Rows } = await adminClient
            .from('match_participants')
            .select('match_id')
            .eq('user_id', u1)
            .in('match_id', candidateMatchIds);

          if (Array.isArray(u1Rows)) {
            todayPairCount = u1Rows.length;
          }
        }
      } catch {
        // Fail-soft: nếu query gặp sự cố, mặc định pairCount = 0
        todayPairCount = 0;
      }
    }

    // Helper hàm nạp rating hiện tại
    const loadRatings = async (uIds: string[]): Promise<Record<string, SettleRatingState>> => {
      const currentRatings: Record<string, SettleRatingState> = {};
      if (matchData.season_id && uIds.length > 0) {
        const { data: ratingRowsRaw } = await adminClient
          .from('player_ratings')
          .select('user_id, rating, games_played')
          .eq('game_id', matchData.game_id)
          .eq('season_id', matchData.season_id)
          .in('user_id', uIds);

        if (Array.isArray(ratingRowsRaw)) {
          for (const r of ratingRowsRaw) {
            if (r && typeof r === 'object' && 'user_id' in r && typeof r.user_id === 'string') {
              currentRatings[r.user_id] = {
                rating: Number((r as { rating?: unknown }).rating) || 1200,
                gamesPlayed: Number((r as { games_played?: unknown }).games_played) || 0,
              };
            }
          }
        }
      }
      return currentRatings;
    };

    let currentRatings = await loadRatings(userIds);

    // 5. Xây dựng quyết định kết toán và gọi RPC
    const runSettlementAttempt = async (
      ratings: Record<string, SettleRatingState>,
    ): Promise<{
      resData: SettlementRpcResult | null;
      decision: SettlementDecision;
    }> => {
      const decision = buildSettlement({
        match: matchData,
        participants: participantsData,
        currentRatings: ratings,
        configRows,
        todayPairCount,
      });

      let rpcPayload: Record<string, unknown>;
      if (decision.is_noop) {
        rpcPayload = {
          match_id: matchId,
          is_noop: true,
        };
      } else {
        rpcPayload = {
          match_id: matchId,
          is_noop: false,
          placement_games: decision.payload.placement_games,
          daily_cap: decision.payload.daily_cap,
          entries: decision.payload.entries,
        };
      }

      const { data, error } = await adminClient.rpc('apply_match_settlement', { p: rpcPayload });
      if (error) {
        throw new Error(error.message || `RPC error: ${error.code || 'UNKNOWN'}`);
      }
      return { resData: data, decision };
    };

    let result: {
      resData: SettlementRpcResult | null;
      decision: SettlementDecision;
    };

    try {
      result = await runSettlementAttempt(currentRatings);
    } catch (firstErr: unknown) {
      // 6. CƠ CHẾ RETRY ĐÚNG 1 LẦN NẾU GẶP STALE_RATING
      const errorMessage = (firstErr as Error)?.message || String(firstErr);
      const isStaleRating = errorMessage.includes('STALE_RATING') || errorMessage.includes('P0407');

      if (isStaleRating) {
        log({
          fn: 'referee',
          action: 'settle',
          matchId,
          outcome: 'retry_stale_rating',
        });

        // Nạp lại ratings mới nhất từ DB
        currentRatings = await loadRatings(userIds);
        result = await runSettlementAttempt(currentRatings);
      } else {
        throw firstErr;
      }
    }

    const { resData, decision } = result;

    if (decision.is_noop) {
      log({
        fn: 'referee',
        action: 'settle',
        matchId,
        outcome: 'noop',
        reason: decision.reason,
      });
      return;
    }

    if (resData?.applied === true) {
      // 7. PHÁT SÓNG REALTIME 'match_settled' (SAU 'match_ended')
      const rpcEntries = Array.isArray(resData.entries) ? resData.entries : [];
      const appliedEntryMap = new Map<string, { coins: number; capped: boolean }>();
      for (const re of rpcEntries) {
        if (re && typeof re === 'object' && 'user_id' in re && typeof re.user_id === 'string') {
          appliedEntryMap.set(re.user_id, {
            coins: Number((re as { coins_applied?: unknown }).coins_applied ?? 0),
            capped: Boolean((re as { capped?: unknown }).capped),
          });
        }
      }

      const deltas = decision.payload.entries.map((e) => {
        const applied = appliedEntryMap.get(e.user_id);
        return {
          userId: e.user_id,
          ratingDelta: e.rating_delta,
          newRating: e.rating_after,
          coins: applied ? applied.coins : e.coins,
          capped: applied ? applied.capped : false,
        };
      });

      const nowIso = new Date().toISOString();
      await broadcast(matchId, 'match_settled', {
        matchId,
        deltas,
        serverNow: nowIso,
      });

      log({
        fn: 'referee',
        action: 'settle',
        matchId,
        outcome: 'settled',
        entries: deltas.length,
      });
    } else {
      log({
        fn: 'referee',
        action: 'settle',
        matchId,
        outcome: 'already_settled',
        reason: resData?.reason,
      });
    }
  } catch (err: unknown) {
    // 8. NGUYÊN TẮC FAIL-SAFE BẤT BIẾN:
    // Tuyệt đối KHÔNG throw lỗi ra ngoài làm crash response 200 OK của Trọng tài.
    log({
      fn: 'referee',
      action: 'settle',
      matchId,
      outcome: 'error',
      error: (err as Error)?.message || String(err),
    });
  }
}
