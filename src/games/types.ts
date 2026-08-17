import type React from 'react';
import type { GameDefinition } from '@engines/types';

/**
 * ==============================================================================
 * CÁC KIỂU DỮ LIỆU ĐĂNG KÝ GAME VÀ VIEW PROPS (GAME REGISTRY TYPES)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * - Module này nằm tại tầng `src/games`, được phép import `@engines/types` và React.
 * - Được sử dụng bởi `src/games/registry.ts`, `src/pages` (Router & Menu), và `GameShell`.
 * ==============================================================================
 */

/**
 * Props cơ sở được truyền vào mọi Component View của trò chơi (`src/games/<gameId>/View.tsx`).
 *
 * GHI CHÚ MỞ RỘNG (EXTENSIBILITY):
 * - Phase P0.8 (GameShell) và Phase P1.x sẽ mở rộng props này (ví dụ: `mode`, `onGameOver`, `localPlayerSeat`...).
 * - NGUYÊN TẮC: Chỉ THÊM các trường optional mới, tuyệt đối KHÔNG sửa đổi hoặc xóa các trường đã có.
 */
export interface GameViewProps {
  /** Tờ khai năng lực (Manifest) của trò chơi */
  readonly definition: GameDefinition;
}

/**
 * Cấu trúc một bản ghi trò chơi trong Registry (`RegistryEntry`).
 *
 * GHI CHÚ VỀ LAZY LOADING (CODE-SPLITTING):
 * - `loadView` trả về một Promise chứa default export của Component View, chuẩn hóa để sử dụng trực tiếp với `React.lazy()`.
 * - Người chơi khi ở trang chủ hoặc chơi Game A sẽ KHÔNG phải tải mã nguồn giao diện của Game B.
 */
export interface RegistryEntry {
  /** Metadata và tờ khai năng lực của trò chơi */
  readonly definition: GameDefinition;
  /** Hàm dynamic import giao diện React View của trò chơi */
  readonly loadView: () => Promise<{ default: React.ComponentType<GameViewProps> }>;
}
