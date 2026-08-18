import { describe, it, expect } from 'vitest';
import { removeVietnameseTones, formatRelativeTime } from './text';

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

describe('formatRelativeTime Unit Tests (src/core/text.ts - P1.5b)', () => {
  const BASE_TIME = 1700000000000; // Mock fixed timestamp

  it('1. Trả về "Vừa xong" khi thời gian dưới 1 phút', () => {
    const iso = new Date(BASE_TIME - 30 * 1000).toISOString();
    expect(formatRelativeTime(iso, BASE_TIME)).toBe('Vừa xong');
  });

  it('2. Trả về "X phút trước" khi thời gian từ 1 đến 59 phút', () => {
    const iso5m = new Date(BASE_TIME - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso5m, BASE_TIME)).toBe('5 phút trước');

    const iso45m = new Date(BASE_TIME - 45 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso45m, BASE_TIME)).toBe('45 phút trước');
  });

  it('3. Trả về "X giờ trước" khi thời gian từ 1 đến 23 giờ', () => {
    const iso2h = new Date(BASE_TIME - 2 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(iso2h, BASE_TIME)).toBe('2 giờ trước');
  });

  it('4. Trả về "X ngày trước" khi thời gian từ 1 đến 29 ngày', () => {
    const iso3d = new Date(BASE_TIME - 3 * 86400 * 1000).toISOString();
    expect(formatRelativeTime(iso3d, BASE_TIME)).toBe('3 ngày trước');
  });

  it('5. Trả về "Không rõ" khi chuỗi rỗng hoặc không hợp lệ', () => {
    expect(formatRelativeTime('')).toBe('Không rõ');
    expect(formatRelativeTime('invalid-date')).toBe('Không rõ');
  });
});
