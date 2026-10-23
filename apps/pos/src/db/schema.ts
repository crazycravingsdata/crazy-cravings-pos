import Dexie, { type Table } from 'dexie';

/** Todos os valores monetários são inteiros em centavos (CAD). */

export type Category = { id: string; name: string; sortOrder: number; updatedAt: number };

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  sku?: string;
  active: boolean;
  updatedAt: number;
};

export type Variant = {
  id: string;
  productId: string;
  label: string;
  priceCents: number;
  updatedAt: number;
};

/**
 * Motorista cadastrado pela gestão. Vem do Firestore (coleção `drivers`) e fica
 * salvo no tablet para o início de turno funcionar offline. Guarda só o hash do PIN.
 */
export type DriverRecord = {
  id: string;
  name: string;
  active: boolean;
  pinSalt: string;
  pinHash: string;
  pinIterations: number;
  updatedAt: number;
};

export type Shift = {
  id: string;
  vanId: string;
  /** Nome do motorista que abriu o turno. */
  openedBy: string;
  /** Motorista identificado por PIN (ausente no modo local, sem login). */
  driverId?: string;
  openingFloat: number;
  openedAt: number;
  /** Feira ou evento do dia, quando houver. */
  eventId?: string;
  areaId?: string;
  closedAt?: number;
  countedCash?: number;
  expectedCash?: number;
  cashDifference?: number;
};

export type CashMovement = {
  id: string;
  shiftId: string;
  kind: 'in' | 'out';
  amount: number;
  reason: string;
  createdAt: number;
};

export type OrderStatus = 'open' | 'paid' | 'voided' | 'refunded';

export type Order = {
  id: string;
  vanId: string;
  shiftId: string;
  eventId?: string;
  areaId?: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  hst: number;
  total: number;
  createdAt: number;
};

export type OrderLine = {
  id: string;
  orderId: string;
  variantId: string;
  unitPrice: number;
  quantity: number;
};

export type PaymentMethod = 'cash' | 'clover_card';
export type PaymentStatus =
  | 'PENDING'
  | 'AWAITING_CUSTOMER'
  | 'APPROVED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type Payment = {
  id: string;
  orderId: string;
  shiftId: string;
  method: PaymentMethod;
  /** Valor líquido da venda (sem troco). */
  amount: number;
  /** Dinheiro entregue pelo cliente e troco devolvido (apenas dinheiro). */
  tendered?: number;
  change?: number;
  status: PaymentStatus;
  /** Chave de idempotência nossa. */
  externalRef: string;
  cloverPaymentId?: string;
  createdAt: number;
};

export type InventoryReason = 'sale' | 'load' | 'return' | 'adjust';

export type InventoryMovement = {
  id: string;
  vanId: string;
  variantId: string;
  /** Positivo entra, negativo sai. */
  qtyDelta: number;
  reason: InventoryReason;
  refId?: string;
  createdAt: number;
};

export type OutboxEventType =
  | 'shift.opened'
  | 'shift.closed'
  | 'sale.created'
  | 'cash.moved'
  | 'inventory.moved'
  | 'location.recorded';

export type OutboxStatus = 'pending' | 'sent';

export type OutboxEvent = {
  /** UUID v7 gerado no tablet. É também o ID do documento no Firestore. */
  id: string;
  vanId: string;
  type: OutboxEventType;
  payload: unknown;
  createdAt: number;
  attempts: number;
  status: OutboxStatus;
  sentAt?: number;
};

export type Meta = { key: string; value: unknown };

export class PosDatabase extends Dexie {
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  variants!: Table<Variant, string>;
  shifts!: Table<Shift, string>;
  cashMovements!: Table<CashMovement, string>;
  orders!: Table<Order, string>;
  orderLines!: Table<OrderLine, string>;
  payments!: Table<Payment, string>;
  inventoryMovements!: Table<InventoryMovement, string>;
  outbox!: Table<OutboxEvent, string>;
  meta!: Table<Meta, string>;
  drivers!: Table<DriverRecord, string>;

  constructor(name = 'crazy-cravings-pos') {
    super(name);
    this.version(1).stores({
      categories: 'id, sortOrder',
      products: 'id, categoryId, active, updatedAt',
      variants: 'id, productId',
      shifts: 'id, vanId, openedAt, closedAt',
      cashMovements: 'id, shiftId',
      orders: 'id, vanId, shiftId, status, createdAt',
      orderLines: 'id, orderId',
      payments: 'id, orderId, shiftId, &externalRef, status',
      inventoryMovements: 'id, vanId, variantId, createdAt',
      outbox: 'id, status, createdAt',
      meta: 'key',
    });
    // v2: lista local de motoristas (identificação por PIN).
    this.version(2).stores({
      drivers: 'id, active',
    });
  }
}
