/**
 * Valor monetário em centavos inteiros (CAD).
 * Nunca use ponto flutuante para dinheiro.
 */
export type Cents = number & { readonly __brand: 'Cents' };

/** Alíquota HST de Ontário: 13,00%, em basis points (1 bp = 0,01%). */
export const HST_RATE_BPS = 1300;

const BPS_DENOMINATOR = 10_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Valida e converte um número inteiro em centavos. */
export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Valor monetário deve ser inteiro em centavos: ${value}`);
  }
  return value as Cents;
}

/**
 * Multiplica um valor por uma taxa em basis points, arredondando
 * metade para cima (half-up), com aritmética inteira.
 * Só aceita valores não negativos.
 */
export function applyBps(base: Cents, bps: number): Cents {
  if (base < 0) throw new MoneyError('Base não pode ser negativa');
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) {
    throw new MoneyError(`Taxa inválida em basis points: ${bps}`);
  }
  return cents(Math.floor((base * bps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR));
}

/** HST sobre a base tributável (subtotal menos descontos). */
export function calculateHst(taxableBase: Cents): Cents {
  return applyBps(taxableBase, HST_RATE_BPS);
}

/**
 * Troco em dinheiro. Lança erro se o valor recebido for insuficiente,
 * porque isso indica erro de operação e não deve virar troco negativo.
 */
export function changeDue(total: Cents, tendered: Cents): Cents {
  if (tendered < total) {
    throw new MoneyError('Valor recebido menor que o total');
  }
  return cents(tendered - total);
}

export function formatCad(value: Cents, locale = 'en-CA'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'CAD' }).format(
    value / 100,
  );
}
