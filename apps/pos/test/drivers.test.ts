import { beforeEach, describe, expect, it } from 'vitest';
import { hashPin } from '@crazy-cravings/domain';
import { PosDatabase, type DriverRecord } from '../src/db/schema';
import {
  MAX_PIN_FAILURES,
  PIN_LOCK_MS,
  applyDrivers,
  authenticateDriver,
} from '../src/features/drivers/drivers';

const FAST = 1_000;
let db: PosDatabase;
let counter = 0;

async function driver(id: string, name: string, pin: string, active = true): Promise<DriverRecord> {
  const h = await hashPin(pin, FAST);
  return { id, name, active, pinSalt: h.salt, pinHash: h.hash, pinIterations: h.iterations, updatedAt: 1 };
}

beforeEach(async () => {
  counter += 1;
  db = new PosDatabase(`drivers-db-${counter}`);
  await db.open();
});

describe('applyDrivers', () => {
  it('grava os motoristas recebidos', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821'), await driver('d2', 'Beto', '7391')]);
    expect((await db.drivers.toArray()).map((d) => d.name).sort()).toEqual(['Ana', 'Beto']);
  });

  it('atualiza quem já existia (troca de PIN e de nome)', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    await applyDrivers(db, [await driver('d1', 'Ana Souza', '9052')]);
    const all = await db.drivers.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('Ana Souza');
    expect((await authenticateDriver(db, 'd1', '9052')).ok).toBe(true);
    expect((await authenticateDriver(db, 'd1', '4821')).ok).toBe(false);
  });

  it('remove quem saiu da lista da gestão e limpa o bloqueio dele', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821'), await driver('d2', 'Beto', '7391')]);
    await authenticateDriver(db, 'd2', '0000');
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    expect((await db.drivers.toArray()).map((d) => d.id)).toEqual(['d1']);
    expect(await db.meta.get('pinlock:d2')).toBeUndefined();
  });

  it('uma lista vazia limpa tudo', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    await applyDrivers(db, []);
    expect(await db.drivers.count()).toBe(0);
  });
});

describe('authenticateDriver', () => {
  it('aceita o PIN correto e devolve o motorista', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    const r = await authenticateDriver(db, 'd1', '4821');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.driver.name).toBe('Ana');
  });

  it('recusa PIN errado e conta as tentativas restantes', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    const r = await authenticateDriver(db, 'd1', '1357');
    expect(r).toEqual({ ok: false, reason: 'wrong', attemptsLeft: MAX_PIN_FAILURES - 1 });
  });

  it('bloqueia depois de 5 erros seguidos', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    const now = 1_000_000;
    for (let i = 0; i < MAX_PIN_FAILURES - 1; i += 1) {
      await authenticateDriver(db, 'd1', '1357', now);
    }
    const last = await authenticateDriver(db, 'd1', '1357', now);
    expect(last).toEqual({ ok: false, reason: 'locked', remainingMs: PIN_LOCK_MS });
  });

  it('bloqueado recusa até o PIN certo, sem nem calcular o hash', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    const now = 1_000_000;
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) await authenticateDriver(db, 'd1', '1357', now);
    const r = await authenticateDriver(db, 'd1', '4821', now + 60_000);
    expect(r).toEqual({ ok: false, reason: 'locked', remainingMs: PIN_LOCK_MS - 60_000 });
  });

  it('libera depois do tempo de bloqueio', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    const now = 1_000_000;
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) await authenticateDriver(db, 'd1', '1357', now);
    const r = await authenticateDriver(db, 'd1', '4821', now + PIN_LOCK_MS + 1);
    expect(r.ok).toBe(true);
  });

  it('o bloqueio sobrevive a recarregar o app (fica no banco)', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    const now = 1_000_000;
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) await authenticateDriver(db, 'd1', '1357', now);
    const reopened = new PosDatabase(`drivers-db-${counter}`);
    await reopened.open();
    const r = await authenticateDriver(reopened, 'd1', '4821', now + 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('locked');
  });

  it('acerto zera a contagem de erros', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821')]);
    for (let i = 0; i < MAX_PIN_FAILURES - 1; i += 1) await authenticateDriver(db, 'd1', '1357');
    expect((await authenticateDriver(db, 'd1', '4821')).ok).toBe(true);
    const r = await authenticateDriver(db, 'd1', '1357');
    expect(r).toEqual({ ok: false, reason: 'wrong', attemptsLeft: MAX_PIN_FAILURES - 1 });
  });

  it('o bloqueio de um motorista não afeta os outros', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821'), await driver('d2', 'Beto', '7391')]);
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) await authenticateDriver(db, 'd1', '1357');
    expect((await authenticateDriver(db, 'd2', '7391')).ok).toBe(true);
  });

  it('motorista desativado ou inexistente fica indisponível', async () => {
    await applyDrivers(db, [await driver('d1', 'Ana', '4821', false)]);
    expect(await authenticateDriver(db, 'd1', '4821')).toEqual({ ok: false, reason: 'unavailable' });
    expect(await authenticateDriver(db, 'nao-existe', '4821')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
