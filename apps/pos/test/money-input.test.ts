import { describe, expect, it } from 'vitest';
import { parseMoneyToCents } from '../src/lib/money-input';

describe('parseMoneyToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['$12.50', 1250],
    ['12,50', 1250],
    ['0.05', 5],
    ['.5', 50],
    ['12.', 1200],
    ['  20 ', 2000],
  ])('converte %s em %i centavos', (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each([[''], ['abc'], ['-5'], ['1.234'], ['1e3'], ['12345678'], ['$'], ['.']])(
    'rejeita %j',
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );

  it('evita erro de ponto flutuante (19.99)', () => {
    expect(parseMoneyToCents('19.99')).toBe(1999);
    expect(parseMoneyToCents('0.29')).toBe(29);
  });
});
