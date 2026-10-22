import { beforeEach, describe, expect, it } from 'vitest';
import { cents } from '@crazy-cravings/domain';
import { PosDatabase } from '../src/db/schema';
import { closeShift, openShift, recordCashMovement } from '../src/features/shift/shift';
import { completeCashSale } from '../src/features/sale/completeCashSale';

let db: PosDatabase;
let counter = 0;

beforeEach(async () => {
  counter += 1;
  db = new PosDatabase(`test-db-${counter}`);
  await db.open();
});

const pint = { variantId: 'pint-473', unitPrice: cents(650), quantity: 2 };
const cone = { variantId: 'cone-sm', unitPrice: cents(400), quantity: 1 };

describe('openShift', () => {
  it('abre o turno e enfileira o evento', async () => {
    const shift = await openShift(db, {
      vanId: 'van-01',
      operator: 'ana',
      openingFloat: cents(10_000),
      eventId: 'feira-x',
    });
    expect(shift.closedAt).toBeUndefined();
    expect(shift.eventId).toBe('feira-x');
    const events = await db.outbox.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('shift.opened');
    expect(events[0]?.status).toBe('pending');
  });

  it('impede dois turnos abertos na mesma van', async () => {
    await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    await expect(
      openShift(db, { vanId: 'van-01', operator: 'bia', openingFloat: cents(0) }),
    ).rejects.toThrow('turno aberto');
  });

  it('permite turnos abertos em vans diferentes', async () => {
    await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    await expect(
      openShift(db, { vanId: 'van-02', operator: 'bia', openingFloat: cents(0) }),
    ).resolves.toBeDefined();
  });
});

describe('completeCashSale', () => {
  it('grava pedido, itens, pagamento, estoque e evento numa só transação', async () => {
    const shift = await openShift(db, {
      vanId: 'van-01',
      operator: 'ana',
      openingFloat: cents(10_000),
      areaId: 'area-parque',
    });

    const result = await completeCashSale(db, {
      shiftId: shift.id,
      lines: [pint, cone],
      tendered: cents(2_000),
    });

    expect(result.totals.total).toBe(1921);
    expect(result.change).toBe(79);

    const order = await db.orders.get(result.orderId);
    expect(order?.status).toBe('paid');
    expect(order?.areaId).toBe('area-parque');
    expect(order?.total).toBe(1921);

    expect(await db.orderLines.where('orderId').equals(result.orderId).count()).toBe(2);

    const payments = await db.payments.toArray();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ method: 'cash', amount: 1921, change: 79, status: 'APPROVED' });

    const movements = await db.inventoryMovements.toArray();
    expect(movements.map((m) => m.qtyDelta).sort((a, b) => a - b)).toEqual([-2, -1]);

    const saleEvents = (await db.outbox.toArray()).filter((e) => e.type === 'sale.created');
    expect(saleEvents).toHaveLength(1);
  });

  it('não grava nada se o valor recebido for insuficiente', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    await expect(
      completeCashSale(db, { shiftId: shift.id, lines: [pint], tendered: cents(100) }),
    ).rejects.toThrow();
    expect(await db.orders.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
    expect(await db.inventoryMovements.count()).toBe(0);
  });

  it('rejeita carrinho vazio e turno fechado', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    await expect(
      completeCashSale(db, { shiftId: shift.id, lines: [], tendered: cents(0) }),
    ).rejects.toThrow('Carrinho vazio');

    await closeShift(db, { shiftId: shift.id, countedCash: cents(0) });
    await expect(
      completeCashSale(db, { shiftId: shift.id, lines: [cone], tendered: cents(1000) }),
    ).rejects.toThrow('Turno não está aberto');
  });

  it('não bloqueia venda quando o estoque fica negativo', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    await expect(
      completeCashSale(db, { shiftId: shift.id, lines: [cone], tendered: cents(1000) }),
    ).resolves.toBeDefined();
    const total = (await db.inventoryMovements.toArray()).reduce((s, m) => s + m.qtyDelta, 0);
    expect(total).toBe(-1);
  });

  it('aplica desconto antes do HST', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    const result = await completeCashSale(db, {
      shiftId: shift.id,
      lines: [pint, cone],
      discount: { kind: 'percent', basisPoints: 1000 },
      tendered: cents(2_000),
    });
    expect(result.totals.total).toBe(1729);
  });
});

describe('closeShift', () => {
  it('calcula esperado e diferença (fechamento cego)', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(10_000) });
    await completeCashSale(db, { shiftId: shift.id, lines: [pint, cone], tendered: cents(2_000) });
    await recordCashMovement(db, { shiftId: shift.id, kind: 'in', amount: cents(1_000), reason: 'troco extra' });
    await recordCashMovement(db, { shiftId: shift.id, kind: 'out', amount: cents(500), reason: 'sangria' });

    // esperado = 10000 + 1921 + 1000 - 500 = 12421
    const closed = await closeShift(db, { shiftId: shift.id, countedCash: cents(12_400) });
    expect(closed.expectedCash).toBe(12_421);
    expect(closed.cashDifference).toBe(-21);
    expect(closed.closedAt).toBeDefined();

    const events = (await db.outbox.toArray()).map((e) => e.type);
    expect(events).toContain('shift.closed');
  });

  it('impede fechar duas vezes', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'ana', openingFloat: cents(0) });
    await closeShift(db, { shiftId: shift.id, countedCash: cents(0) });
    await expect(closeShift(db, { shiftId: shift.id, countedCash: cents(0) })).rejects.toThrow('já está fechado');
  });
});
