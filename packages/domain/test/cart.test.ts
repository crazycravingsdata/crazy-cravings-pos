import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  cents,
  discountAmount,
  orderTotals,
  subtotal,
  type CartLine,
} from '../src/index.js';

const pint: CartLine = { variantId: 'pint-473', unitPrice: cents(650), quantity: 2 };
const cone: CartLine = { variantId: 'cone-sm', unitPrice: cents(400), quantity: 1 };

describe('subtotal', () => {
  it('soma preço unitário vezes quantidade', () => {
    expect(subtotal([pint, cone])).toBe(1700);
  });

  it('retorna zero para carrinho vazio', () => {
    expect(subtotal([])).toBe(0);
  });

  it('rejeita quantidade zero, negativa ou fracionada', () => {
    expect(() => subtotal([{ ...pint, quantity: 0 }])).toThrow(MoneyError);
    expect(() => subtotal([{ ...pint, quantity: -1 }])).toThrow(MoneyError);
    expect(() => subtotal([{ ...pint, quantity: 1.5 }])).toThrow(MoneyError);
  });
});

describe('discountAmount', () => {
  it('aplica desconto percentual (10% = 1000 bps)', () => {
    expect(discountAmount(cents(1700), { kind: 'percent', basisPoints: 1000 })).toBe(170);
  });

  it('aplica desconto fixo', () => {
    expect(discountAmount(cents(1700), { kind: 'fixed', amount: cents(200) })).toBe(200);
  });

  it('limita o desconto ao subtotal', () => {
    expect(discountAmount(cents(500), { kind: 'fixed', amount: cents(9999) })).toBe(500);
  });

  it('retorna zero sem desconto', () => {
    expect(discountAmount(cents(500), undefined)).toBe(0);
  });
});

describe('orderTotals', () => {
  it('calcula sem desconto: HST sobre o subtotal', () => {
    const t = orderTotals([pint, cone]);
    expect(t).toEqual({
      subtotal: 1700,
      discount: 0,
      taxableBase: 1700,
      hst: 221, // 13% de 1700
      total: 1921,
    });
  });

  it('aplica o desconto antes do HST', () => {
    const t = orderTotals([pint, cone], { kind: 'percent', basisPoints: 1000 });
    expect(t.discount).toBe(170);
    expect(t.taxableBase).toBe(1530);
    expect(t.hst).toBe(199); // 13% de 1530 = 198,9 -> 199
    expect(t.total).toBe(1729);
  });

  it('total é sempre base tributável mais HST', () => {
    const t = orderTotals([cone], { kind: 'fixed', amount: cents(100) });
    expect(t.total).toBe(t.taxableBase + t.hst);
  });
});
