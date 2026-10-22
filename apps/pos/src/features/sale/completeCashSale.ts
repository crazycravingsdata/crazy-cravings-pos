import {
  changeDue,
  orderTotals,
  type CartLine,
  type Cents,
  type Discount,
  type OrderTotals,
} from '@crazy-cravings/domain';
import type {
  InventoryMovement,
  Order,
  OrderLine,
  Payment,
  PosDatabase,
} from '../../db/schema';
import { uuidv7 } from '../../lib/uuid';
import { buildOutboxEvent } from '../../sync/outbox';

export type CompleteCashSaleInput = {
  shiftId: string;
  lines: readonly CartLine[];
  discount?: Discount;
  /** Dinheiro entregue pelo cliente. */
  tendered: Cents;
};

export type CompleteCashSaleResult = {
  orderId: string;
  totals: OrderTotals;
  change: Cents;
};

/**
 * Conclui uma venda em dinheiro. Tudo (pedido, itens, pagamento, baixa de
 * estoque e evento de sincronização) é gravado numa única transação local:
 * ou grava tudo, ou não grava nada. Não depende de internet.
 *
 * Estoque: a venda NUNCA é bloqueada por estoque zerado. O saldo pode ficar
 * negativo e deve ser conferido no fechamento (regra pendente de decisão).
 */
export async function completeCashSale(
  db: PosDatabase,
  input: CompleteCashSaleInput,
  now: number = Date.now(),
): Promise<CompleteCashSaleResult> {
  if (input.lines.length === 0) throw new Error('Carrinho vazio');

  const shift = await db.shifts.get(input.shiftId);
  if (!shift || shift.closedAt !== undefined) throw new Error('Turno não está aberto');

  const totals = input.discount
    ? orderTotals(input.lines, input.discount)
    : orderTotals(input.lines);
  const change = changeDue(totals.total, input.tendered);

  const orderId = uuidv7(now);
  const order: Order = {
    id: orderId,
    vanId: shift.vanId,
    shiftId: shift.id,
    ...(shift.eventId !== undefined && { eventId: shift.eventId }),
    ...(shift.areaId !== undefined && { areaId: shift.areaId }),
    status: 'paid',
    subtotal: totals.subtotal,
    discount: totals.discount,
    hst: totals.hst,
    total: totals.total,
    createdAt: now,
  };

  const lines: OrderLine[] = input.lines.map((l) => ({
    id: uuidv7(now),
    orderId,
    variantId: l.variantId,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
  }));

  const payment: Payment = {
    id: uuidv7(now),
    orderId,
    shiftId: shift.id,
    method: 'cash',
    amount: totals.total,
    tendered: input.tendered,
    change,
    status: 'APPROVED',
    externalRef: uuidv7(now),
    createdAt: now,
  };

  const movements: InventoryMovement[] = input.lines.map((l) => ({
    id: uuidv7(now),
    vanId: shift.vanId,
    variantId: l.variantId,
    qtyDelta: -l.quantity,
    reason: 'sale',
    refId: orderId,
    createdAt: now,
  }));

  await db.transaction(
    'rw',
    [db.orders, db.orderLines, db.payments, db.inventoryMovements, db.outbox],
    async () => {
      await db.orders.add(order);
      await db.orderLines.bulkAdd(lines);
      await db.payments.add(payment);
      await db.inventoryMovements.bulkAdd(movements);
      await db.outbox.add(
        buildOutboxEvent(
          shift.vanId,
          'sale.created',
          { order, lines, payment, movements },
          now,
        ),
      );
    },
  );

  return { orderId, totals, change };
}
