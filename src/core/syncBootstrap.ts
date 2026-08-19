/**
 * ==============================================================================
 * SYNC BOOTSTRAP (ĐẤU NỐI VÒNG ĐỜI HÀNG ĐỢI ĐỒNG BỘ VÀO ỨNG DỤNG)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. ĐIỂM TIẾP HỢP GIỮA CORE VÀ REPOSITORIES (DEPENDENCY INJECTION):
 *    - Tầng `src/core/syncOutbox.ts` giữ queue trung lập.
 *    - Module `syncBootstrap.ts` này chịu trách nhiệm nạp (bơm) executor cụ thể từ
 *      `src/repositories/matchRepository.ts` vào hàng đợi.
 * 2. VÒNG ĐỜI TỰ ĐỘNG ĐỒNG BỘ:
 *    - (a) Khi khởi động ứng dụng (gọi sau khi Auth hoàn tất khởi tạo).
 *    - (b) Khi thiết bị bắt được kết nối mạng trở lại (sự kiện window `online`).
 *    - (c) Ngay sau khi một ván đấu kết thúc (`enqueueAndSyncMatch`) nếu thiết bị đang Online.
 * ==============================================================================
 */

import { recordOfflineMatch } from '../repositories/matchRepository';
import type { RecordOfflineMatchParams } from '../repositories/types';
import {
  enqueueOutboxItem,
  processSyncQueue,
  type OutboxExecutors,
  type OutboxItem,
} from './syncOutbox';

/**
 * Kiểu phần tử Outbox chuyên biệt cho tác vụ ghi nhận ván đấu offline.
 */
export type OfflineMatchOutboxItem = OutboxItem<RecordOfflineMatchParams>;

/**
 * Danh sách các hàm xử lý gửi dữ liệu lên máy chủ cho từng loại tác vụ trong Outbox.
 */
const syncExecutors: OutboxExecutors = {
  offline_match: async (payload: RecordOfflineMatchParams) => {
    await recordOfflineMatch(payload);
  },
};

/**
 * Kích hoạt xử lý hàng đợi Outbox nếu thiết bị đang có mạng.
 */
export async function triggerSync(): Promise<{ done: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { done: 0, failed: 0 };
  }
  return processSyncQueue(syncExecutors);
}

/**
 * Đưa một ván đấu offline vào hàng đợi và tự động đồng bộ ngay nếu đang online.
 *
 * @param params Tham số chi tiết ván đấu cần ghi nhận.
 * @returns Bản ghi OutboxItem vừa được tạo trong hàng đợi.
 */
export function enqueueAndSyncMatch(params: RecordOfflineMatchParams): OfflineMatchOutboxItem {
  const item = enqueueOutboxItem<RecordOfflineMatchParams>({
    id: params.matchId,
    kind: 'offline_match',
    payload: params,
  });

  // Nếu đang online, cố gắng đồng bộ ngay lập tức trong nền (không chặn UI)
  if (typeof navigator === 'undefined' || navigator.onLine) {
    triggerSync().catch((err) => {
      console.warn('[SyncBootstrap] Lỗi khi kích hoạt đồng bộ tức thì:', err);
    });
  }

  return item;
}

let isInitialized = false;

const noop = () => {
  /* noop */
};

/**
 * Khởi tạo lắng nghe vòng đời kết nối mạng và kích hoạt đồng bộ ban đầu.
 */
export function initSyncBootstrap(): () => void {
  if (isInitialized) {
    return noop;
  }
  isInitialized = true;

  // 1. Thử đồng bộ ngay khi khởi động
  triggerSync().catch(() => {
    /* ignore */
  });

  // 2. Lắng nghe sự kiện khi thiết bị có mạng trở lại
  const handleOnline = () => {
    console.info(
      '[SyncBootstrap] Thiết bị đã kết nối mạng trở lại. Đang đồng bộ dữ liệu Outbox...',
    );
    triggerSync().catch((err) => {
      console.warn('[SyncBootstrap] Lỗi khi xử lý hàng đợi sau khi online:', err);
    });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    isInitialized = false;
  };
}
