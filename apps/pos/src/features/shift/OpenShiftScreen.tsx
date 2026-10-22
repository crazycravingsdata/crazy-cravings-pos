import { useState, type FormEvent } from 'react';
import { cents, formatCad } from '@crazy-cravings/domain';
import type { Shift } from '../../db/schema';
import { parseMoneyToCents } from '../../lib/money-input';
import { db } from '../../state/db';
import { VAN_IDS, saveIdentity } from '../../state/session';
import { openShift } from './shift';

/** Conta logada: a van vem do login e não pode ser trocada. */
export type Account = {
  email: string;
  vanId: string;
  canSignOut: boolean;
  onSignOut: () => void;
};

type Props = {
  initialVanId: string | undefined;
  initialOperator: string | undefined;
  lastClosed: Shift | undefined;
  account?: Account;
};

export function OpenShiftScreen({ initialVanId, initialOperator, lastClosed, account }: Props) {
  const [vanId, setVanId] = useState(account?.vanId ?? initialVanId ?? VAN_IDS[0]);
  const [operator, setOperator] = useState(
    initialOperator ?? (account ? (account.email.split('@')[0] ?? '') : ''),
  );
  const [floatText, setFloatText] = useState('100');
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const name = operator.trim();
    if (!name) return setError('Enter the operator name.');
    const openingFloat = parseMoneyToCents(floatText);
    if (openingFloat === null) return setError('Enter a valid opening float, e.g. 100.00');

    setBusy(true);
    try {
      await saveIdentity(vanId, name);
      const event = eventName.trim();
      await openShift(db, {
        vanId,
        operator: name,
        openingFloat,
        ...(event && { eventId: event }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the shift.');
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="card form" onSubmit={onSubmit}>
        <h1>Open shift</h1>

        {account && <p className="muted">Signed in as {account.email}</p>}

        {lastClosed && (
          <div className="notice" role="status">
            <strong>Last shift closed.</strong>{' '}
            Expected {formatCad(cents(lastClosed.expectedCash ?? 0))}, counted{' '}
            {formatCad(cents(lastClosed.countedCash ?? 0))}, difference{' '}
            <span className={(lastClosed.cashDifference ?? 0) === 0 ? 'ok' : 'warn'}>
              {formatCad(cents(lastClosed.cashDifference ?? 0))}
            </span>
            .
          </div>
        )}

        <label>
          Van
          <select
            value={vanId}
            onChange={(e) => setVanId(e.target.value)}
            disabled={account !== undefined}
          >
            {(account ? [account.vanId] : VAN_IDS).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label>
          Operator
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            autoComplete="off"
            placeholder="Your name"
          />
        </label>

        <label>
          Opening float (CAD)
          <input
            value={floatText}
            onChange={(e) => setFloatText(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
          />
        </label>

        <label>
          Event or location (optional)
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            autoComplete="off"
            placeholder="e.g. Waterfront market"
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary big" type="submit" disabled={busy}>
          Open shift
        </button>

        {account && (
          <button
            type="button"
            className="btn"
            onClick={account.onSignOut}
            disabled={!account.canSignOut}
          >
            Sign out
          </button>
        )}
        {account && !account.canSignOut && (
          <p className="muted">Sign out is disabled until the pending sales are sent.</p>
        )}
      </form>
    </main>
  );
}
