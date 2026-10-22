import type { FirebaseApp } from 'firebase/app';
import type { AuthService, AuthState } from './auth-service';
import { resolveAccess } from './claims';

/** Traduz códigos de erro do Firebase em mensagens que o operador entende. */
export function friendlyAuthError(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/user-disabled':
      return 'This account is disabled. Ask an administrator.';
    case 'auth/network-request-failed':
      return 'No internet connection. The first sign-in needs internet.';
    default:
      return 'Could not sign in. Try again.';
  }
}

export async function createFirebaseAuthService(app: FirebaseApp): Promise<AuthService> {
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = await import(
    'firebase/auth'
  );
  const auth = getAuth(app);

  return {
    subscribe(listener) {
      listener({ kind: 'loading' });
      return onAuthStateChanged(auth, (user) => {
        if (!user) return listener({ kind: 'signed-out' });
        const email = user.email ?? user.uid;
        // getIdTokenResult(false) usa o token em cache: funciona offline com sessão já salva.
        user
          .getIdTokenResult(false)
          .then((result): AuthState => {
            const access = resolveAccess(result.claims);
            return access.kind === 'ok'
              ? { kind: 'signed-in', uid: user.uid, email, role: access.role, vanId: access.vanId }
              : { kind: 'no-access', email, reason: access.reason };
          })
          .catch(
            (): AuthState => ({
              kind: 'no-access',
              email,
              reason: 'Could not read this account. Check your connection and try again.',
            }),
          )
          .then(listener);
      });
    },

    async signIn(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code: unknown }).code)
            : undefined;
        throw new Error(friendlyAuthError(code));
      }
    },

    async signOut() {
      await signOut(auth);
    },
  };
}
