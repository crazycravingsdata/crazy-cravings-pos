import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  cents,
  discountAmount,
  orderTotals,
  subtotal,
  type CartLine,
} from '../src/index.js';

const cup: CartLine = { variantId: 'cup', unitPrice: cents(700), quantity: 2 };
const slushy: CartLine = { variantId: 'slushy', unitPrice: cents(500), quantity: 1 };

describe('subtotal', () => {
  it('soma preço unitário vezes quantidade', () => {
    expect(subtotal([cup, slushy])).toBe(1900);
  });

  it('retorna zero para carrinho vazio', () => {
    expect(subtotal([])).toBe(0);
  });

  it('rejeita quantidade zero, negativa ou fracionada', () => {
    expect(() => subtotal([{ ...cup, quantity: 0 }])).toThrow(MoneyError);
    expect(() => subtotal([{ ...cup, quantity: -1 }])).toThrow(MoneyError);
    expect(() => subtotal([{ ...cup, quantity: 1.5 }])).toThrow(MoneyError);
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
  it('sem imposto por padrão: total é o subtotal', () => {
    expect(orderTotals([cup, slushy])).toEqual({
      subtotal: 1900,
      discount: 0,
      taxableBase: 1900,
      hst: 0,
      total: 1900,
    });
  });

  it('aplica o desconto e continua sem imposto', () => {
    const t = orderTotals([cup, slushy], { kind: 'percent', basisPoints: 1000 });
    expect(t.discount).toBe(190);
    expect(t.hst).toBe(0);
    expect(t.total).toBe(1710);
  });

  it('com alíquota explícita, o desconto vem antes do imposto (HST 13%)', () => {
    const t = orderTotals([cup, slushy], { kind: 'percent', basisPoints: 1000 }, 1300);
    expect(t.taxableBase).toBe(1710);
    expect(t.hst).toBe(222); // 13% de 1710 = 222,3 -> 222
    expect(t.total).toBe(1932);
  });

  it('total é sempre base mais imposto', () => {
    const t = orderTotals([slushy], { kind: 'fixed', amount: cents(100) }, 1300);
    expect(t.total).toBe(t.taxableBase + t.hst);
  });
});
