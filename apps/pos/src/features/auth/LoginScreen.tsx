import { useState, type FormEvent } from 'react';
import type { AuthService } from '../../auth/auth-service';

export function LoginScreen({ service }: { service: AuthService }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await service.signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="card form" onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <p className="muted">
          Use your operator account. The first sign-in on a tablet needs internet; after that
          the register works offline.
        </p>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            inputMode="email"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary big" type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
    </main>
  );
}
