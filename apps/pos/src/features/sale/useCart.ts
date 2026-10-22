import { useMemo, useReducer } from 'react';
import {
  cents,
  orderTotals,
  type CartLine,
  type Discount,
  type OrderTotals,
} from '@crazy-cravings/domain';

export type DisplayLine = CartLine & { readonly label: string };

type State = { lines: readonly DisplayLine[]; discount: Discount | undefined };

type Action =
  | { type: 'add'; variantId: string; label: string; priceCents: number }
  | { type: 'setQty'; variantId: string; quantity: number }
  | { type: 'remove'; variantId: string }
  | { type: 'setDiscount'; discount: Discount | undefined }
  | { type: 'clear' };

const EMPTY: State = { lines: [], discount: undefined };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.find((l) => l.variantId === action.variantId);
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((l) =>
            l.variantId === action.variantId ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        };
      }
      const line: DisplayLine = {
        variantId: action.variantId,
        label: action.label,
        unitPrice: cents(action.priceCents),
        quantity: 1,
      };
      return { ...state, lines: [...state.lines, line] };
    }
    case 'setQty': {
      if (action.quantity <= 0) {
        return { ...state, lines: state.lines.filter((l) => l.variantId !== action.variantId) };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.variantId === action.variantId ? { ...l, quantity: action.quantity } : l,
        ),
      };
    }
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.variantId !== action.variantId) };
    case 'setDiscount':
      return { ...state, discount: action.discount };
    case 'clear':
      return EMPTY;
  }
}

export function useCart() {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const totals: OrderTotals = useMemo(
    () => (state.discount ? orderTotals(state.lines, state.discount) : orderTotals(state.lines)),
    [state],
  );
  return { lines: state.lines, discount: state.discount, totals, dispatch };
}

export type Cart = ReturnType<typeof useCart>;
