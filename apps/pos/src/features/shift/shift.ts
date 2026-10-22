import { cashDifference, cents, expectedCash, type Cents } from '@crazy-cravings/domain';
import type { PosDatabase, CashMovement, Shift } from '../../db/schema';
import { uuidv7 } from '../../lib/uuid';
import { buildOutboxEvent } from '../../sync/outbox';

export type OpenShiftInput = {
  vanId: string;
  operator: string;
  openingFloat: Cents;
  eventId?: string;
  areaId?: string;
};

export async function openShift(
  db: PosDatabase,
  input: OpenShiftInput,
  now: number = Date.now(),
): Promise<Shift> {
  const open = await db.shifts
    .where('vanId')
    .equals(input.vanId)
    .filter((s) => s.closedAt === undefined)
    .first();
  if (open) throw new Error('Já existe um turno aberto nesta van');

  const shift: Shift = {
    id: uuidv7(now),
    vanId: input.vanId,
    openedBy: input.operator,
    openingFloat: input.openingFloat,
    openedAt: now,
    ...(input.eventId !== undefined && { eventId: input.eventId }),
    ...(input.areaId !== undefined && { areaId: input.areaId }),
  };

  await db.transaction('rw', db.shifts, db.outbox, async () => {
    await db.shifts.add(shift);
    await db.outbox.add(buildOutboxEvent(shift.vanId, 'shift.opened', shift, now));
  });
  return shift;
}

export async function recordCashMovement(
  db: PosDatabase,
  input: { shiftId: string; kind: 'in' | 'out'; amount: Cents; reason: string },
  now: number = Date.now(),
): Promise<CashMovement> {
  if (input.amount <= 0) throw new Error('Valor da movimentação deve ser positivo');
  const shift = await db.shifts.get(input.shiftId);
  if (!shift || shift.closedAt !== undefined) throw new Error('Turno não está aberto');

  const movement: CashMovement = { id: uuidv7(now), ...input, createdAt: now };
  await db.transaction('rw', db.cashMovements, db.outbox, async () => {
    await db.cashMovements.add(movement);
    await db.outbox.add(buildOutboxEvent(shift.vanId, 'cash.moved', movement, now));
  });
  return movement;
}

/** Soma por tipo das movimentações de caixa de um turno. */
async function cashMovementTotals(db: PosDatabase, shiftId: string) {
  const movements = await db.cashMovements.where('shiftId').equals(shiftId).toArray();
  let cashIn = 0;
  let cashOut = 0;
  for (const m of movements) {
    if (m.kind === 'in') cashIn += m.amount;
    else cashOut += m.amount;
  }
  return { cashIn: cents(cashIn), cashOut: cents(cashOut) };
}

/**
 * Fechamento cego: o operador informa o valor contado sem ver o esperado.
 * O esperado e a diferença são calculados e gravados aqui.
 */
export async function closeShift(
  db: PosDatabase,
  input: { shiftId: string; countedCash: Cents },
  now: number = Date.now(),
): Promise<Shift> {
  return db.transaction(
    'rw',
    [db.shifts, db.payments, db.cashMovements, db.outbox],
    async () => {
      const shift = await db.shifts.get(input.shiftId);
      if (!shift) throw new Error('Turno não encontrado');
      if (shift.closedAt !== undefined) throw new Error('Turno já está fechado');

      const payments = await db.payments.where('shiftId').equals(shift.id).toArray();
      const cashSales = payments
        .filter((p) => p.method === 'cash' && p.status === 'APPROVED')
        .reduce((sum, p) => sum + p.amount, 0);

      const { cashIn, cashOut } = await cashMovementTotals(db, shift.id);
      const expected = expectedCash({
        openingFloat: cents(shift.openingFloat),
        cashSales: cents(cashSales),
        cashIn,
        cashOut,
      });

      const closed: Shift = {
        ...shift,
        closedAt: now,
        countedCash: input.countedCash,
        expectedCash: expected,
        cashDifference: cashDifference(input.countedCash, expected),
      };
      await db.shifts.put(closed);
      await db.outbox.add(buildOutboxEvent(shift.vanId, 'shift.closed', closed, now));
      return closed;
    },
  );
}
