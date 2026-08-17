import { describe, it, expect } from 'vitest';
import { idx, xy, inBounds } from './board';

describe('Caro Board Helpers', () => {
  describe('idx and xy conversion', () => {
    it('chuyển đổi chính xác các tọa độ góc và tâm bàn cờ 15x15', () => {
      const size = 15;

      // Góc trên cùng bên trái (0, 0)
      expect(idx(0, 0, size)).toBe(0);
      expect(xy(0, size)).toEqual({ x: 0, y: 0 });

      // Góc trên cùng bên phải (14, 0)
      expect(idx(14, 0, size)).toBe(14);
      expect(xy(14, size)).toEqual({ x: 14, y: 0 });

      // Góc dưới cùng bên trái (0, 14)
      expect(idx(0, 14, size)).toBe(210);
      expect(xy(210, size)).toEqual({ x: 0, y: 14 });

      // Góc dưới cùng bên phải (14, 14)
      expect(idx(14, 14, size)).toBe(224);
      expect(xy(224, size)).toEqual({ x: 14, y: 14 });

      // Tâm bàn cờ (7, 7) -> 7 * 15 + 7 = 112
      expect(idx(7, 7, size)).toBe(112);
      expect(xy(112, size)).toEqual({ x: 7, y: 7 });
    });

    it('bảo toàn tính nghịch đảo 100% cho mọi ô cờ trên bàn 15x15', () => {
      const size = 15;
      const totalCells = size * size;

      for (let index = 0; index < totalCells; index++) {
        const coords = xy(index, size);
        const reconstructedIdx = idx(coords.x, coords.y, size);
        expect(reconstructedIdx).toBe(index);
      }

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const flatIdx = idx(x, y, size);
          const reconstructedCoords = xy(flatIdx, size);
          expect(reconstructedCoords).toEqual({ x, y });
        }
      }
    });

    it('hoạt động chính xác với kích thước bàn cờ khác (5x5 và 19x19)', () => {
      expect(idx(2, 3, 5)).toBe(17);
      expect(xy(17, 5)).toEqual({ x: 2, y: 3 });

      expect(idx(10, 10, 19)).toBe(200);
      expect(xy(200, 19)).toEqual({ x: 10, y: 10 });
    });
  });

  describe('inBounds', () => {
    it('trả về true cho các tọa độ hợp lệ trong bàn cờ 15x15', () => {
      const size = 15;
      expect(inBounds(0, 0, size)).toBe(true);
      expect(inBounds(14, 0, size)).toBe(true);
      expect(inBounds(0, 14, size)).toBe(true);
      expect(inBounds(14, 14, size)).toBe(true);
      expect(inBounds(7, 7, size)).toBe(true);
    });

    it('trả về false cho các tọa độ ngoài phạm vi bàn cờ', () => {
      const size = 15;

      // Âm biên
      expect(inBounds(-1, 0, size)).toBe(false);
      expect(inBounds(0, -1, size)).toBe(false);
      expect(inBounds(-5, -5, size)).toBe(false);

      // Quá biên phải / dưới
      expect(inBounds(15, 0, size)).toBe(false);
      expect(inBounds(0, 15, size)).toBe(false);
      expect(inBounds(15, 15, size)).toBe(false);
      expect(inBounds(100, 100, size)).toBe(false);
    });
  });
});
