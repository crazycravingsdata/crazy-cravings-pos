/**
 * PIN de motorista: identifica quem está no caixa. Não é uma autenticação forte.
 * Um PIN de 4 a 6 dígitos tem poucas combinações, então quem tiver acesso técnico
 * ao hash pode descobri-lo por força bruta. O hash com sal e iterações só encarece
 * cada tentativa. A proteção do dinheiro vem do fechamento cego e do histórico imutável.
 *
 * Este arquivo não importa nada de propósito: o script de administração o carrega
 * direto, então app e script usam exatamente o mesmo formato de hash.
 */

export const PIN_ITERATIONS = 100_000;

export type PinHash = {
  /** Sal aleatório, em hexadecimal. */
  salt: string;
  /** Resultado do PBKDF2-SHA-256 (32 bytes), em hexadecimal. */
  hash: string;
  iterations: number;
};

/** Retorna a mensagem de erro, ou null se o PIN for aceitável. */
export function validatePinFormat(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'PIN must have 4 to 6 digits.';
  if (/^(\d)\1+$/.test(pin)) return 'PIN is too easy to guess (repeated digits).';
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - (digits[i] as number));
  const first = steps[0] as number;
  if ((first === 1 || first === -1) && steps.every((s) => s === first)) {
    return 'PIN is too easy to guess (sequence).';
  }
  return null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) throw new Error('Hexadecimal inválido');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto indisponível (o app precisa rodar em HTTPS ou localhost)');
  }
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(
  pin: string,
  iterations: number = PIN_ITERATIONS,
  salt: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(16)),
): Promise<PinHash> {
  const error = validatePinFormat(pin);
  if (error) throw new Error(error);
  return { salt: toHex(salt), hash: toHex(await derive(pin, salt, iterations)), iterations };
}

/** Compara em tempo constante, para não vazar quantos bytes batem. */
export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)) return false;
  let expected: Uint8Array;
  let actual: Uint8Array;
  try {
    expected = fromHex(stored.hash);
    actual = await derive(pin, fromHex(stored.salt), stored.iterations);
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= (expected[i] as number) ^ (actual[i] as number);
  }
  return diff === 0;
}
