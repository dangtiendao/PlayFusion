import type React from 'react';
import type { GameDefinition, MatchResultReport, Engine } from '@engines/types';
export type { GameDefinition, MatchResultReport, Engine };

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
 * Bộ API tiện ích do GameShell cung cấp cho View của trò chơi.
 * Giúp View gọi âm thanh, rung mà không cần phụ thuộc trực tiếp vào module core, giúp dễ mock khi test.
 */
export interface GameShellApi {
  /** Phát hiệu ứng âm thanh qua Web Audio API của shell */
  readonly playSfx: (key: string, options?: { volume?: number }) => void;
  /** Rung nhẹ phản hồi xúc giác (15ms) */
  readonly hapticTap: () => void;
  /** Rung thành công (mô thức thắng ván) */
  readonly hapticSuccess: () => void;
  /** Rung cảnh báo (mô thức đi sai/thua) */
  readonly hapticError: () => void;
}

/**
 * Props cơ sở được truyền vào mọi Component View của trò chơi (`src/games/<gameId>/View.tsx`).
 *
 * GHI CHÚ MỞ RỘNG (EXTENSIBILITY):
 * - Đã mở rộng tại Phase P0.8c để tích hợp cùng GameShell (`isPaused`, `onGameEnd`, `shellApi`).
 * - NGUYÊN TẮC: Chỉ THÊM các trường optional mới, tuyệt đối KHÔNG sửa đổi hoặc xóa các trường đã có.
 */
export interface GameViewProps {
  /** Tờ khai năng lực (Manifest) của trò chơi (Bất biến từ P0.7a) */
  readonly definition: GameDefinition;
  /** Cờ báo trạng thái trò chơi đang tạm dừng (Pause) do người dùng mở Pause Overlay */
  readonly isPaused?: boolean;
  /** Callback thông báo kết quả khi ván đấu kết thúc (P1.4 màn hình kết thúc & P2.5 lưu lịch sử sẽ tiêu thụ) */
  readonly onGameEnd?: (report: MatchResultReport) => void;
  /** Bộ API tiện ích do GameShell cung cấp (âm thanh, rung) */
  readonly shellApi?: GameShellApi;
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
