import { describe, expect, it } from 'vitest';
import { PIN_ITERATIONS, hashPin, validatePinFormat, verifyPin } from '../src/index.js';

// Poucas iterações só nos testes, para ficarem rápidos.
const FAST = 1_000;

describe('validatePinFormat', () => {
  it.each([['4821'], ['0937'], ['739204'], ['1357'], ['2580']])('aceita %s', (pin) => {
    expect(validatePinFormat(pin)).toBeNull();
  });

  it.each([[''], ['123'], ['1234567'], ['12a4'], ['12 34'], ['-1234'], ['１２３４']])(
    'rejeita formato inválido: %j',
    (pin) => {
      expect(validatePinFormat(pin)).toMatch(/4 to 6 digits/);
    },
  );

  it.each([['1111'], ['0000'], ['999999']])('rejeita dígitos repetidos: %s', (pin) => {
    expect(validatePinFormat(pin)).toMatch(/repeated/);
  });

  it.each([['1234'], ['4321'], ['2345'], ['123456'], ['654321'], ['0123']])(
    'rejeita sequência: %s',
    (pin) => {
      expect(validatePinFormat(pin)).toMatch(/sequence/);
    },
  );
});

describe('hashPin e verifyPin', () => {
  it('verifica o PIN correto', async () => {
    const stored = await hashPin('4821', FAST);
    expect(await verifyPin('4821', stored)).toBe(true);
  });

  it('recusa PIN errado', async () => {
    const stored = await hashPin('4821', FAST);
    expect(await verifyPin('4822', stored)).toBe(false);
    expect(await verifyPin('0000', stored)).toBe(false);
  });

  it('recusa formato inválido sem lançar erro', async () => {
    const stored = await hashPin('4821', FAST);
    expect(await verifyPin('', stored)).toBe(false);
    expect(await verifyPin('48a1', stored)).toBe(false);
  });

  it('gera sal diferente a cada vez, então o mesmo PIN dá hashes diferentes', async () => {
    const a = await hashPin('4821', FAST);
    const b = await hashPin('4821', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin('4821', a)).toBe(true);
    expect(await verifyPin('4821', b)).toBe(true);
  });

  it('nunca guarda o PIN em texto', async () => {
    const stored = await hashPin('739204', FAST);
    expect(JSON.stringify(stored)).not.toContain('739204');
  });

  it('respeita as iterações gravadas no registro', async () => {
    const stored = await hashPin('4821', FAST);
    expect(stored.iterations).toBe(FAST);
    // Mesmo sal e PIN com outra contagem de iterações não pode bater.
    expect(await verifyPin('4821', { ...stored, iterations: FAST + 1 })).toBe(false);
  });

  it('usa 100 mil iterações por padrão', async () => {
    expect(PIN_ITERATIONS).toBe(100_000);
    const stored = await hashPin('4821');
    expect(stored.iterations).toBe(PIN_ITERATIONS);
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('recusa registro corrompido em vez de lançar erro', async () => {
    const stored = await hashPin('4821', FAST);
    expect(await verifyPin('4821', { ...stored, salt: 'zz' })).toBe(false);
    expect(await verifyPin('4821', { ...stored, hash: 'abc' })).toBe(false);
    expect(await verifyPin('4821', { ...stored, hash: stored.hash.slice(0, 32) })).toBe(false);
  });

  it('não cria hash de PIN fraco', async () => {
    await expect(hashPin('1111', FAST)).rejects.toThrow(/repeated/);
    await expect(hashPin('12', FAST)).rejects.toThrow(/4 to 6/);
  });
});
