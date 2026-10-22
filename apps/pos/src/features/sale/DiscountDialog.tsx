import { useState } from 'react';
import type { Discount } from '@crazy-cravings/domain';
import { parseMoneyToCents } from '../../lib/money-input';
import { Icon } from '../../ui/Icon';

type Props = {
  current: Discount | undefined;
  onApply: (discount: Discount | undefined) => void;
  onCancel: () => void;
};

const PERCENTS = [5, 10, 15, 20];

/**
 * Atenção: ainda sem PIN de gerente. O limite de desconto por perfil e a
 * auditoria entram junto com a autenticação por operador.
 */
export function DiscountDialog({ current, onApply, onCancel }: Props) {
  const [fixedText, setFixedText] = useState('');
  const [error, setError] = useState<string | undefined>();

  function applyFixed() {
    const amount = parseMoneyToCents(fixedText);
    if (amount === null || amount === 0) return setError('Enter a valid amount, e.g. 2.00');
    onApply({ kind: 'fixed', amount });
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Discount">
      <div className="card dialog">
        <div className="dialog-head">
          <h2>Discount</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
            <Icon name="x" />
          </button>
        </div>

        <div className="grid-4">
          {PERCENTS.map((p) => (
            <button
              key={p}
              className={`btn ${current?.kind === 'percent' && current.basisPoints === p * 100 ? 'primary' : ''}`}
              onClick={() => onApply({ kind: 'percent', basisPoints: p * 100 })}
            >
              {p}%
            </button>
          ))}
        </div>

        <label>
          Fixed amount (CAD)
          <input
            value={fixedText}
            onChange={(e) => {
              setFixedText(e.target.value);
              setError(undefined);
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="2.00"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="row">
          <button className="btn" onClick={() => onApply(undefined)} disabled={!current}>
            Remove discount
          </button>
          <button className="btn primary" onClick={applyFixed}>
            Apply amount
          </button>
        </div>
      </div>
    </div>
  );
}
