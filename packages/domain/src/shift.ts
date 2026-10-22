import { Cents, cents } from './money.js';

export type ExpectedCashInput = {
  /** Fundo de troco informado na abertura. */
  readonly openingFloat: Cents;
  /** Soma dos pagamentos em dinheiro aprovados no turno (valor líquido, sem troco). */
  readonly cashSales: Cents;
  /** Suprimentos: dinheiro colocado no caixa durante o turno. */
  readonly cashIn: Cents;
  /** Sangrias: dinheiro retirado do caixa durante o turno. */
  readonly cashOut: Cents;
};

/** Dinheiro que deveria estar na gaveta no fechamento. */
export function expectedCash(input: ExpectedCashInput): Cents {
  return cents(input.openingFloat + input.cashSales + input.cashIn - input.cashOut);
}

/**
 * Diferença do fechamento: contado menos esperado.
 * Positivo = sobra, negativo = falta.
 */
export function cashDifference(counted: Cents, expected: Cents): Cents {
  return cents(counted - expected);
}
