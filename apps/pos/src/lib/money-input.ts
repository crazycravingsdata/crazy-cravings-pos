import { cents, type Cents } from '@crazy-cravings/domain';

/**
 * Converte o que o operador digitou ("12", "12.5", "$12.50") em centavos,
 * sem passar por ponto flutuante. Retorna null se for inválido ou vazio.
 */
export function parseMoneyToCents(input: string): Cents | null {
  const s = input.trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const [whole = '', frac = ''] = s.split('.');
  return cents(Number(whole || '0') * 100 + Number(frac.padEnd(2, '0')));
}
