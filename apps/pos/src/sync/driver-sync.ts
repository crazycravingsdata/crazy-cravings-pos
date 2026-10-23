import { useEffect } from 'react';
import type { DriverRecord } from '../db/schema';
import { applyDrivers } from '../features/drivers/drivers';
import { db } from '../state/db';

/** Busca a lista de motoristas na nuvem. Deve lançar erro se falhar (sem sinal). */
export type DriverSource = () => Promise<DriverRecord[]>;

const REFRESH_MS = 5 * 60_000;

/**
 * Mantém a lista local de motoristas em dia. Falhas (sem internet) são ignoradas:
 * o tablet continua com a última lista que recebeu, e o início de turno funciona offline.
 */
export function useDriverSync(source: DriverSource | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!source || !enabled) return;
    let cancelled = false;

    const run = async () => {
      try {
        const remote = await source();
        if (!cancelled) await applyDrivers(db, remote);
      } catch {
        // sem sinal: mantém a lista atual
      }
    };

    void run();
    const timer = setInterval(() => void run(), REFRESH_MS);
    window.addEventListener('online', run);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, [source, enabled]);
}
