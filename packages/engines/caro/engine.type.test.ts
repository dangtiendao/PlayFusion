import { describe, it, expectTypeOf } from 'vitest';
import { caroEngine } from './engine';
import type { CaroState, CaroMove } from './types';
import type { Engine } from '../types';

describe('Caro Engine Type-Level Verification (TypeScript Contract Tests)', () => {
  it('caroEngine phải tương thích hoàn toàn với Interface Engine<CaroState, CaroMove>', () => {
    expectTypeOf(caroEngine).toMatchTypeOf<Engine<CaroState, CaroMove>>();
  });

  it('Các chữ ký hàm bắt buộc phải có kiểu trả về đúng chuẩn', () => {
    expectTypeOf(caroEngine.init).toBeFunction();
    expectTypeOf(caroEngine.legalMoves).toBeFunction();
    expectTypeOf(caroEngine.applyMove).toBeFunction();
    expectTypeOf(caroEngine.currentPlayer).toBeFunction();
    expectTypeOf(caroEngine.isTerminal).toBeFunction();
    expectTypeOf(caroEngine.serialize).toBeFunction();
    expectTypeOf(caroEngine.deserialize).toBeFunction();
  });
});
