/**
 * UUID v7: 48 bits de timestamp em ms + aleatório. Ordenável por tempo de criação,
 * gerado no próprio tablet (funciona offline) e usado como chave de idempotência.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versão 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
