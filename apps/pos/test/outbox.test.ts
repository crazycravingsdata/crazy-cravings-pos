import { beforeEach, describe, expect, it } from 'vitest';
import { PosDatabase, type OutboxEvent } from '../src/db/schema';
import { buildOutboxEvent, flushOutbox } from '../src/sync/outbox';

let db: PosDatabase;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = new PosDatabase(`outbox-db-${counter}`);
  await db.open();
});

async function seed(n: number) {
  for (let i = 0; i < n; i += 1) {
    await db.outbox.add(buildOutboxEvent('van-01', 'sale.created', { n: i }, 1_700_000_000_000 + i));
  }
}

describe('flushOutbox', () => {
  it('envia tudo em ordem de criação e marca como enviado', async () => {
    await seed(3);
    const order: number[] = [];
    const result = await flushOutbox(db, async (e) => {
      order.push((e.payload as { n: number }).n);
    });
    expect(result).toEqual({ sent: 3, failed: false, remaining: 0 });
    expect(order).toEqual([0, 1, 2]);
    expect(await db.outbox.where('status').equals('pending').count()).toBe(0);
  });

  it('para no primeiro erro e mantém o restante pendente (sem sinal)', async () => {
    await seed(3);
    let calls = 0;
    const result = await flushOutbox(db, async () => {
      calls += 1;
      if (calls === 2) throw new Error('offline');
    });
    expect(result).toEqual({ sent: 1, failed: true, remaining: 2 });
    const pending = await db.outbox.where('status').equals('pending').sortBy('createdAt');
    expect(pending).toHaveLength(2);
    expect(pending[0]?.attempts).toBe(1);
    expect(pending[1]?.attempts).toBe(0);
  });

  it('retoma de onde parou quando o sinal volta', async () => {
    await seed(3);
    await flushOutbox(db, async () => {
      throw new Error('offline');
    });
    const sentIds: string[] = [];
    const result = await flushOutbox(db, async (e) => {
      sentIds.push(e.id);
    });
    expect(result.sent).toBe(3);
    expect(new Set(sentIds).size).toBe(3);
  });

  it('reenvia com o mesmo ID se a confirmação se perdeu (idempotência)', async () => {
    await seed(1);
    const seen: OutboxEvent[] = [];
    // Primeira tentativa: o destino recebe, mas a confirmação "se perde" (lança erro).
    await flushOutbox(db, async (e) => {
      seen.push(e);
      throw new Error('timeout depois de gravar');
    });
    await flushOutbox(db, async (e) => {
      seen.push(e);
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.id).toBe(seen[1]?.id);
  });

  it('não faz nada quando não há pendentes', async () => {
    const result = await flushOutbox(db, async () => {
      throw new Error('não deveria chamar');
    });
    expect(result).toEqual({ sent: 0, failed: false, remaining: 0 });
  });
});
