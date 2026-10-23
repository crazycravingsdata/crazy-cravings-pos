/**
 * O motorista nunca vê e-mail. O tablet é ativado uma vez, com o número da van e uma senha de
 * ativação, e por baixo o Firebase recebe um e-mail interno montado a partir do número.
 * Esse e-mail não precisa existir como caixa de correio: o Firebase só o usa como identificador.
 */
const DEFAULT_DOMAIN = 'vans.crazycravings.ca';

/** "1", "01" e "van-01" viram "van-01". Retorna undefined se não houver um número válido. */
export function normalizeVanId(input: string): string | undefined {
  const digits = /^(?:van-?)?(\d{1,3})$/i.exec(input.trim())?.[1];
  if (digits === undefined) return undefined;
  const n = Number(digits);
  return n > 0 ? `van-${String(n).padStart(2, '0')}` : undefined;
}

export function vanEmail(vanId: string, domain: string = DEFAULT_DOMAIN): string {
  return `${vanId}@${domain}`;
}

export function configuredVanEmailDomain(): string {
  const value = import.meta.env.VITE_VAN_EMAIL_DOMAIN;
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_DOMAIN;
}
