import { useEffect, useState } from 'react';
import type { Shift } from './db/schema';
import { seedDemoCatalogIfEmpty } from './features/catalog/seed';
import { SaleScreen } from './features/sale/SaleScreen';
import { OpenShiftScreen } from './features/shift/OpenShiftScreen';
import { db } from './state/db';
import { useSession } from './state/session';

export function App() {
  const session = useSession();
  const [lastClosed, setLastClosed] = useState<Shift | undefined>();

  useEffect(() => {
    if (import.meta.env.VITE_SEED_DEMO === 'false') return;
    void seedDemoCatalogIfEmpty(db);
  }, []);

  if (!session) return <main className="center-screen" aria-busy="true" />;

  if (!session.shift) {
    return (
      <OpenShiftScreen
        initialVanId={session.vanId}
        initialOperator={session.operator}
        lastClosed={lastClosed}
      />
    );
  }

  return <SaleScreen shift={session.shift} onShiftClosed={setLastClosed} />;
}
