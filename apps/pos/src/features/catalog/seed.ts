import type { PosDatabase } from '../../db/schema';

/**
 * CATÁLOGO DE DEMONSTRAÇÃO. Itens e preços são fictícios, só para testar o
 * caixa enquanto a tela de cadastro de produtos não existe. Carregado apenas
 * quando o banco local está vazio. Desligue com VITE_SEED_DEMO=false.
 */
export async function seedDemoCatalogIfEmpty(db: PosDatabase): Promise<boolean> {
  if ((await db.products.count()) > 0) return false;
  const t = Date.now();

  await db.transaction('rw', [db.categories, db.products, db.variants], async () => {
    await db.categories.bulkAdd([
      { id: 'cat-scoops', name: 'Scoops', sortOrder: 1, updatedAt: t },
      { id: 'cat-treats', name: 'Treats', sortOrder: 2, updatedAt: t },
      { id: 'cat-take-home', name: 'Take home', sortOrder: 3, updatedAt: t },
    ]);
    await db.products.bulkAdd([
      { id: 'p-cup', categoryId: 'cat-scoops', name: 'Cup', active: true, updatedAt: t },
      { id: 'p-cone', categoryId: 'cat-scoops', name: 'Cone', active: true, updatedAt: t },
      { id: 'p-shake', categoryId: 'cat-treats', name: 'Milkshake', active: true, updatedAt: t },
      { id: 'p-sundae', categoryId: 'cat-treats', name: 'Sundae', active: true, updatedAt: t },
      { id: 'p-pint', categoryId: 'cat-take-home', name: 'Pint', active: true, updatedAt: t },
    ]);
    await db.variants.bulkAdd([
      { id: 'v-cup-1', productId: 'p-cup', label: '1 scoop', priceCents: 450, updatedAt: t },
      { id: 'v-cup-2', productId: 'p-cup', label: '2 scoops', priceCents: 650, updatedAt: t },
      { id: 'v-cone-1', productId: 'p-cone', label: '1 scoop', priceCents: 500, updatedAt: t },
      { id: 'v-cone-2', productId: 'p-cone', label: '2 scoops', priceCents: 700, updatedAt: t },
      { id: 'v-shake', productId: 'p-shake', label: 'Regular', priceCents: 800, updatedAt: t },
      { id: 'v-sundae', productId: 'p-sundae', label: 'Regular', priceCents: 900, updatedAt: t },
      { id: 'v-pint', productId: 'p-pint', label: '473 ml', priceCents: 1200, updatedAt: t },
    ]);
  });
  return true;
}
