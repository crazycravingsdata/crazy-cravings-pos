import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cents, formatCad } from '@crazy-cravings/domain';
import { db } from '../../state/db';
import type { Cart } from './useCart';

export function CatalogGrid({ dispatch }: { dispatch: Cart['dispatch'] }) {
  const [categoryId, setCategoryId] = useState<string | undefined>();

  const data = useLiveQuery(async () => {
    const [categories, products, variants] = await Promise.all([
      db.categories.orderBy('sortOrder').toArray(),
      db.products.filter((p) => p.active).toArray(),
      db.variants.toArray(),
    ]);
    return { categories, products, variants };
  }, []);

  if (!data) return <section className="catalog" aria-busy="true" />;

  if (data.products.length === 0) {
    return (
      <section className="catalog">
        <p className="muted pad">
          The catalog is empty. Product management comes in the next phase.
        </p>
      </section>
    );
  }

  const productById = new Map(data.products.map((p) => [p.id, p]));
  const tiles = data.variants
    .map((v) => ({ variant: v, product: productById.get(v.productId) }))
    .filter((t) => t.product !== undefined)
    .filter((t) => categoryId === undefined || t.product?.categoryId === categoryId);

  return (
    <section className="catalog">
      <div className="chips" role="tablist" aria-label="Categories">
        <button
          role="tab"
          aria-selected={categoryId === undefined}
          className={`chip ${categoryId === undefined ? 'active' : ''}`}
          onClick={() => setCategoryId(undefined)}
        >
          All
        </button>
        {data.categories.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={categoryId === c.id}
            className={`chip ${categoryId === c.id ? 'active' : ''}`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="tiles">
        {tiles.map(({ variant, product }) => (
          <button
            key={variant.id}
            className="tile"
            onClick={() =>
              dispatch({
                type: 'add',
                variantId: variant.id,
                label: `${product?.name ?? ''} · ${variant.label}`,
                priceCents: variant.priceCents,
              })
            }
          >
            <span className="tile-name">{product?.name}</span>
            <span className="tile-variant">{variant.label}</span>
            <span className="tile-price">{formatCad(cents(variant.priceCents))}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
