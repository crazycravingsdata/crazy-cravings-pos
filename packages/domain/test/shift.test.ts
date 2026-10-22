import { describe, expect, it } from 'vitest';
import { cashDifference, cents, expectedCash } from '../src/index.js';

describe('expectedCash', () => {
  it('soma fundo, vendas e suprimentos e subtrai sangrias', () => {
    const expected = expectedCash({
      openingFloat: cents(10_000),
      cashSales: cents(25_000),
      cashIn: cents(2_000),
      cashOut: cents(5_000),
    });
    expect(expected).toBe(32_000);
  });

  it('é igual ao fundo quando não houve movimento', () => {
    const expected = expectedCash({
      openingFloat: cents(10_000),
      cashSales: cents(0),
      cashIn: cents(0),
      cashOut: cents(0),
    });
    expect(expected).toBe(10_000);
  });
});

describe('cashDifference', () => {
  it('positivo é sobra', () => {
    expect(cashDifference(cents(32_500), cents(32_000))).toBe(500);
  });

  it('negativo é falta', () => {
    expect(cashDifference(cents(31_000), cents(32_000))).toBe(-1_000);
  });

  it('zero quando bate', () => {
    expect(cashDifference(cents(32_000), cents(32_000))).toBe(0);
  });
});
