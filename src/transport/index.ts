/**
 * ==============================================================================
 * CỔNG XUẤT KHẨU CÔNG KHAI TẦNG REALTIME TRANSPORT (SRC/TRANSPORT/INDEX.TS)
 * ==============================================================================
 *
 * QUY ƯỚC KIẾN TRÚC:
 * - Đây là Barrel File xuất khẩu công khai DUY NHẤT của tầng `src/transport/`.
 * - Toàn bộ các module bên ngoài (`src/games`, `src/pages`, `src/components`,
 *   `src/stores`) CHỈ ĐƯỢC PHÉP import từ file này hoặc alias `@/transport`.
 * - Mọi hành vi import sâu vào các file nội bộ (như `@/transport/matchChannel`)
 *   đều bị chặn bởi rule `no-deep-transport-imports` của dependency-cruiser.
 * ==============================================================================
 */

// 1. Lõi Transport Thuần (P3.1a)
export { createMatchChannel, type MatchChannel } from './matchChannel';
export type {
  ChannelStatus,
  TransportEnvelope,
  PresenceMember,
  MatchChannelHandlers,
} from './types';

// 2. React Hook Quản Lý Vòng Đời (P3.1b)
export {
  useMatchChannel,
  type UseMatchChannelOptions,
  type UseMatchChannelResult,
} from './useMatchChannel';

// 3. Selectors & Store Phản Chiếu Trạng Thái (P3.1b)
export {
  useTransportStore,
  useTransportStatus,
  useChannelMembers,
  useTransportActiveChannelId,
  useTransportLastError,
  type TransportState,
  type TransportActions,
  type TransportStore,
} from '@/stores/transportStore';
