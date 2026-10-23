// Testes das regras do Firestore. Precisam do emulador: rode com `pnpm --filter @crazy-cravings/infra test:rules`.
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-crazy-cravings',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

const operator = (vanId) => env.authenticatedContext(`op-${vanId}`, { role: 'operator', vanId });
const manager = () => env.authenticatedContext('mgr', { role: 'manager' });
const admin = () => env.authenticatedContext('adm', { role: 'admin' });

const event = (vanId, extra = {}) => ({
  vanId,
  type: 'sale.created',
  payload: { n: 1 },
  createdAt: 1_700_000_000_000,
  ...extra,
});
const eventRef = (ctx, vanId, id = 'ev1') => doc(ctx.firestore(), `vans/${vanId}/events/${id}`);

async function seedEvent(vanId, id = 'ev1') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `vans/${vanId}/events/${id}`), event(vanId));
  });
}

describe('eventos de venda: criação', () => {
  it('operador cria evento na própria van', async () => {
    await assertSucceeds(setDoc(eventRef(operator('van-01'), 'van-01'), event('van-01')));
  });

  it('operador NÃO cria evento em outra van', async () => {
    await assertFails(setDoc(eventRef(operator('van-01'), 'van-02'), event('van-02')));
  });

  it('operador NÃO grava evento com vanId diferente do caminho', async () => {
    await assertFails(setDoc(eventRef(operator('van-01'), 'van-01'), event('van-02')));
  });

  it('operador sem claim vanId é negado', async () => {
    const ctx = env.authenticatedContext('x', { role: 'operator' });
    await assertFails(setDoc(eventRef(ctx, 'van-01'), event('van-01')));
  });

  it('sem login é negado', async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(setDoc(eventRef(ctx, 'van-01'), event('van-01')));
  });

  it('gerente NÃO cria eventos de venda', async () => {
    await assertFails(setDoc(eventRef(manager(), 'van-01'), event('van-01')));
  });

  it('rejeita campo extra', async () => {
    await assertFails(
      setDoc(eventRef(operator('van-01'), 'van-01'), event('van-01', { extra: true })),
    );
  });

  it('rejeita tipo de evento desconhecido', async () => {
    await assertFails(
      setDoc(eventRef(operator('van-01'), 'van-01'), event('van-01', { type: 'hack' })),
    );
  });

  it('rejeita payload que não seja objeto', async () => {
    await assertFails(
      setDoc(eventRef(operator('van-01'), 'van-01'), event('van-01', { payload: 'texto' })),
    );
  });
});

describe('eventos de venda: reenvio e exclusão', () => {
  it('aceita reenvio idêntico (idempotência)', async () => {
    await seedEvent('van-01');
    await assertSucceeds(setDoc(eventRef(operator('van-01'), 'van-01'), event('van-01')));
  });

  it('recusa reenvio com conteúdo alterado', async () => {
    await seedEvent('van-01');
    await assertFails(
      setDoc(eventRef(operator('van-01'), 'van-01'), event('van-01', { payload: { n: 999 } })),
    );
  });

  it('ninguém apaga eventos, nem o admin', async () => {
    await seedEvent('van-01');
    await assertFails(deleteDoc(eventRef(operator('van-01'), 'van-01')));
    await assertFails(deleteDoc(eventRef(admin(), 'van-01')));
  });
});

describe('eventos de venda: leitura', () => {
  it('operador lê a própria van', async () => {
    await seedEvent('van-01');
    await assertSucceeds(getDoc(eventRef(operator('van-01'), 'van-01')));
  });

  it('operador NÃO lê outra van', async () => {
    await seedEvent('van-02');
    await assertFails(getDoc(eventRef(operator('van-01'), 'van-02')));
  });

  it('gerente lê qualquer van', async () => {
    await seedEvent('van-02');
    await assertSucceeds(getDoc(eventRef(manager(), 'van-02')));
  });
});

describe('catálogo e cadastro de vans', () => {
  const catalogRef = (ctx) => doc(ctx.firestore(), 'catalog/products');
  const vanRef = (ctx) => doc(ctx.firestore(), 'vans/van-01');

  it('qualquer conta logada lê o catálogo', async () => {
    await assertSucceeds(getDoc(catalogRef(operator('van-01'))));
  });

  it('operador NÃO altera o catálogo', async () => {
    await assertFails(setDoc(catalogRef(operator('van-01')), { a: 1 }));
  });

  it('gerente altera o catálogo', async () => {
    await assertSucceeds(setDoc(catalogRef(manager()), { a: 1 }));
  });

  it('só admin cadastra vans', async () => {
    await assertFails(setDoc(vanRef(manager()), { name: 'Van 1' }));
    await assertSucceeds(setDoc(vanRef(admin()), { name: 'Van 1' }));
  });

  describe('motoristas', () => {
    const driverRef = (ctx) => doc(ctx.firestore(), 'drivers/d1');
    const driver = {
      name: 'Ana',
      active: true,
      pinSalt: 'aa',
      pinHash: 'bb',
      pinIterations: 100000,
      updatedAt: 1,
    };

    it('o tablet da van lê a lista de motoristas', async () => {
      await assertSucceeds(getDoc(driverRef(operator('van-01'))));
    });

    it('sem login não lê a lista', async () => {
      await assertFails(getDoc(driverRef(env.unauthenticatedContext())));
    });

    it('o tablet da van NÃO cadastra nem altera motoristas', async () => {
      await assertFails(setDoc(driverRef(operator('van-01')), driver));
    });

    it('o gerente cadastra e altera motoristas', async () => {
      await assertSucceeds(setDoc(driverRef(manager()), driver));
    });
  });

  it('coleções desconhecidas são negadas', async () => {
    const ref = doc(admin().firestore(), 'segredos/x');
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { a: 1 }));
  });
});
