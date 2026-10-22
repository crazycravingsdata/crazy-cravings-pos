import { Cents, MoneyError, applyBps, calculateHst, cents } from './money.js';

export type CartLine = {
  readonly variantId: string;
  /** Preço unitário em centavos. */
  readonly unitPrice: Cents;
  /** Quantidade inteira e positiva. */
  readonly quantity: number;
};

export type Discount =
  | { readonly kind: 'percent'; readonly basisPoints: number }
  | { readonly kind: 'fixed'; readonly amount: Cents };

export type OrderTotals = {
  readonly subtotal: Cents;
  readonly discount: Cents;
  readonly taxableBase: Cents;
  readonly hst: Cents;
  readonly total: Cents;
};

function assertLine(line: CartLine): void {
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new MoneyError(`Quantidade inválida para ${line.variantId}`);
  }
  if (line.unitPrice < 0) {
    throw new MoneyError(`Preço negativo para ${line.variantId}`);
  }
}

export function subtotal(lines: readonly CartLine[]): Cents {
  let total = 0;
  for (const line of lines) {
    assertLine(line);
    total += line.unitPrice * line.quantity;
  }
  return cents(total);
}

/** Desconto nunca pode exceder o subtotal. */
export function discountAmount(base: Cents, discount: Discount | undefined): Cents {
  if (!discount) return cents(0);
  const raw =
    discount.kind === 'percent'
      ? applyBps(base, discount.basisPoints)
      : discount.amount;
  if (raw < 0) throw new MoneyError('Desconto não pode ser negativo');
  return cents(Math.min(raw, base));
}

/**
 * Totais do pedido. Ordem fixa:
 * subtotal -> desconto -> base tributável -> HST -> total.
 */
export function orderTotals(
  lines: readonly CartLine[],
  discount?: Discount,
): OrderTotals {
  const sub = subtotal(lines);
  const disc = discountAmount(sub, discount);
  const taxableBase = cents(sub - disc);
  const hst = calculateHst(taxableBase);
  const total = cents(taxableBase + hst);
  return { subtotal: sub, discount: disc, taxableBase, hst, total };
}
