/**
 * packages/rating/index.ts
 *
 * Barrel export toàn bộ API công khai của module Rating & Elo (@rating).
 *
 * QUY TẮC BẤT BIẾN (HỢP ĐỒNG KHÓA SỔ TỪ P4.1):
 * - Đây là API công khai ổn định của toàn dự án (phục vụ Client Preview, Server Edge Functions Deno, và Tests).
 * - HỢP ĐỒNG ĐÃ KHÓA: CHỈ ĐƯỢC PHÉP BỔ SUNG thuộc tính optional hoặc hàm mới,
 *   TUYỆT ĐỐI KHÔNG thay đổi chữ ký (signature) hay hành vi toán học của các hàm hiện hữu.
 */

// 1. Types & Constants
export {
  type EloConfig,
  type PlayerRatingInput,
  type MatchScore,
  type PairUpdateResult,
  DEFAULT_ELO_CONFIG,
} from './types.ts';

// 2. 1v1 Core Elo Functions
export { expectedScore, resolveK, updatePair } from './elo.ts';

// 3. Multi-player FFA Functions & Types
export { type FfaParticipant, type FfaUpdateResult, updateFfa } from './ffa.ts';

// 4. Configuration Parser & Types (Fail-Soft for P4.2 settle_match)
export { type ParsedEloConfigResult, parseEloConfig } from './config.ts';
