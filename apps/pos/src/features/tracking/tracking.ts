import type { PosDatabase, Shift } from '../../db/schema';
import { buildOutboxEvent } from '../../sync/outbox';

/** Um ponto do trajeto. Vai para a nuvem como evento `location.recorded`. */
export type LocationPoint = {
  shiftId: string;
  driverId?: string;
  lat: number;
  lng: number;
  /** Precisão em metros. */
  accuracy?: number;
  /** Velocidade em m/s, quando o aparelho informa. */
  speed?: number;
  /** Direção em graus, quando o aparelho informa. */
  heading?: number;
  /** Hora em que o aparelho mediu a posição (ms desde 1970). */
  recordedAt: number;
};

/** Intervalo entre pontos: 30 s dá ~960 pontos por van em um turno de 8 h. */
export const TRACKING_INTERVAL_MS = 30_000;

/** Posição mais velha que isto não é gravada (a tela apagou e o GPS parou). */
export const TRACKING_MAX_AGE_MS = 75_000;

export type RawPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  /** ms desde 1970, como em GeolocationPosition.timestamp. */
  timestamp: number;
};

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Converte a leitura do GPS em ponto. Devolve undefined se os valores forem inválidos. */
export function toLocationPoint(
  shift: Pick<Shift, 'id' | 'driverId'>,
  p: RawPosition,
): LocationPoint | undefined {
  const { latitude, longitude, timestamp } = p;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timestamp)) {
    return undefined;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;

  const point: LocationPoint = {
    shiftId: shift.id,
    lat: round(latitude, 6),
    lng: round(longitude, 6),
    recordedAt: Math.round(timestamp),
  };
  if (shift.driverId !== undefined) point.driverId = shift.driverId;
  // Firestore não aceita undefined/NaN: só entram campos com número válido.
  if (typeof p.accuracy === 'number' && Number.isFinite(p.accuracy) && p.accuracy >= 0) {
    point.accuracy = Math.round(p.accuracy);
  }
  if (typeof p.speed === 'number' && Number.isFinite(p.speed) && p.speed >= 0) {
    point.speed = round(p.speed, 1);
  }
  if (typeof p.heading === 'number' && Number.isFinite(p.heading) && p.heading >= 0) {
    point.heading = Math.round(p.heading);
  }
  return point;
}

/**
 * Grava o ponto na fila de envio. Só grava com o turno aberto: depois do
 * fechamento a van não é mais rastreada.
 */
export async function recordLocation(
  db: PosDatabase,
  shiftId: string,
  position: RawPosition,
  now: number = Date.now(),
): Promise<LocationPoint | undefined> {
  const shift = await db.shifts.get(shiftId);
  if (!shift || shift.closedAt !== undefined) return undefined;

  const point = toLocationPoint(shift, position);
  if (!point) return undefined;

  await db.outbox.add(buildOutboxEvent(shift.vanId, 'location.recorded', point, now));
  return point;
}
