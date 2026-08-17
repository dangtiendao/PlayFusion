// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storage, STORAGE_PREFIX, zustandStorageAdapter } from './storage';

describe('Storage Manager Unit Tests (src/core/storage.ts)', () => {
  beforeEach(() => {
    storage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    storage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Round-trip: Lưu và đọc thành công Object/Primitive với prefix chuẩn', () => {
    const testData = { name: 'Player1', score: 100, isVip: true };
    const success = storage.setItem('test_profile', testData);
    expect(success).toBe(true);

    const retrieved = storage.getItem('test_profile', null);
    expect(retrieved).toEqual(testData);

    // Xác nhận key thực tế trong localStorage có prefix wgh:v1:
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}test_profile`);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw as string)).toEqual(testData);
  });

  it('2. Fallback khi key không tồn tại', () => {
    const result = storage.getItem('non_existent_key', 'DEFAULT_VAL');
    expect(result).toBe('DEFAULT_VAL');
  });

  it('3. Tự động phục hồi và xóa key rác khi JSON bị hỏng (Corrupted JSON Protection)', () => {
    // Cố tình ghi chuỗi JSON hỏng vào localStorage
    window.localStorage.setItem(`${STORAGE_PREFIX}corrupted_key`, '{invalid_json_data...');

    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue();

    const result = storage.getItem('corrupted_key', { fallback: true });
    expect(result).toEqual({ fallback: true });

    // Xác nhận key hỏng đã bị dọn dẹp khỏi localStorage
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}corrupted_key`)).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('4. removeItem: Xóa chính xác key trong storage', () => {
    storage.setItem('key_to_delete', 'value123');
    expect(storage.getItem('key_to_delete', null)).toBe('value123');

    storage.removeItem('key_to_delete');
    expect(storage.getItem('key_to_delete', null)).toBeNull();
  });

  it('5. clear: Chỉ xóa các key thuộc namespace wgh:v1:, giữ nguyên key bên ngoài', () => {
    storage.setItem('app_key_1', 'val1');
    storage.setItem('app_key_2', 'val2');
    window.localStorage.setItem('other_app_key', 'preserve_me');

    storage.clear();

    expect(storage.getItem('app_key_1', null)).toBeNull();
    expect(storage.getItem('app_key_2', null)).toBeNull();
    expect(window.localStorage.getItem('other_app_key')).toBe('preserve_me');
  });

  it('6. Degrade an toàn về in-memory Map khi localStorage.setItem bị lỗi (QuotaExceeded)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockReturnValue();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === '__wgh_storage_test__') {
        return undefined;
      }
      throw new Error('QuotaExceededError: Dom storage is full');
    });

    const success = storage.setItem('overflow_key', { data: 'important' });
    expect(success).toBe(false);

    // Mặc dù localStorage throw lỗi, dữ liệu vẫn được bảo toàn qua in-memory Map
    const fallbackVal = storage.getItem<{ data: string } | null>('overflow_key', null);
    expect(fallbackVal).toEqual({ data: 'important' });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('7. zustandStorageAdapter: Tương thích hoàn toàn với StateStorage interface của Zustand', () => {
    zustandStorageAdapter.setItem('zustand_test', JSON.stringify({ state: { count: 5 } }));

    const raw = zustandStorageAdapter.getItem('zustand_test');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw as string)).toEqual({ state: { count: 5 } });

    zustandStorageAdapter.removeItem('zustand_test');
    expect(zustandStorageAdapter.getItem('zustand_test')).toBeNull();
  });
});
