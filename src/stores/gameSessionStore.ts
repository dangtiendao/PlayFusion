import { create } from 'zustand';

/**
 * ==============================================================================
 * STORE PHIÊN CHƠI VÁN ĐẤU (GAME SESSION STORE)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. QUẢN LÝ TRẠNG THÁI IN-MEMORY (KHÔNG PERSIST):
 *    - Trạng thái ván đấu chỉ tồn tại trong vòng đời khi người dùng đang ở trong route `/game/:gameId`.
 * 2. CỜ NỀN CHO CÁC QUYẾT ĐỊNH UI TOÀN CỤC:
 *    - `isInGame`: Báo hiệu người chơi đang ở trong màn hình ván đấu.
 *      + `AppShell` dùng cờ này để tự động ẩn BottomNav trên mobile, giải phóng không gian cho bàn cờ.
 *      + `UpdatePrompt` (sẽ hoàn thiện tại Phase P3.x) dùng cờ này để không hiện popup giữa ván.
 *    - `isPaused`: Báo hiệu ván đấu đang ở trạng thái tạm dừng (Pause Overlay hiển thị).
 * ==============================================================================
 */

export interface GameSessionState {
  /** True nếu người chơi đang ở trong màn hình/phòng ván đấu */
  readonly isInGame: boolean;
  /** True nếu ván đấu đang ở trạng thái tạm dừng (Pause Overlay) */
  readonly isPaused: boolean;
}

export interface GameSessionActions {
  /** Bắt đầu phiên chơi ván đấu */
  readonly enterGame: () => void;
  /** Kết thúc phiên chơi và quay về Sảnh */
  readonly exitGame: () => void;
  /** Tạm dừng ván đấu */
  readonly pause: () => void;
  /** Tiếp tục ván đấu */
  readonly resume: () => void;
}

export type GameSessionStore = GameSessionState & GameSessionActions;

export const useGameSessionStore = create<GameSessionStore>((set) => ({
  isInGame: false,
  isPaused: false,

  enterGame: () => set({ isInGame: true, isPaused: false }),
  exitGame: () => set({ isInGame: false, isPaused: false }),
  pause: () => set({ isPaused: true }),
  resume: () => set({ isPaused: false }),
}));

export default useGameSessionStore;
