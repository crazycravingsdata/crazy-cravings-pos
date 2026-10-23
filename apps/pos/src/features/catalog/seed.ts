import type { PosDatabase } from '../../db/schema';

/**
 * CATÁLOGO INICIAL. Copo, Slushy, Refrigerante e Água seguem o cardápio impresso. O preço do
 * Sundae NÃO está no cardápio que temos e é provisório: confirme antes de usar de verdade.
 * Carregado apenas quando o banco local está vazio. Desligue com VITE_SEED_DEMO=false.
 */
export async function seedDemoCatalogIfEmpty(db: PosDatabase): Promise<boolean> {
  const t = Date.now();

  // A checagem fica DENTRO da transação: duas chamadas simultâneas (StrictMode,
  // duas abas) não passam juntas pelo "banco vazio" e não geram chave duplicada.
  return db.transaction('rw', [db.categories, db.products, db.variants], async () => {
    if ((await db.products.count()) > 0) return false;
    await db.categories.bulkAdd([
      { id: 'cat-ice-cream', name: 'Ice cream', sortOrder: 1, updatedAt: t },
      { id: 'cat-drinks', name: 'Drinks', sortOrder: 2, updatedAt: t },
    ]);
    await db.products.bulkAdd([
      { id: 'p-cup', categoryId: 'cat-ice-cream', name: 'Ice Cream Cup', active: true, updatedAt: t },
      { id: 'p-sundae', categoryId: 'cat-ice-cream', name: 'Sundae', active: true, updatedAt: t },
      { id: 'p-slushy', categoryId: 'cat-drinks', name: 'Slushy', active: true, updatedAt: t },
      { id: 'p-pop', categoryId: 'cat-drinks', name: 'Pop', active: true, updatedAt: t },
      { id: 'p-water', categoryId: 'cat-drinks', name: 'Water', active: true, updatedAt: t },
    ]);
    await db.variants.bulkAdd([
      { id: 'v-cup', productId: 'p-cup', label: 'Regular', priceCents: 700, updatedAt: t },
      { id: 'v-sundae', productId: 'p-sundae', label: 'Regular', priceCents: 900, updatedAt: t },
      { id: 'v-slushy', productId: 'p-slushy', label: 'Regular', priceCents: 500, updatedAt: t },
      { id: 'v-pop', productId: 'p-pop', label: 'Regular', priceCents: 200, updatedAt: t },
      { id: 'v-water', productId: 'p-water', label: 'Regular', priceCents: 200, updatedAt: t },
    ]);
    return true;
  });
}
