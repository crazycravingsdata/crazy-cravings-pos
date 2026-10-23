import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthState } from './auth/useAuthState';
import { seedDemoCatalogIfEmpty } from './features/catalog/seed';
import { BlockedScreen } from './features/auth/BlockedScreen';
import { LoginScreen } from './features/auth/LoginScreen';
import { SaleScreen } from './features/sale/SaleScreen';
import { OpenShiftScreen } from './features/shift/OpenShiftScreen';
import { loadFirebase, type FirebaseServices } from './firebase';
import { db } from './state/db';
import { useSession } from './state/session';
import { useDriverSync } from './sync/driver-sync';
import { useSyncEngine } from './sync/useSync';

/** Carrega o Firebase (se configurado) e entrega ao AppView. */
export function App() {
  const [firebase, setFirebase] = useState<FirebaseServices | undefined | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadFirebase()
      .then((fb) => !cancelled && setFirebase(fb))
      // Se o Firebase não carregar, o caixa segue em modo local (sem sincronizar).
      .catch(() => !cancelled && setFirebase(undefined));
    return () => {
      cancelled = true;
    };
  }, []);

  if (firebase === 'loading') return <main className="center-screen" aria-busy="true" />;
  return <AppView firebase={firebase} />;
}

/** Separado do App para poder ser testado com um serviço de login falso. */
export function AppView({ firebase }: { firebase: FirebaseServices | undefined }) {
  const auth = useAuthState(firebase?.auth);
  const signedIn = auth.kind === 'signed-in' ? auth : undefined;

  const session = useSession(signedIn?.vanId);
  // Só sincroniza com conta logada. Em modo local, fica desligado.
  const { status, pending } = useSyncEngine(signedIn ? firebase?.sender : undefined);
  useDriverSync(firebase?.fetchDrivers, signedIn !== undefined);
  const drivers = useLiveQuery(() => db.drivers.toArray(), [], []);

  useEffect(() => {
    if (import.meta.env.VITE_SEED_DEMO === 'false') return;
    void seedDemoCatalogIfEmpty(db);
  }, []);

  const signOut = () => void firebase?.auth.signOut();
  const canSignOut = pending === 0;

  if (auth.kind === 'loading' || !session) {
    return <main className="center-screen" aria-busy="true" />;
  }

  if (auth.kind === 'signed-out' && firebase) return <LoginScreen service={firebase.auth} />;

  if (auth.kind === 'no-access') {
    return (
      <BlockedScreen
        title="No access"
        message={auth.reason}
        email={auth.email}
        canSignOut={canSignOut}
        onSignOut={signOut}
      />
    );
  }

  if (signedIn && session.foreignShift) {
    return (
      <BlockedScreen
        title="Shift open on another van"
        message={`This tablet has an open shift for ${session.foreignShift.vanId}, but you are signed in for ${signedIn.vanId}. Sign out and sign in with the ${session.foreignShift.vanId} account to close it first.`}
        email={signedIn.email}
        canSignOut={canSignOut}
        onSignOut={signOut}
      />
    );
  }

  if (!session.shift) {
    return (
      <OpenShiftScreen
        initialVanId={session.vanId}
        initialOperator={session.operator}
        drivers={drivers}
        {...(signedIn && {
          account: {
            vanId: signedIn.vanId,
            canSignOut,
            onSignOut: signOut,
          },
        })}
      />
    );
  }

  return <SaleScreen shift={session.shift} syncStatus={status} />;
}
