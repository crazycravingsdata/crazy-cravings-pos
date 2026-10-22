/**
 * Interpreta os custom claims do Firebase Auth e decide se a conta pode
 * operar o caixa. Só contas `operator` com `vanId` válido entram. Gerentes e
 * admins usam o painel do escritório (a criar), não o caixa da van.
 */

export type AccessResult =
  | { kind: 'ok'; role: 'operator'; vanId: string }
  | { kind: 'denied'; reason: string };

const VAN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function resolveAccess(claims: Record<string, unknown>): AccessResult {
  const role = claims.role;
  const vanId = claims.vanId;

  if (role === 'manager' || role === 'admin') {
    return {
      kind: 'denied',
      reason:
        'This is a manager account. Sign in with an operator account to use the register.',
    };
  }
  if (role !== 'operator') {
    return {
      kind: 'denied',
      reason: 'This account has no access yet. Ask an administrator to set it up.',
    };
  }
  if (typeof vanId !== 'string' || !VAN_ID_PATTERN.test(vanId)) {
    return {
      kind: 'denied',
      reason: 'This operator account is not assigned to a van. Ask an administrator.',
    };
  }
  return { kind: 'ok', role: 'operator', vanId };
}
