import { describe, expect, it } from 'vitest';
import { uuidv7 } from '../src/lib/uuid';

describe('uuidv7', () => {
  it('tem formato válido, versão 7 e variante RFC 4122', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('ordena por tempo de criação', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    const c = uuidv7(1_800_000_000_000);
    expect([c, b, a].sort()).toEqual([a, b, c]);
  });

  it('não repete no mesmo milissegundo', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });
});
