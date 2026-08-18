import { describe, it, expect } from 'vitest';
import { classifyPointerGesture, indexToCoordinate, PAN_DRAG_THRESHOLD_PX } from './gesture';

describe('Caro Gesture & Coordinate Helpers (gesture.ts - P1.3b)', () => {
  describe('classifyPointerGesture (Phân biệt Tap vs Pan)', () => {
    it('nhận diện cử chỉ đứng yên tại chỗ là "tap"', () => {
      const p = { x: 100, y: 100 };
      expect(classifyPointerGesture(p, p)).toBe('tap');
    });

    it('nhận diện cử chỉ dịch chuyển nhỏ dưới ngưỡng (9px <= 10px) là "tap"', () => {
      const start = { x: 50, y: 50 };
      const end = { x: 55, y: 57 }; // distance = sqrt(25 + 49) = sqrt(74) ~= 8.6px
      expect(classifyPointerGesture(start, end, 10)).toBe('tap');
    });

    it('nhận diện cử chỉ dịch chuyển chính xác tại ngưỡng 10px là "tap"', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 6, y: 8 }; // distance = sqrt(36 + 64) = 10px
      expect(classifyPointerGesture(start, end, 10)).toBe('tap');
    });

    it('nhận diện cử chỉ dịch chuyển vượt ngưỡng (11px > 10px) là "pan"', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 8, y: 8 }; // distance = sqrt(64 + 64) = sqrt(128) ~= 11.31px
      expect(classifyPointerGesture(start, end, 10)).toBe('pan');
    });

    it('nhận diện cử chỉ kéo vuốt dài (50px) là "pan"', () => {
      const start = { x: 10, y: 10 };
      const end = { x: 60, y: 10 }; // distance = 50px
      expect(classifyPointerGesture(start, end)).toBe('pan');
    });

    it('sử dụng hằng số ngưỡng PAN_DRAG_THRESHOLD_PX mặc định là 10px', () => {
      expect(PAN_DRAG_THRESHOLD_PX).toBe(10);
    });
  });

  describe('indexToCoordinate (Chuyển đổi Index sang Ký hiệu Tọa độ)', () => {
    it('chuyển đổi đúng các ô góc bàn cờ 15x15 (A1, O1, A15, O15)', () => {
      expect(indexToCoordinate(0, 15)).toBe('A1'); // Góc trên trái (0,0)
      expect(indexToCoordinate(14, 15)).toBe('O1'); // Góc trên phải (14,0)
      expect(indexToCoordinate(210, 15)).toBe('A15'); // Góc dưới trái (0,14)
      expect(indexToCoordinate(224, 15)).toBe('O15'); // Góc dưới phải (14,14)
    });

    it('chuyển đổi đúng ô trung tâm bàn cờ 15x15 (H8 cho index 112)', () => {
      expect(indexToCoordinate(112, 15)).toBe('H8'); // (7,7)
    });

    it('chuyển đổi đúng cho bàn cờ kích thước khác (ví dụ: 11x11, 9x9)', () => {
      expect(indexToCoordinate(60, 11)).toBe('F6'); // (5,5) trung tâm 11x11
      expect(indexToCoordinate(40, 9)).toBe('E5'); // (4,4) trung tâm 9x9
    });

    it('trả về "??" khi index nằm ngoài phạm vi bàn cờ', () => {
      expect(indexToCoordinate(-1, 15)).toBe('??');
      expect(indexToCoordinate(225, 15)).toBe('??');
    });
  });
});
