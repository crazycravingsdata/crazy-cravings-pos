import { useState, type FormEvent } from 'react';
import { cents, formatCad } from '@crazy-cravings/domain';
import type { DriverRecord, Shift } from '../../db/schema';
import { parseMoneyToCents } from '../../lib/money-input';
import { db } from '../../state/db';
import { VAN_IDS, saveIdentity } from '../../state/session';
import { authenticateDriver } from '../drivers/drivers';
import { openShift } from './shift';

/** Tablet logado com a conta da van: a van vem do login e o motorista se identifica por PIN. */
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
  /** Lista local de motoristas (usada só com conta da van). */
  drivers: readonly DriverRecord[];
};

export function OpenShiftScreen({
  initialVanId,
  initialOperator,
  lastClosed,
  account,
  drivers,
}: Props) {
  const activeDrivers = drivers
    .filter((d) => d.active)
    .sort((a, b) => a.name.localeCompare(b.name));

  const [vanId, setVanId] = useState(account?.vanId ?? initialVanId ?? VAN_IDS[0]);
  const [operator, setOperator] = useState(initialOperator ?? '');
  const [driverId, setDriverId] = useState('');
  const [pin, setPin] = useState('');
  const [floatText, setFloatText] = useState('100');
  const [eventName, setEventName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const needsDriverList = account !== undefined && activeDrivers.length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    const openingFloat = parseMoneyToCents(floatText);
    const event = eventName.trim();

    // Modo local (sem login): nome livre, como antes.
    if (!account) {
      const name = operator.trim();
      if (!name) return setError('Enter the operator name.');
      if (openingFloat === null) return setError('Enter a valid opening float, e.g. 100.00');
      setBusy(true);
      try {
        await saveIdentity(vanId, name);
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
      return;
    }

    // Tablet da van: o motorista se identifica pelo nome e PIN.
    if (!driverId) return setError('Select your name.');
    if (!pin) return setError('Enter your PIN.');
    if (openingFloat === null) return setError('Enter a valid opening float, e.g. 100.00');

    setBusy(true);
    try {
      const result = await authenticateDriver(db, driverId, pin);
      if (!result.ok) {
        setPin('');
        setBusy(false);
        if (result.reason === 'wrong') {
          const n = result.attemptsLeft;
          return setError(`Wrong PIN. ${n} attempt${n === 1 ? '' : 's'} left.`);
        }
        if (result.reason === 'locked') {
          const min = Math.max(1, Math.ceil(result.remainingMs / 60_000));
          return setError(`Too many attempts. Try again in ${min} min or ask the manager.`);
        }
        return setError('This driver is not available. Pick another name.');
      }

      await saveIdentity(account.vanId, result.driver.name);
      await openShift(db, {
        vanId: account.vanId,
        operator: result.driver.name,
        driverId: result.driver.id,
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

        {account && <p className="muted">Tablet signed in as {account.email}</p>}

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

        {account ? (
          <>
            {needsDriverList ? (
              <p className="notice" role="status">
                No drivers loaded yet. Connect to the internet so the driver list can download, or
                ask the manager to add you.
              </p>
            ) : (
              <>
                <label>
                  Driver
                  <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                    <option value="">Select your name</option>
                    {activeDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  PIN
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <label>
            Operator
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              autoComplete="off"
              placeholder="Your name"
            />
          </label>
        )}

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

        <button className="btn primary big" type="submit" disabled={busy || needsDriverList}>
          Open shift
        </button>

        {account && (
          <button
            type="button"
            className="btn"
            onClick={account.onSignOut}
            disabled={!account.canSignOut}
          >
            Sign out tablet
          </button>
        )}
        {account && !account.canSignOut && (
          <p className="muted">Sign out is disabled until the pending sales are sent.</p>
        )}
      </form>
    </main>
  );
}
