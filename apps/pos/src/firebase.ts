import type { AuthService } from './auth/auth-service';
import type { EventSender } from './sync/outbox';

export type FirebaseServices = {
  sender: EventSender;
  auth: AuthService;
};

let cached: Promise<FirebaseServices | undefined> | undefined;

/**
 * Carrega o Firebase só se as variáveis VITE_FIREBASE_* estiverem configuradas
 * (import dinâmico: sem configuração o PDV fica leve e funciona sem sincronizar).
 * O resultado é memorizado, então o app é inicializado uma única vez.
 */
export function loadFirebase(): Promise<FirebaseServices | undefined> {
  cached ??= init();
  return cached;
}

async function init(): Promise<FirebaseServices | undefined> {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !appId) return undefined;

  const [{ initializeApp }, { getFirestore }, { createFirestoreSender }, { createFirebaseAuthService }] =
    await Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
      import('./sync/firestore-sender'),
      import('./auth/firebase-auth'),
    ]);

  const app = initializeApp({
    apiKey,
    projectId,
    appId,
    ...(env.VITE_FIREBASE_AUTH_DOMAIN !== undefined && {
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    }),
  });

  return {
    sender: createFirestoreSender(getFirestore(app)),
    auth: await createFirebaseAuthService(app),
  };
}
