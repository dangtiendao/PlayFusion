import { describe, it, expect } from 'vitest';
import { caroMovesCodec, CaroMovesCodec } from './moves-codec';
import { EngineError } from '../types';

describe('Caro Moves Codec (moves-codec.ts - P2.5a)', () => {
  it('1. Round-trip: encode -> decode -> encode trả về kết quả giống hệt nhau', () => {
    const originalMoves = [112, 97, 113, 98, 127, 83, 142];
    const encoded = caroMovesCodec.encodeMoves(originalMoves);
    expect(encoded).toBe('112,97,113,98,127,83,142');

    const decoded = caroMovesCodec.decodeMoves(encoded);
    expect(decoded).toEqual(originalMoves);

    const reEncoded = caroMovesCodec.encodeMoves(decoded);
    expect(reEncoded).toBe(encoded);
  });

  it('2. Xử lý ván cờ 0 nước đi: mảng rỗng <-> chuỗi rỗng', () => {
    expect(caroMovesCodec.encodeMoves([])).toBe('');
    expect(caroMovesCodec.decodeMoves('')).toEqual([]);
    expect(caroMovesCodec.decodeMoves('   ')).toEqual([]);
  });

  it('3. Ném lỗi EngineError("INVALID_STATE") khi gặp chuỗi rác hoặc sai định dạng', () => {
    const invalidStrings = [
      'abc',
      '112,xyz,113',
      '112,12.5,113',
      '112,-5,113',
      '112,,113',
      '112, 97, 113a',
    ];

    for (const invalid of invalidStrings) {
      expect(() => caroMovesCodec.decodeMoves(invalid)).toThrow(EngineError);
      try {
        caroMovesCodec.decodeMoves(invalid);
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect((err as EngineError).code).toBe('INVALID_STATE');
      }
    }
  });

  it('4. Ước tính kích thước chuỗi nén cho ván cờ 60 nước (Tối ưu hóa Free Tier Database)', () => {
    // Giả lập ván 60 nước trên bàn 15x15 (các chỉ số từ 0 đến 224)
    const moves60 = Array.from({ length: 60 }, (_, i) => (i * 3 + 10) % 225);
    const encoded = caroMovesCodec.encodeMoves(moves60);

    const byteLength = new TextEncoder().encode(encoded).length;
    // Mỗi nước tốn trung bình 2-3 ký tự + dấu phẩy -> Tổng kích thước <= 250 bytes
    expect(byteLength).toBeLessThan(250);
    expect(byteLength).toBeGreaterThan(150);

    // Giải mã lại ván 60 nước hoàn toàn chính xác
    expect(caroMovesCodec.decodeMoves(encoded)).toEqual(moves60);
  });

  it('5. Cho phép khởi tạo instance độc lập của CaroMovesCodec', () => {
    const codec = new CaroMovesCodec();
    expect(codec.encodeMoves([1, 2, 3])).toBe('1,2,3');
    expect(codec.decodeMoves('1,2,3')).toEqual([1, 2, 3]);
  });
});
