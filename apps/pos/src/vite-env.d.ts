/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Defina como 'false' para não carregar o catálogo de demonstração. */
  readonly VITE_SEED_DEMO?: string;
  /** Defina como 'false' para não gravar a posição da van durante o turno. */
  readonly VITE_TRACKING?: string;
}
