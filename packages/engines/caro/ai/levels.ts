/**
 * ==============================================================================
 * CARO AI DIFFICULTY LEVELS CONFIGURATION (CẤU HÌNH 3 MỨC ĐỘ KHÓ)
 * ==============================================================================
 *
 * Định nghĩa 3 cấp độ thông minh cho AI Cờ Caro:
 * 1. Easy (Dễ): Độ sâu 1, candidates ~10, có 30% nhiễu ngẫu nhiên, 30% quên chặn nước đối thủ.
 * 2. Medium (Vừa): Độ sâu 2, candidates ~15, không nhiễu, luôn chặn và tấn công cơ bản.
 * 3. Hard (Khó): Độ sâu 4, candidates ~20, Time Budget 1500ms, Iterative Deepening.
 *
 * Pure TypeScript — Zero DOM — Zero Dependencies.
 */

export type AiLevel = 'easy' | 'medium' | 'hard';

/**
 * Cấu hình chi tiết cho một cấp độ AI.
 */
export interface AiLevelConfig {
  /** Tên định danh cấp độ */
  readonly level: AiLevel;
  /** Độ sâu tìm kiếm tối đa trên cây Minimax */
  readonly maxDepth: number;
  /** Số lượng nước đi ứng viên tối đa tại mỗi tầng */
  readonly maxCandidates: number;
  /** Bán kính vùng lân cận quanh các quân cờ đã đánh */
  readonly candidateRadius: number;
  /** Giới hạn thời gian tối đa cho 1 lượt tính toán (mili-giây) */
  readonly timeBudgetMs: number;
  /** Xác suất chọn ngẫu nhiên trong Top 5 nước tốt nhất thay vì nước số 1 (chỉ áp dụng ở Easy) */
  readonly noiseProbability: number;
  /**
   * Xác suất AI cố tình "quên" chặn nước thắng của đối thủ ở lượt kế tiếp.
   * Thiết kế này nhằm giúp người mới bắt đầu chơi có cơ hội thắng được máy.
   */
  readonly forgetBlockProbability: number;
}

/**
 * Bảng cấu hình mặc định cho 3 mức độ khó của AI Caro.
 */
export const AI_LEVELS: Record<AiLevel, AiLevelConfig> = {
  easy: {
    level: 'easy',
    maxDepth: 1,
    maxCandidates: 10,
    candidateRadius: 1,
    timeBudgetMs: 500,
    noiseProbability: 0.3,
    forgetBlockProbability: 0.3,
  },
  medium: {
    level: 'medium',
    maxDepth: 2,
    maxCandidates: 15,
    candidateRadius: 2,
    timeBudgetMs: 1000,
    noiseProbability: 0.0,
    forgetBlockProbability: 0.0,
  },
  hard: {
    level: 'hard',
    maxDepth: 4,
    maxCandidates: 20,
    candidateRadius: 2,
    timeBudgetMs: 1500,
    noiseProbability: 0.0,
    forgetBlockProbability: 0.0,
  },
};

/**
 * Lấy thông tin cấu hình tương ứng với mức độ khó.
 *
 * @param level Mức độ khó ('easy' | 'medium' | 'hard').
 * @returns Cấu hình `AiLevelConfig`.
 */
export function getAiLevelConfig(level: AiLevel): AiLevelConfig {
  const config = AI_LEVELS[level];
  return config ?? AI_LEVELS.medium;
}
