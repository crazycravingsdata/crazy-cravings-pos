import { verifyPin } from '@crazy-cravings/domain';
import type { DriverRecord, PosDatabase } from '../../db/schema';

export const MAX_PIN_FAILURES = 5;
export const PIN_LOCK_MS = 5 * 60_000;

type PinLock = { failures: number; lockedUntil: number };

const lockKey = (driverId: string) => `pinlock:${driverId}`;

async function readLock(db: PosDatabase, driverId: string): Promise<PinLock> {
  const row = await db.meta.get(lockKey(driverId));
  const v = row?.value as Partial<PinLock> | undefined;
  return { failures: v?.failures ?? 0, lockedUntil: v?.lockedUntil ?? 0 };
}

/**
 * Substitui a lista local pela lista da gestão: grava/atualiza os recebidos e
 * remove os que não existem mais lá. Motoristas desativados continuam na lista
 * (com active=false) e só deixam de aparecer na escolha.
 */
export async function applyDrivers(db: PosDatabase, remote: readonly DriverRecord[]): Promise<void> {
  const remoteIds = new Set(remote.map((d) => d.id));
  await db.transaction('rw', db.drivers, db.meta, async () => {
    await db.drivers.bulkPut([...remote]);
    const local = await db.drivers.toCollection().primaryKeys();
    const gone = local.filter((id) => !remoteIds.has(id));
    await db.drivers.bulkDelete(gone);
    await db.meta.bulkDelete(gone.map(lockKey));
  });
}

export type DriverAuthResult =
  | { ok: true; driver: DriverRecord }
  | { ok: false; reason: 'locked'; remainingMs: number }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'unavailable' };

/**
 * Confere o PIN de um motorista. Depois de MAX_PIN_FAILURES erros seguidos, o
 * motorista fica bloqueado por PIN_LOCK_MS. O bloqueio é checado ANTES de
 * calcular o hash, e fica salvo no banco (recarregar a página não zera).
 *
 * Limite honesto: isso freia tentativas na tela, mas quem limpar os dados do
 * navegador zera o contador. É identificação, não autenticação forte.
 */
export async function authenticateDriver(
  db: PosDatabase,
  driverId: string,
  pin: string,
  now: number = Date.now(),
): Promise<DriverAuthResult> {
  const driver = await db.drivers.get(driverId);
  if (!driver || !driver.active) return { ok: false, reason: 'unavailable' };

  const lock = await readLock(db, driverId);
  if (lock.lockedUntil > now) {
    return { ok: false, reason: 'locked', remainingMs: lock.lockedUntil - now };
  }

  const valid = await verifyPin(pin, {
    salt: driver.pinSalt,
    hash: driver.pinHash,
    iterations: driver.pinIterations,
  });

  if (valid) {
    await db.meta.delete(lockKey(driverId));
    return { ok: true, driver };
  }

  const failures = lock.failures + 1;
  if (failures >= MAX_PIN_FAILURES) {
    await db.meta.put({
      key: lockKey(driverId),
      value: { failures: 0, lockedUntil: now + PIN_LOCK_MS } satisfies PinLock,
    });
    return { ok: false, reason: 'locked', remainingMs: PIN_LOCK_MS };
  }
  await db.meta.put({
    key: lockKey(driverId),
    value: { failures, lockedUntil: 0 } satisfies PinLock,
  });
  return { ok: false, reason: 'wrong', attemptsLeft: MAX_PIN_FAILURES - failures };
}
