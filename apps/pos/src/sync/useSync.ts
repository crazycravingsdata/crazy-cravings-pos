import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../state/db';
import { flushOutbox, type EventSender } from './outbox';

export type SyncStatus =
  | { kind: 'disabled' }
  | { kind: 'offline'; pending: number }
  | { kind: 'pending'; pending: number }
  | { kind: 'synced' };

export type SyncEngine = {
  status: SyncStatus;
  /** Eventos ainda não enviados, em qualquer estado de conexão. */
  pending: number;
};

const FLUSH_INTERVAL_MS = 30_000;

/**
 * Motor de sincronização. Deve rodar no nível do app (não dentro de uma tela),
 * para continuar enviando, por exemplo, o evento de fechamento depois que a
 * tela de venda sai de cena. `sender` indefinido = sincronização desligada
 * (modo local, ou conta ainda não logada).
 */
export function useSyncEngine(sender: EventSender | undefined): SyncEngine {
  const pending = useLiveQuery(() => db.outbox.where('status').equals('pending').count(), [], 0);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!sender || !online) return;
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await flushOutbox(db, sender);
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sender, online, pending]);

  let status: SyncStatus;
  if (!sender) status = { kind: 'disabled' };
  else if (!online) status = { kind: 'offline', pending };
  else if (pending > 0) status = { kind: 'pending', pending };
  else status = { kind: 'synced' };

  return { status, pending };
}
