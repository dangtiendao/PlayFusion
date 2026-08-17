import { describe, it, expect } from 'vitest';
import { removeVietnameseTones } from './text';

describe('removeVietnameseTones Unit Tests (src/core/text.ts)', () => {
  it("Case 1: Loại bỏ dấu từ 'Cờ Caro' thành 'co caro'", () => {
    expect(removeVietnameseTones('Cờ Caro')).toBe('co caro');
  });

  it("Case 2: Loại bỏ dấu từ 'Cờ Tướng' thành 'co tuong'", () => {
    expect(removeVietnameseTones('Cờ Tướng')).toBe('co tuong');
  });

  it("Case 3: Xử lý chữ Đ/đ và ký tự đặc biệt 'Đấu máy & Đối kháng'", () => {
    expect(removeVietnameseTones('Đấu máy & Đối kháng')).toBe('dau may & doi khang');
  });

  it("Case 4: Xử lý 'Xếp Hình Trượt (15-Puzzle)' thành 'xep hinh truot (15-puzzle)'", () => {
    expect(removeVietnameseTones('Xếp Hình Trượt (15-Puzzle)')).toBe('xep hinh truot (15-puzzle)');
  });

  it('Case 5: Xử lý chuỗi rỗng và khoảng trắng an toàn', () => {
    expect(removeVietnameseTones('')).toBe('');
    expect(removeVietnameseTones('   ')).toBe('');
  });
});
