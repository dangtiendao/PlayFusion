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

export { createMatchChannel, type MatchChannel } from './matchChannel';
export type {
  ChannelStatus,
  TransportEnvelope,
  PresenceMember,
  MatchChannelHandlers,
} from './types';
