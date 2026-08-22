/**
 * ==============================================================================
 * STORE PHẢN CHIẾU TRẠNG THÁI REALTIME TRANSPORT (SRC/STORES/TRANSPORTSTORE.TS)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & NGUYÊN TẮC BẤT BIẾN:
 * 1. QUẢN LÝ TRẠNG THÁI IN-MEMORY (KHÔNG PERSIST):
 *    - Trạng thái kết nối chỉ tồn tại trong phiên sống của phòng đấu / ván cờ.
 *    - Tuyệt đối không dùng persist middleware (tránh lưu trữ trạng thái kết nối cũ sau khi tải lại trang).
 * 2. STORE CHỈ PHẢN CHIẾU TRẠNG THÁI ĐỂ UI ĐỌC:
 *    - Store chỉ lưu trữ dữ liệu phẳng (`activeChannelId`, `status`, `members`, `lastError`)
 *      để các component UI (Badge kết nối, Danh sách đấu thủ trong phòng, Thanh thông báo lỗi)
 *      có thể subscribe phản ứng nhanh.
 *    - Vòng đời kết nối (tạo channel, connect, disconnect) do hook `useMatchChannel` quản lý độc quyền.
 * 3. TUYỆT ĐỐI KHÔNG GIỮ THAM CHIẾU INSTANCE CHANNEL TRONG STORE:
 *    - Việc lưu trữ đối tượng `MatchChannel` hoặc `RealtimeChannel` trong Store toàn cục
 *      là nguồn rò rỉ kết nối kinh điển khi xảy ra React Fast Refresh / Hot-Reload.
 * ==============================================================================
 */

import { create } from 'zustand';
import type { ChannelStatus, PresenceMember } from '@/transport/types';

/**
 * Trạng thái dữ liệu của tầng Realtime Transport.
 */
export interface TransportState {
  /** Mã định danh kênh đang kết nối (matchId / roomCode) hoặc null nếu chưa kết nối */
  readonly activeChannelId: string | null;
  /** Trạng thái kết nối hiện tại của kênh ván đấu */
  readonly status: ChannelStatus;
  /** Danh sách thành viên hiện diện trong phòng (đã sắp xếp tăng dần theo joinedAt) */
  readonly members: readonly PresenceMember[];
  /** Thông điệp lỗi chi tiết gần nhất nếu có sự cố kết nối */
  readonly lastError: string | null;
}

/**
 * Các hàm cập nhật trạng thái nội bộ do hook `useMatchChannel` gọi.
 */
export interface TransportActions {
  /** Cập nhật ID kênh đang kích hoạt */
  readonly setActiveChannelId: (id: string | null) => void;
  /** Cập nhật trạng thái vòng đời của kênh */
  readonly setStatus: (status: ChannelStatus) => void;
  /** Cập nhật danh sách thành viên hiện diện */
  readonly setMembers: (members: PresenceMember[]) => void;
  /** Cập nhật thông tin lỗi kết nối */
  readonly setLastError: (error: string | null) => void;
  /** Đưa toàn bộ trạng thái về mặc định khi rời phòng / unmount */
  readonly reset: () => void;
}

export type TransportStore = TransportState & TransportActions;

const initialState: TransportState = {
  activeChannelId: null,
  status: 'idle',
  members: [],
  lastError: null,
};

/**
 * Zustand Store phản chiếu trạng thái kết nối Realtime Transport.
 */
export const useTransportStore = create<TransportStore>((set) => ({
  ...initialState,

  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setStatus: (status) => set({ status }),
  setMembers: (members) => set({ members }),
  setLastError: (lastError) => set({ lastError }),
  reset: () => set(initialState),
}));

// ==============================================================================
// SELECTORS TIỆN ÍCH CHO GIAO DIỆN UI
// ==============================================================================

/** Hook lấy trạng thái kết nối hiện tại của kênh Realtime */
export const useTransportStatus = (): ChannelStatus => useTransportStore((s) => s.status);

/** Hook lấy danh sách thành viên hiện diện trong phòng đấu */
export const useChannelMembers = (): readonly PresenceMember[] =>
  useTransportStore((s) => s.members);

/** Hook lấy ID kênh đang kích hoạt */
export const useTransportActiveChannelId = (): string | null =>
  useTransportStore((s) => s.activeChannelId);

/** Hook lấy thông điệp lỗi kết nối gần nhất */
export const useTransportLastError = (): string | null => useTransportStore((s) => s.lastError);

export default useTransportStore;
