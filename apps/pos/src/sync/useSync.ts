import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createConfiguredSender } from '../firebase';
import { db } from '../state/db';
import { flushOutbox, type EventSender } from './outbox';

export type SyncStatus =
  | { kind: 'disabled' }
  | { kind: 'offline'; pending: number }
  | { kind: 'pending'; pending: number }
  | { kind: 'synced' };

const FLUSH_INTERVAL_MS = 30_000;

export function useSync(): SyncStatus {
  const pending = useLiveQuery(() => db.outbox.where('status').equals('pending').count(), [], 0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [sender, setSender] = useState<EventSender | undefined>();

  useEffect(() => {
    let cancelled = false;
    void createConfiguredSender().then((s) => {
      if (!cancelled) setSender(() => s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!sender) return { kind: 'disabled' };
  if (!online) return { kind: 'offline', pending };
  if (pending > 0) return { kind: 'pending', pending };
  return { kind: 'synced' };
}
