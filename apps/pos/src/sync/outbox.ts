import type { PosDatabase, OutboxEvent, OutboxEventType } from '../db/schema';
import { uuidv7 } from '../lib/uuid';

/** Envia um evento ao destino (Firestore em produção). Deve lançar erro se falhar. */
export type EventSender = (event: OutboxEvent) => Promise<void>;

export function buildOutboxEvent(
  vanId: string,
  type: OutboxEventType,
  payload: unknown,
  now: number = Date.now(),
): OutboxEvent {
  return {
    id: uuidv7(now),
    vanId,
    type,
    payload,
    createdAt: now,
    attempts: 0,
    status: 'pending',
  };
}

export type FlushResult = {
  sent: number;
  /** Falhou e parou. Os eventos restantes continuam pendentes para o próximo ciclo. */
  failed: boolean;
  remaining: number;
};

/**
 * Envia os eventos pendentes em ordem de criação. Para no primeiro erro
 * (sem sinal): os demais seguem pendentes. Reenviar um evento é seguro,
 * porque o ID do documento de destino é o ID do evento (idempotente).
 */
export async function flushOutbox(
  db: PosDatabase,
  send: EventSender,
  now: () => number = Date.now,
): Promise<FlushResult> {
  const pending = await db.outbox.where('status').equals('pending').sortBy('createdAt');
  let sent = 0;

  for (const event of pending) {
    try {
      await send(event);
    } catch {
      await db.outbox.update(event.id, { attempts: event.attempts + 1 });
      return { sent, failed: true, remaining: pending.length - sent };
    }
    await db.outbox.update(event.id, { status: 'sent', sentAt: now() });
    sent += 1;
  }

  return { sent, failed: false, remaining: 0 };
}
