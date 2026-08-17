import type { StateStorage } from 'zustand/middleware';

/**
 * ==============================================================================
 * MODULE QUẢN LÝ LƯU TRỮ CỤC BỘ AN TOÀN (STORAGE MANAGER)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & QUY TẮC AN TOÀN:
 * 1. NAMESPACE & SCHEMA VERSIONING:
 *    - Toàn bộ dữ liệu của Web Game Hub được gắn tiền tố `wgh:v1:` (ví dụ: `wgh:v1:settings`).
 *    - Phân tách dữ liệu rõ ràng với các ứng dụng khác cùng domain, dễ dàng quản lý vòng đời.
 * 2. CHỐNG CRASH KHI DỮ LIỆU BỊ HỎNG (CORRUPTED JSON PROTECTION):
 *    - Mọi thao tác `JSON.parse` được bọc trong try/catch.
 *    - Nếu dữ liệu bị hỏng (do sửa tay hoặc bug), hàm tự động xóa key rác và trả về fallback an toàn.
 * 3. BẢO VỆ HẠN NGẠCH (QUOTA EXCEEDED PROTECTION):
 *    - `setItem` bắt lỗi `QuotaExceededError` và ghi tạm vào `memoryStorage` in-memory fallback,
 *      trả về `false` mà không làm văng exception ra UI.
 * 4. HỖ TRỢ TRÌNH DUYỆT ẨN DANH / PRIVATE BROWSING (GRACEFUL DEGRADATION):
 *    - Nếu `localStorage` bị chặn (Safari Private mode cũ hoặc iframe sandboxed), hệ thống
 *      tự động chuyển sang sử dụng `Map` in-memory để ứng dụng tiếp tục hoạt động mà không bị crash.
 * ==============================================================================
 */

export const STORAGE_PREFIX = 'wgh:v1:';

/** Bộ nhớ in-memory dự phòng khi localStorage không khả dụng hoặc bị tràn hạn ngạch */
const memoryStorage = new Map<string, string>();

/**
 * Kiểm tra xem môi trường hiện tại có hỗ trợ và cho phép ghi vào localStorage hay không.
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  try {
    const testKey = '__wgh_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tạo key đầy đủ có chứa namespace và version.
 */
function getNamespacedKey(key: string): string {
  return key.startsWith(STORAGE_PREFIX) ? key : `${STORAGE_PREFIX}${key}`;
}

export const storage = {
  /**
   * Lấy và parse an toàn dữ liệu từ localStorage hoặc in-memory fallback.
   *
   * @param key Tên key (không cần thêm tiền tố `wgh:v1:`).
   * @param fallback Giá trị mặc định trả về nếu key không tồn tại hoặc dữ liệu bị hỏng.
   * @returns Dữ liệu đã parse kiểu T hoặc giá trị fallback.
   */
  getItem<T>(key: string, fallback: T): T {
    const namespacedKey = getNamespacedKey(key);

    try {
      let raw: string | null = null;
      if (isLocalStorageAvailable()) {
        raw = window.localStorage.getItem(namespacedKey);
      }

      // Nếu không tìm thấy trong localStorage, kiểm tra trong bộ nhớ in-memory
      if (raw === null || raw === undefined) {
        raw = memoryStorage.get(namespacedKey) ?? null;
      }

      if (raw === null || raw === undefined) {
        return fallback;
      }

      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(
        `[Storage] Dữ liệu tại key "${namespacedKey}" bị hỏng hoặc không đúng định dạng JSON. Đang khôi phục về fallback:`,
        err,
      );
      // Tự động dọn dẹp key hỏng để tránh gây lỗi cho các lần đọc tiếp theo
      this.removeItem(key);
      return fallback;
    }
  },

  /**
   * Lưu dữ liệu vào localStorage an toàn với serialize JSON.
   *
   * @param key Tên key.
   * @param value Giá trị cần lưu (hỗ trợ object, array, primitive).
   * @returns `true` nếu lưu thành công vào localStorage, `false` nếu bị vượt hạn ngạch hoặc lỗi.
   */
  setItem<T>(key: string, value: T): boolean {
    const namespacedKey = getNamespacedKey(key);

    try {
      const serialized = JSON.stringify(value);

      if (isLocalStorageAvailable()) {
        window.localStorage.setItem(namespacedKey, serialized);
        // Đồng bộ xóa fallback nếu đã lưu thành công vào localStorage
        memoryStorage.delete(namespacedKey);
        return true;
      }

      memoryStorage.set(namespacedKey, serialized);
      return true;
    } catch (err) {
      console.error(
        `[Storage] Không thể ghi dữ liệu vào key "${namespacedKey}" (Có thể do đầy hạn ngạch QuotaExceeded):`,
        err,
      );
      // Ghi tạm vào bộ nhớ in-memory để phiên hiện tại không bị gián đoạn
      try {
        memoryStorage.set(namespacedKey, JSON.stringify(value));
      } catch {
        // Bỏ qua nếu in-memory cũng thất bại
      }
      return false;
    }
  },

  /**
   * Xóa một key cụ thể khỏi storage.
   *
   * @param key Tên key cần xóa.
   */
  removeItem(key: string): void {
    const namespacedKey = getNamespacedKey(key);
    try {
      if (isLocalStorageAvailable()) {
        window.localStorage.removeItem(namespacedKey);
      }
      memoryStorage.delete(namespacedKey);
    } catch (err) {
      console.warn(`[Storage] Không thể xóa key "${namespacedKey}":`, err);
    }
  },

  /**
   * Xóa toàn bộ các key thuộc phạm vi namespace `wgh:v1:` của ứng dụng.
   */
  clear(): void {
    try {
      if (isLocalStorageAvailable()) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(STORAGE_PREFIX)) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          window.localStorage.removeItem(key);
        }
      }
      memoryStorage.clear();
    } catch (err) {
      console.warn('[Storage] Lỗi khi dọn dẹp storage namespace:', err);
    }
  },

  /**
   * Khung di chuyển lược đồ dữ liệu (Schema Migration Framework).
   *
   * GHI CHÚ KIẾN TRÚC:
   * Hiện tại dự án đang ở version schema `v1`. Khi sau này có thay đổi lớn về cấu trúc
   * dữ liệu (ví dụ sang v2), kỹ sư sẽ tăng tiền tố sang `wgh:v2:` và viết hàm đọc dữ liệu cũ
   * từ `wgh:v1:` chuyển đổi sang `wgh:v2:` tại hàm này.
   */
  migrateStorage(): void {
    // Khung migration v1 (hiện tại chưa có phiên bản cũ v0 để migrate)
  },
};

/**
 * Custom Storage Adapter tương thích với middleware `persist` của Zustand.
 */
export const zustandStorageAdapter: StateStorage = {
  getItem: (name: string): string | null => {
    const data = storage.getItem<unknown>(name, null);
    if (data === null || data === undefined) {
      return null;
    }
    return typeof data === 'string' ? data : JSON.stringify(data);
  },
  setItem: (name: string, value: string): void => {
    try {
      const parsed = JSON.parse(value) as unknown;
      storage.setItem(name, parsed);
    } catch {
      storage.setItem(name, value);
    }
  },
  removeItem: (name: string): void => {
    storage.removeItem(name);
  },
};

export default storage;
