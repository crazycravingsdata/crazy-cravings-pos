import { useLiveQuery } from 'dexie-react-hooks';
import type { Shift } from '../db/schema';
import { db } from './db';

export const VAN_IDS = ['van-01', 'van-02', 'van-03'] as const;

export type Session = {
  vanId: string | undefined;
  operator: string | undefined;
  /** Turno aberto desta van, se houver. */
  shift: Shift | undefined;
};

export async function saveIdentity(vanId: string, operator: string): Promise<void> {
  await db.meta.bulkPut([
    { key: 'vanId', value: vanId },
    { key: 'operator', value: operator },
  ]);
}

/** undefined enquanto carrega; objeto Session depois. */
export function useSession(): Session | undefined {
  return useLiveQuery(async () => {
    const [van, op] = await Promise.all([db.meta.get('vanId'), db.meta.get('operator')]);
    const vanId = typeof van?.value === 'string' ? van.value : undefined;
    const operator = typeof op?.value === 'string' ? op.value : undefined;
    const shift = vanId
      ? await db.shifts
          .where('vanId')
          .equals(vanId)
          .filter((s) => s.closedAt === undefined)
          .first()
      : undefined;
    return { vanId, operator, shift } satisfies Session;
  }, []);
}
