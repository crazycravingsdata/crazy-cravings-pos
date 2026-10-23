import { useState, type FormEvent } from 'react';
import type { AuthService } from '../../auth/auth-service';
import { configuredVanEmailDomain, normalizeVanId, vanEmail } from '../../auth/van-email';

/**
 * Ativação do tablet. Feita uma vez por quem administra, não pelo motorista: o motorista só
 * usa nome e PIN para abrir o turno. Não pede e-mail.
 */
export function LoginScreen({ service }: { service: AuthService }) {
  const [van, setVan] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const vanId = normalizeVanId(van);
    if (!vanId) return setError('Enter the van number, e.g. 1.');
    if (!password) return setError('Enter the activation password.');
    setBusy(true);
    try {
      await service.signIn(vanEmail(vanId, configuredVanEmailDomain()), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate the tablet. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="card form" onSubmit={onSubmit}>
        <h1>Activate tablet</h1>
        <p className="muted">
          Done once per tablet, with internet, by the manager. After that, drivers only pick their
          name and enter a PIN, and the register works offline.
        </p>

        <label>
          Van number
          <input
            value={van}
            onChange={(e) => setVan(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 1"
          />
        </label>

        <label>
          Activation password
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
          Activate
        </button>
      </form>
    </main>
  );
}
