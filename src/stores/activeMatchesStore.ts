/**
 * ==============================================================================
 * ACTIVE MATCHES STORE (SRC/STORES/ACTIVEMATCHESSTORE.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & FREE-TIER OPTIMIZATION (P3.6c):
 * 1. QUẢN LÝ DANH SÁCH VÁN ĐẤU TRỰC TUYẾN ĐANG SỐNG:
 *    - Lưu trữ danh sách trận (realtime + correspondence) và đếm số lượng ván đang đến lượt (myTurnCount).
 *    - Đóng vai trò cung cấp badge thông báo số lượt trên Home Icon (BottomNav / Sidebar).
 * 2. TUYỆT ĐỐI 0 BACKGROUND POLLING:
 *    - Cơ chế kích hoạt thuần túy theo sự kiện: Mount màn hình Home/Panel, chuyển tab visible,
 *      hoặc ngay sau khi thực hiện nước đi / kết thúc ván.
 * ==============================================================================
 */

import { create } from 'zustand';
import { matchRepository, type ActiveMatchItem } from '@/repositories/matchRepository';

export interface ActiveMatchesStoreState {
  readonly matches: ActiveMatchItem[];
  readonly myTurnCount: number;
  readonly isLoading: boolean;
  readonly refresh: () => Promise<void>;
  readonly clear: () => void;
}

export const useActiveMatchesStore = create<ActiveMatchesStoreState>((set) => ({
  matches: [],
  myTurnCount: 0,
  isLoading: false,

  refresh: async () => {
    try {
      set({ isLoading: true });
      const matches = await matchRepository.getMyActiveMatches();
      const myTurnCount = matches.filter((m) => m.myTurn).length;
      set({ matches, myTurnCount, isLoading: false });
    } catch {
      set({ matches: [], myTurnCount: 0, isLoading: false });
    }
  },

  clear: () => {
    set({ matches: [], myTurnCount: 0, isLoading: false });
  },
}));
