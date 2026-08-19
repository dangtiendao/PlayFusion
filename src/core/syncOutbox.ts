/**
 * ==============================================================================
 * SYNC OUTBOX QUEUE (HÀNG ĐỢI ĐỒNG BỘ OFFLINE-FIRST)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. TÍNH ĐỘC LẬP & TRUNG LẬP TẦNG CORE:
 *    - Module này là Generic Queue hoàn toàn độc lập, KHÔNG import Supabase,
 *      KHÔNG import Repositories và KHÔNG gắn liền với bất kỳ trò chơi cụ thể nào.
 *    - Các hàm xử lý thực thi (Executors) được truyền vào qua tham số hàm `processSyncQueue`
 *      (Dependency Injection) bởi tầng ứng dụng (`syncBootstrap.ts`).
 * 2. CƠ CHẾ LƯU TRỮ & TRẦN DUNG LƯỢNG (FIFO):
 *    - Key lưu trữ: 'wgh:v1:sync:outbox'.
 *    - Giới hạn trần: Tối đa 50 items. Nếu vượt quá, tự động cắt bỏ item cũ nhất (FIFO)
 *      kèm cảnh báo console để bảo vệ dung lượng Local Storage và ngăn rác tồn đọng.
 * 3. LUẬT RETRY & CHỐNG NGHẼN HÀNG ĐỢI:
 *    - Xử lý tuần tự từng item.
 *    - Chống chạy chồng: Cờ `isProcessing` đảm bảo 2 tiến trình song song không tranh chấp.
 *    - Lỗi FATAL (hoặc attempts > 10): Tự động gỡ bỏ khỏi queue để không kẹt hàng đợi vĩnh viễn.
 *    - Lỗi RETRYABLE (mất mạng, timeout): Giữ lại item, tăng `attempts += 1`, dừng ngay lượt
 *      xử lý hiện tại để chờ kích hoạt tiếp theo (sự kiện online hoặc ván tiếp theo).
 * ==============================================================================
 */

import { useState, useEffect } from 'react';
import { storage } from './storage';

export const OUTBOX_STORAGE_KEY = 'wgh:v1:sync:outbox';
export const MAX_OUTBOX_CAPACITY = 50;
export const MAX_RETRY_ATTEMPTS = 10;

/**
 * Các loại tác vụ đồng bộ hỗ trợ trong hàng đợi Outbox.
 */
export type OutboxItemKind = 'offline_match';

/**
 * Cấu trúc một phần tử trong hàng đợi Outbox.
 */
export interface OutboxItem {
  /** Định danh duy nhất của tác vụ (ví dụ: matchId của ván cờ) */
  readonly id: string;
  /** Loại tác vụ cần đồng bộ */
  readonly kind: OutboxItemKind;
  /** Dữ liệu payload của tác vụ */
  readonly payload: unknown;
  /** Thời điểm tác vụ được đưa vào hàng đợi (ISO 8601 string) */
  readonly createdAt: string;
  /** Số lần đã thử gửi nhưng thất bại */
  attempts: number;
  /** Lỗi gần nhất gặp phải (nếu có) */
  lastError?: string;
}

/**
 * Kiểu định nghĩa các hàm xử lý cho từng loại tác vụ trong hàng đợi.
 */
export type OutboxExecutors = Record<OutboxItemKind, (payload: unknown) => Promise<void>>;

// Cờ trạng thái chống chạy chồng (Concurrent execution guard)
let isProcessing = false;

// Danh sách các callback lắng nghe thay đổi hàng đợi
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Bỏ qua lỗi trong listener UI
    }
  }
}

/**
 * Đọc toàn bộ danh sách items hiện có trong hàng đợi từ storage.
 */
export function getOutboxItems(): OutboxItem[] {
  const items = storage.getItem<OutboxItem[]>('sync:outbox', []);
  return Array.isArray(items) ? items : [];
}

/**
 * Lưu danh sách items vào storage và phát thông báo cập nhật.
 */
function saveOutboxItems(items: OutboxItem[]): void {
  storage.setItem('sync:outbox', items);
  notifyListeners();
}

/**
 * Đưa một tác vụ mới vào hàng đợi Outbox.
 *
 * @param item Thông tin tác vụ cần đồng bộ (chưa kèm createdAt và attempts).
 * @returns Bản ghi OutboxItem hoàn chỉnh đã được lưu.
 */
export function enqueueOutboxItem(item: Omit<OutboxItem, 'createdAt' | 'attempts'>): OutboxItem {
  const currentItems = getOutboxItems();

  // Kiểm tra trùng lặp ID (Idempotency bảo vệ phía client)
  const existingItem = currentItems.find((i) => i.id === item.id);
  if (existingItem) {
    return existingItem;
  }

  const newItem: OutboxItem = {
    id: item.id,
    kind: item.kind,
    payload: item.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  const updatedItems = [...currentItems, newItem];

  // Kiểm tra trần dung lượng 50 items (FIFO: Cắt bỏ item cũ nhất)
  if (updatedItems.length > MAX_OUTBOX_CAPACITY) {
    const droppedItem = updatedItems.shift();
    if (droppedItem) {
      console.warn(
        `[SyncOutbox] Đạt trần dung lượng ${MAX_OUTBOX_CAPACITY} items. Tự động loại bỏ item cũ nhất:`,
        droppedItem.id,
      );
    }
  }

  saveOutboxItems(updatedItems);
  return newItem;
}

/**
 * Lấy số lượng tác vụ đang chờ đồng bộ trong hàng đợi.
 */
export function getPendingOutboxCount(): number {
  return getOutboxItems().length;
}

/**
 * Xóa toàn bộ các tác vụ bị lỗi FATAL hoặc quá số lần thử tối đa.
 */
export function clearFatalOutboxItems(): void {
  const currentItems = getOutboxItems();
  const validItems = currentItems.filter((item) => item.attempts < MAX_RETRY_ATTEMPTS);
  if (validItems.length !== currentItems.length) {
    saveOutboxItems(validItems);
  }
}

/**
 * Xóa sạch toàn bộ hàng đợi (phục vụ reset hoặc kiểm thử).
 */
export function clearAllOutboxItems(): void {
  storage.removeItem('sync:outbox');
  notifyListeners();
}

/**
 * Đăng ký lắng nghe sự kiện thay đổi của hàng đợi Outbox.
 *
 * @param listener Hàm callback được gọi mỗi khi hàng đợi thêm/bớt item.
 * @returns Hàm hủy đăng ký (unsubscribe).
 */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Xử lý tuần tự các tác vụ trong hàng đợi Outbox thông qua danh sách Executors được cấp.
 *
 * @param executors Đối tượng chứa các hàm xử lý tương ứng với từng loại `kind`.
 * @returns Kết quả số lượng tác vụ đã xử lý thành công và thất bại.
 */
export async function processSyncQueue(
  executors: Partial<OutboxExecutors>,
): Promise<{ done: number; failed: number }> {
  if (isProcessing) {
    return { done: 0, failed: 0 };
  }

  isProcessing = true;
  let doneCount = 0;
  let failedCount = 0;

  try {
    const items = getOutboxItems();

    while (items.length > 0) {
      const currentItem = items[0];
      if (!currentItem) break;

      // 1. Kiểm tra giới hạn số lần thử (Trần 10 lần -> Chuyển thành FATAL và gỡ bỏ)
      if (currentItem.attempts >= MAX_RETRY_ATTEMPTS) {
        console.warn(
          `[SyncOutbox] Tác vụ ${currentItem.id} (${currentItem.kind}) vượt quá ${MAX_RETRY_ATTEMPTS} lần thử. Tự động gỡ bỏ khỏi hàng đợi.`,
        );
        items.shift();
        saveOutboxItems(items);
        failedCount += 1;
        continue;
      }

      const executor = executors[currentItem.kind];
      if (!executor) {
        console.error(
          `[SyncOutbox] Không tìm thấy executor cho loại tác vụ "${currentItem.kind}". Bỏ qua.`,
        );
        items.shift();
        saveOutboxItems(items);
        failedCount += 1;
        continue;
      }

      try {
        // Thực thi gửi tác vụ lên máy chủ
        await executor(currentItem.payload);

        // Gửi thành công: Loại bỏ item khỏi hàng đợi
        items.shift();
        saveOutboxItems(items);
        doneCount += 1;
      } catch (err: unknown) {
        failedCount += 1;
        const isFatalError =
          (typeof err === 'object' &&
            err !== null &&
            'isRetryable' in err &&
            (err as { isRetryable: boolean }).isRetryable === false) ||
          (typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: string }).code === 'FATAL');

        if (isFatalError) {
          // Lỗi FATAL: Dữ liệu vi phạm validate không thể tự sửa -> Gỡ bỏ ngay lập tức
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[SyncOutbox] Loại bỏ tác vụ ${currentItem.id} do lỗi FATAL không thể phục hồi: ${msg}`,
          );
          items.shift();
          saveOutboxItems(items);
          // Tiếp tục xử lý các item tiếp theo trong hàng đợi
          continue;
        } else {
          // Lỗi RETRYABLE (Mất mạng, Timeout): Tăng số lần thử, ghi nhận lỗi và DỪNG lượt xử lý hiện tại
          currentItem.attempts += 1;
          currentItem.lastError = err instanceof Error ? err.message : String(err);
          saveOutboxItems(items);
          break;
        }
      }
    }
  } finally {
    isProcessing = false;
  }

  return { done: doneCount, failed: failedCount };
}

/**
 * React Hook theo dõi số lượng tác vụ đang chờ đồng bộ trong hàng đợi Outbox.
 */
export function useSyncOutboxCount(): number {
  const [count, setCount] = useState<number>(() => getPendingOutboxCount());

  useEffect(() => {
    const unsubscribe = subscribeOutbox(() => {
      setCount(getPendingOutboxCount());
    });
    return unsubscribe;
  }, []);

  return count;
}
