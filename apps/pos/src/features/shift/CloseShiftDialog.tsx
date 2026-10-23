import { useState, type FormEvent } from 'react';
import type { Shift } from '../../db/schema';
import { parseMoneyToCents } from '../../lib/money-input';
import { db } from '../../state/db';
import { Icon } from '../../ui/Icon';
import { closeShift } from './shift';

type Props = {
  shift: Shift;
  onCancel: () => void;
  onClosed?: (closed: Shift) => void;
};

/** Fechamento cego: o esperado não é mostrado antes da contagem. */
export function CloseShiftDialog({ shift, onCancel, onClosed }: Props) {
  const [countText, setCountText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const countedCash = parseMoneyToCents(countText);
    if (countedCash === null) return setError('Enter the counted cash, e.g. 250.00');
    setBusy(true);
    try {
      // Fechar primeiro, avisar depois: `onClosed?.(await ...)` não executaria o fechamento
      // quando onClosed não existe.
      const closed = await closeShift(db, { shiftId: shift.id, countedCash });
      onClosed?.(closed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close the shift.');
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Close shift">
      <form className="card dialog" onSubmit={onSubmit}>
        <div className="dialog-head">
          <h2>Close shift</h2>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancel">
            <Icon name="x" />
          </button>
        </div>
        <p className="muted">
          Count all the cash in the drawer, including the opening float, and enter the total.
        </p>
        <label>
          Counted cash (CAD)
          <input
            value={countText}
            onChange={(e) => setCountText(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            autoFocus
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            Close shift
          </button>
        </div>
      </form>
    </div>
  );
}
