import { useState } from 'react';
import { cents, formatCad, type Cents } from '@crazy-cravings/domain';
import { parseMoneyToCents } from '../../lib/money-input';
import { db } from '../../state/db';
import { Icon } from '../../ui/Icon';
import { completeCashSale, type CompleteCashSaleResult } from './completeCashSale';
import type { Cart } from './useCart';

type Props = {
  shiftId: string;
  cart: Cart;
  onCancel: () => void;
  /** Chamado ao tocar em "New sale" depois de concluída. */
  onDone: () => void;
};

const QUICK_NOTES = [5, 10, 20, 50, 100];

export function PayDialog({ shiftId, cart, onCancel, onDone }: Props) {
  const total = cart.totals.total;
  const [tenderedText, setTenderedText] = useState('');
  const [result, setResult] = useState<CompleteCashSaleResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const tendered: Cents | null = parseMoneyToCents(tenderedText);
  const enough = tendered !== null && tendered >= total;
  const change = enough ? cents(tendered - total) : undefined;

  async function confirm() {
    if (tendered === null || !enough || busy) return;
    setError(undefined);
    setBusy(true);
    try {
      setResult(
        await completeCashSale(db, {
          shiftId,
          lines: cart.lines,
          ...(cart.discount && { discount: cart.discount }),
          tendered,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the sale.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Sale complete">
        <div className="card dialog center">
          <div className="success-mark">
            <Icon name="check" size={36} />
          </div>
          <h2>Sale complete</h2>
          <p className="muted">Total {formatCad(result.totals.total)}</p>
          <p className="change-label">Change due</p>
          <p className="change-amount" data-testid="change-due">
            {formatCad(result.change)}
          </p>
          <button className="btn primary big" onClick={onDone} autoFocus>
            New sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Cash payment">
      <div className="card dialog">
        <div className="dialog-head">
          <h2>Cash payment</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
            <Icon name="x" />
          </button>
        </div>

        <p className="due-label">Total due</p>
        <p className="due-amount">{formatCad(total)}</p>

        <div className="grid-5">
          <button className="btn" onClick={() => setTenderedText((total / 100).toFixed(2))}>
            Exact
          </button>
          {QUICK_NOTES.filter((n) => n * 100 >= total)
            .slice(0, 4)
            .map((n) => (
              <button key={n} className="btn" onClick={() => setTenderedText(String(n))}>
                ${n}
              </button>
            ))}
        </div>

        <label>
          Cash received (CAD)
          <input
            value={tenderedText}
            onChange={(e) => setTenderedText(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            autoFocus
          />
        </label>

        <p className="change-preview" aria-live="polite">
          {tendered === null
            ? ' '
            : enough
              ? `Change: ${formatCad(change ?? cents(0))}`
              : `Still missing ${formatCad(cents(total - tendered))}`}
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary big" onClick={() => void confirm()} disabled={!enough || busy}>
          Confirm payment
        </button>
      </div>
    </div>
  );
}
