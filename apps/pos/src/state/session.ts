import { useLiveQuery } from 'dexie-react-hooks';
import type { Shift } from '../db/schema';
import { db } from './db';

export const VAN_IDS = ['van-01', 'van-02', 'van-03'] as const;

export type Session = {
  vanId: string | undefined;
  operator: string | undefined;
  /** Turno aberto desta van, se houver. */
  shift: Shift | undefined;
  /** Turno aberto neste tablet que pertence a OUTRA van (dinheiro em aberto de outra conta). */
  foreignShift: Shift | undefined;
};

export async function saveIdentity(vanId: string, operator: string): Promise<void> {
  await db.meta.bulkPut([
    { key: 'vanId', value: vanId },
    { key: 'operator', value: operator },
  ]);
}

/**
 * undefined enquanto carrega; objeto Session depois.
 * `forcedVanId`: van definida pela conta logada. Quando presente, ela vale mais
 * do que a van salva localmente, para o operador não poder escolher outra.
 */
export function useSession(forcedVanId: string | undefined): Session | undefined {
  return useLiveQuery(async () => {
    const [van, op] = await Promise.all([db.meta.get('vanId'), db.meta.get('operator')]);
    const stored = typeof van?.value === 'string' ? van.value : undefined;
    const vanId = forcedVanId ?? stored;
    const operator = typeof op?.value === 'string' ? op.value : undefined;

    const openShifts = await db.shifts.filter((s) => s.closedAt === undefined).toArray();
    const shift = vanId ? openShifts.find((s) => s.vanId === vanId) : undefined;
    const foreignShift =
      forcedVanId !== undefined ? openShifts.find((s) => s.vanId !== forcedVanId) : undefined;

    return { vanId, operator, shift, foreignShift } satisfies Session;
  }, [forcedVanId]);
}
