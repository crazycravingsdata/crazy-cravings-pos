export type AuthState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; uid: string; email: string; role: 'operator'; vanId: string }
  | { kind: 'no-access'; email: string; reason: string };

/** Abstração do login, para o app não depender diretamente do Firebase (e poder ser testado). */
export interface AuthService {
  /** Chama `listener` com o estado atual e a cada mudança. Retorna a função de cancelar. */
  subscribe(listener: (state: AuthState) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}
