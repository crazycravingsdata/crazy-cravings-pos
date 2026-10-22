import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  applyBps,
  calculateHst,
  cents,
  changeDue,
} from '../src/index.js';

describe('cents', () => {
  it('aceita inteiros', () => {
    expect(cents(1999)).toBe(1999);
  });

  it('rejeita decimais, NaN e infinito', () => {
    expect(() => cents(19.99)).toThrow(MoneyError);
    expect(() => cents(Number.NaN)).toThrow(MoneyError);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('calculateHst (13%)', () => {
  it('calcula 13% em valor exato', () => {
    expect(calculateHst(cents(1000))).toBe(130);
  });

  it('arredonda metade para cima', () => {
    // 13% de 5 centavos = 0,65 -> 1
    expect(calculateHst(cents(5))).toBe(1);
    // 13% de 3 centavos = 0,39 -> 0
    expect(calculateHst(cents(3))).toBe(0);
  });

  it('retorna zero para base zero', () => {
    expect(calculateHst(cents(0))).toBe(0);
  });

  it('usa aritmética inteira em valores grandes', () => {
    // 13% de 123456789 = 16049382,57 -> 16049383
    expect(calculateHst(cents(123_456_789))).toBe(16_049_383);
  });
});

describe('applyBps', () => {
  it('rejeita taxa acima de 100%', () => {
    expect(() => applyBps(cents(100), 10_001)).toThrow(MoneyError);
  });

  it('rejeita base negativa', () => {
    expect(() => applyBps(cents(-1), 1000)).toThrow(MoneyError);
  });
});

describe('changeDue', () => {
  it('calcula o troco', () => {
    expect(changeDue(cents(1500), cents(2000))).toBe(500);
  });

  it('retorna zero quando o valor é exato', () => {
    expect(changeDue(cents(1500), cents(1500))).toBe(0);
  });

  it('lança erro quando o valor recebido é insuficiente', () => {
    expect(() => changeDue(cents(1500), cents(1000))).toThrow(MoneyError);
  });
});
