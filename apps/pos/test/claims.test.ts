import { describe, expect, it } from 'vitest';
import { resolveAccess } from '../src/auth/claims';
import { friendlyAuthError } from '../src/auth/firebase-auth';

describe('resolveAccess', () => {
  it('aceita operador com van válida', () => {
    expect(resolveAccess({ role: 'operator', vanId: 'van-01' })).toEqual({
      kind: 'ok',
      role: 'operator',
      vanId: 'van-01',
    });
  });

  it.each([['manager'], ['admin']])('nega %s no caixa e orienta', (role) => {
    const r = resolveAccess({ role, vanId: 'van-01' });
    expect(r.kind).toBe('denied');
    if (r.kind === 'denied') expect(r.reason).toMatch(/manager account/i);
  });

  it('nega conta sem role', () => {
    expect(resolveAccess({}).kind).toBe('denied');
  });

  it('nega role desconhecido', () => {
    expect(resolveAccess({ role: 'superuser', vanId: 'van-01' }).kind).toBe('denied');
  });

  it.each([[undefined], [''], [42], ['Van 01'], ['../van-01'], ['van-01/events']])(
    'nega operador com vanId inválido: %j',
    (vanId) => {
      expect(resolveAccess({ role: 'operator', vanId }).kind).toBe('denied');
    },
  );
});

describe('friendlyAuthError', () => {
  it('traduz credenciais erradas sem revelar se o email existe', () => {
    const msg = 'Wrong email or password.';
    expect(friendlyAuthError('auth/invalid-credential')).toBe(msg);
    expect(friendlyAuthError('auth/user-not-found')).toBe(msg);
    expect(friendlyAuthError('auth/wrong-password')).toBe(msg);
  });

  it('avisa quando falta internet', () => {
    expect(friendlyAuthError('auth/network-request-failed')).toMatch(/internet/i);
  });

  it('tem mensagem padrão para erros desconhecidos', () => {
    expect(friendlyAuthError('auth/algo-novo')).toBe('Could not sign in. Try again.');
    expect(friendlyAuthError(undefined)).toBe('Could not sign in. Try again.');
  });
});
