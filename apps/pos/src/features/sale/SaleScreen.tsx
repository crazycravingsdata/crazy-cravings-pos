import { useState } from 'react';
import type { Shift } from '../../db/schema';
import { CloseShiftDialog } from '../shift/CloseShiftDialog';
import { SyncBadge } from '../../ui/SyncBadge';
import { CartPanel } from './CartPanel';
import { CatalogGrid } from './CatalogGrid';
import { DiscountDialog } from './DiscountDialog';
import { PayDialog } from './PayDialog';
import { useCart } from './useCart';

type Dialog = 'none' | 'pay' | 'discount' | 'close';

type Props = {
  shift: Shift;
  onShiftClosed: (closed: Shift) => void;
};

export function SaleScreen({ shift, onShiftClosed }: Props) {
  const cart = useCart();
  const [dialog, setDialog] = useState<Dialog>('none');

  return (
    <div className="pos">
      <header className="topbar">
        <div className="brand">
          <strong>Crazy Cravings</strong>
          <span className="muted">
            {shift.vanId} · {shift.openedBy}
            {shift.eventId ? ` · ${shift.eventId}` : ''}
          </span>
        </div>
        <div className="topbar-right">
          <SyncBadge />
          <button className="btn" onClick={() => setDialog('close')}>
            Close shift
          </button>
        </div>
      </header>

      <div className="pos-body">
        <CatalogGrid dispatch={cart.dispatch} />
        <CartPanel
          cart={cart}
          onDiscount={() => setDialog('discount')}
          onPay={() => setDialog('pay')}
        />
      </div>

      {dialog === 'pay' && (
        <PayDialog
          shiftId={shift.id}
          cart={cart}
          onCancel={() => setDialog('none')}
          onDone={() => {
            cart.dispatch({ type: 'clear' });
            setDialog('none');
          }}
        />
      )}
      {dialog === 'discount' && (
        <DiscountDialog
          current={cart.discount}
          onCancel={() => setDialog('none')}
          onApply={(discount) => {
            cart.dispatch({ type: 'setDiscount', discount });
            setDialog('none');
          }}
        />
      )}
      {dialog === 'close' && (
        <CloseShiftDialog
          shift={shift}
          onCancel={() => setDialog('none')}
          onClosed={onShiftClosed}
        />
      )}
    </div>
  );
}
