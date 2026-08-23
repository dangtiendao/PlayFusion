import { describe, it, expect } from 'vitest';
import { computeOffset, calculateRemainingMs, formatMmSs } from './serverClock';

describe('Server Clock Drift & Remaining Time Unit Tests (src/core/serverClock.ts - P3.4c)', () => {
  it('1. computeOffset tính chính xác độ lệch khi client nhanh hơn server', () => {
    const serverNow = '2026-08-23T00:00:00.000Z'; // 1787443200000
    const localNow = new Date('2026-08-23T00:01:00.000Z').getTime(); // Client nhanh hơn 1 phút (+60,000ms)

    const offset = computeOffset(serverNow, localNow);
    expect(offset).toBe(-60000);
  });

  it('2. computeOffset tính chính xác độ lệch khi client chậm hơn server', () => {
    const serverNow = '2026-08-23T00:05:00.000Z';
    const localNow = new Date('2026-08-23T00:00:00.000Z').getTime(); // Client chậm hơn 5 phút (-300,000ms)

    const offset = computeOffset(serverNow, localNow);
    expect(offset).toBe(300000);
  });

  it('3. calculateRemainingMs trả về thời gian chuẩn theo giờ server kể cả khi client lệch giờ lớn', () => {
    const serverNow = new Date('2026-08-23T12:00:00.000Z').getTime();
    const deadlineIso = '2026-08-23T12:05:00.000Z'; // Còn 5 phút (300,000ms) theo giờ server

    // Client bị lệch chạy nhanh 1 giờ (+3,600,000ms)
    const clientLocalNow = serverNow + 3600000;
    const offset = computeOffset('2026-08-23T12:00:00.000Z', clientLocalNow); // -3,600,000

    const remaining = calculateRemainingMs(deadlineIso, offset, clientLocalNow);
    expect(remaining).toBe(300000);
  });

  it('4. calculateRemainingMs trả về <= 0 khi đã quá deadline', () => {
    const deadlineIso = '2026-08-23T12:00:00.000Z';
    const serverNow = new Date('2026-08-23T12:00:10.000Z').getTime(); // Quá 10s

    const offset = 0;
    const remaining = calculateRemainingMs(deadlineIso, offset, serverNow);
    expect(remaining).toBe(-10000);
  });

  it('5. formatMmSs định dạng chính xác các mốc thời gian', () => {
    expect(formatMmSs(300000)).toBe('05:00');
    expect(formatMmSs(299100)).toBe('05:00'); // làm tròn lên giây
    expect(formatMmSs(298000)).toBe('04:58');
    expect(formatMmSs(59000)).toBe('00:59');
    expect(formatMmSs(5000)).toBe('00:05');
    expect(formatMmSs(0)).toBe('00:00');
    expect(formatMmSs(-5000)).toBe('00:00');
  });
});
