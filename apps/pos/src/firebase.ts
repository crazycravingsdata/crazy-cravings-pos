import type { EventSender } from './sync/outbox';

/**
 * Cria o enviador do Firestore se as variáveis VITE_FIREBASE_* estiverem
 * configuradas. O SDK do Firebase só é baixado nesse caso (import dinâmico),
 * então sem configuração o PDV fica leve e funciona normalmente, sem sincronizar.
 */
export async function createConfiguredSender(): Promise<EventSender | undefined> {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return undefined;

  const [{ initializeApp }, { getFirestore }, { createFirestoreSender }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
    import('./sync/firestore-sender'),
  ]);

  const app = initializeApp({
    apiKey,
    projectId,
    appId,
    ...(env.VITE_FIREBASE_AUTH_DOMAIN !== undefined && {
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    }),
  });
  return createFirestoreSender(getFirestore(app));
}
