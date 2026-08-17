import { describe, it, expectTypeOf } from 'vitest';
import { dummyEngine, type DummyState, type DummyMove } from './engine';
import { dummyManifest } from './manifest';
import type { Engine, GameDefinition } from '../types';

describe('Dummy Engine Type-Level Verification (TypeScript Contract Tests)', () => {
  it('DummyEngine phải tương thích hoàn toàn với Interface Engine<DummyState, DummyMove>', () => {
    expectTypeOf(dummyEngine).toMatchTypeOf<Engine<DummyState, DummyMove>>();
  });

  it('DummyManifest phải tương thích hoàn toàn với Interface GameDefinition', () => {
    expectTypeOf(dummyManifest).toMatchTypeOf<GameDefinition>();
  });

  it('Các chữ ký hàm bắt buộc phải có kiểu trả về đúng chuẩn', () => {
    expectTypeOf(dummyEngine.init).toBeFunction();
    expectTypeOf(dummyEngine.legalMoves).toBeFunction();
    expectTypeOf(dummyEngine.applyMove).toBeFunction();
    expectTypeOf(dummyEngine.currentPlayer).toBeFunction();
    expectTypeOf(dummyEngine.isTerminal).toBeFunction();
    expectTypeOf(dummyEngine.serialize).toBeFunction();
    expectTypeOf(dummyEngine.deserialize).toBeFunction();
  });
});
