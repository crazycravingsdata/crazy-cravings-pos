import { cents, formatCad } from '@crazy-cravings/domain';
import { Icon } from '../../ui/Icon';
import type { Cart } from './useCart';

type Props = {
  cart: Cart;
  onDiscount: () => void;
  onPay: () => void;
};

export function CartPanel({ cart, onDiscount, onPay }: Props) {
  const { lines, totals, dispatch } = cart;
  const empty = lines.length === 0;

  return (
    <aside className="cart" aria-label="Current sale">
      <ul className="cart-lines">
        {empty && <li className="muted pad">Tap an item to start a sale.</li>}
        {lines.map((l) => (
          <li key={l.variantId} className="cart-line">
            <div className="cart-line-main">
              <span className="cart-line-name">{l.label}</span>
              <span className="muted">{formatCad(l.unitPrice)} each</span>
            </div>
            <div className="qty">
              <button
                className="icon-btn"
                aria-label={`Decrease ${l.label}`}
                onClick={() =>
                  dispatch({ type: 'setQty', variantId: l.variantId, quantity: l.quantity - 1 })
                }
              >
                <Icon name="minus" />
              </button>
              <span className="qty-n" aria-label="Quantity">
                {l.quantity}
              </span>
              <button
                className="icon-btn"
                aria-label={`Increase ${l.label}`}
                onClick={() =>
                  dispatch({ type: 'setQty', variantId: l.variantId, quantity: l.quantity + 1 })
                }
              >
                <Icon name="plus" />
              </button>
            </div>
            <span className="cart-line-total">{formatCad(cents(l.unitPrice * l.quantity))}</span>
            <button
              className="icon-btn"
              aria-label={`Remove ${l.label}`}
              onClick={() => dispatch({ type: 'remove', variantId: l.variantId })}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>

      <dl className="totals">
        {(totals.discount > 0 || totals.hst > 0) && (
          <div>
            <dt>Subtotal</dt>
            <dd>{formatCad(totals.subtotal)}</dd>
          </div>
        )}
        {totals.discount > 0 && (
          <div>
            <dt>Discount</dt>
            <dd>-{formatCad(totals.discount)}</dd>
          </div>
        )}
        {totals.hst > 0 && (
          <div>
            <dt>Tax</dt>
            <dd>{formatCad(totals.hst)}</dd>
          </div>
        )}
        <div className="grand">
          <dt>Total</dt>
          <dd data-testid="cart-total">{formatCad(totals.total)}</dd>
        </div>
      </dl>

      <div className="row">
        <button className="btn" onClick={onDiscount} disabled={empty}>
          <Icon name="percent" /> Discount
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'clear' })} disabled={empty}>
          Clear
        </button>
      </div>
      <button className="btn primary big" onClick={onPay} disabled={empty}>
        <Icon name="cash" /> Pay cash
      </button>
    </aside>
  );
}
