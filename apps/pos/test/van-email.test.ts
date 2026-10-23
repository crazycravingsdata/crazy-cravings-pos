import { describe, expect, it } from 'vitest';
import { normalizeVanId, vanEmail } from '../src/auth/van-email';

describe('normalizeVanId', () => {
  it.each([
    ['1', 'van-01'],
    ['01', 'van-01'],
    [' 3 ', 'van-03'],
    ['van-02', 'van-02'],
    ['VAN2', 'van-02'],
    ['12', 'van-12'],
  ])('aceita %j como %s', (input, expected) => {
    expect(normalizeVanId(input)).toBe(expected);
  });

  it.each(['', 'abc', '0', '-1', '1.5', 'van-', '1234'])('rejeita %j', (input) => {
    expect(normalizeVanId(input)).toBeUndefined();
  });
});

describe('vanEmail', () => {
  it('monta o e-mail interno', () => {
    expect(vanEmail('van-01')).toBe('van-01@vans.crazycravings.ca');
    expect(vanEmail('van-01', 'exemplo.ca')).toBe('van-01@exemplo.ca');
  });
});
