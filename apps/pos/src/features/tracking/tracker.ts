import type { PosDatabase } from '../../db/schema';
import {
  TRACKING_INTERVAL_MS,
  TRACKING_MAX_AGE_MS,
  recordLocation,
  type RawPosition,
} from './tracking';

export type TrackingStatus =
  /** Rastreamento desligado (sem turno, sem conta ou desativado). */
  | 'off'
  /** O aparelho não tem GPS no navegador. */
  | 'unsupported'
  /** Ligado, esperando a primeira posição. */
  | 'starting'
  /** Gravando posições. */
  | 'tracking'
  /** Sem posição recente (tela apagada, sem sinal de GPS). */
  | 'waiting'
  /** O usuário negou a permissão de localização. */
  | 'denied';

/** Parte da API de geolocalização que usamos (facilita o teste). */
export type GeoApi = {
  watchPosition(
    success: (p: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy: number;
        speed: number | null;
        heading: number | null;
      };
      timestamp: number;
    }) => void,
    error?: (e: { code: number }) => void,
    options?: { enableHighAccuracy?: boolean; maximumAge?: number; timeout?: number },
  ): number;
  clearWatch(id: number): void;
};

export type TrackerOptions = {
  db: PosDatabase;
  shiftId: string;
  geo: GeoApi | undefined;
  onStatus: (status: TrackingStatus) => void;
  intervalMs?: number;
  maxAgeMs?: number;
  now?: () => number;
};

const PERMISSION_DENIED = 1;

/**
 * Grava a posição do aparelho a cada `intervalMs` enquanto estiver rodando.
 * Se a última posição estiver velha demais (a tela apagou e o navegador parou
 * o GPS), não grava ponto falso: marca "waiting" e espera uma posição nova.
 * Devolve a função que para tudo.
 */
export function startTracking(opts: TrackerOptions): () => void {
  const {
    db,
    shiftId,
    geo,
    onStatus,
    intervalMs = TRACKING_INTERVAL_MS,
    maxAgeMs = TRACKING_MAX_AGE_MS,
    now = Date.now,
  } = opts;

  if (!geo) {
    onStatus('unsupported');
    return () => {};
  }

  let latest: RawPosition | undefined;
  let lastRecordedAt = -1;
  let denied = false;
  let stopped = false;
  let writing = false;

  onStatus('starting');

  const tick = async () => {
    if (stopped || denied || writing) return;
    if (!latest || now() - latest.timestamp > maxAgeMs) {
      onStatus('waiting');
      return;
    }
    // Mesma medição já gravada: não repete.
    if (latest.timestamp === lastRecordedAt) return;
    writing = true;
    try {
      const saved = await recordLocation(db, shiftId, latest, now());
      if (saved) {
        lastRecordedAt = latest.timestamp;
        if (!stopped) onStatus('tracking');
      }
    } catch {
      // Falha ao gravar no banco local: tenta de novo no próximo ciclo.
    } finally {
      writing = false;
    }
  };

  const watchId = geo.watchPosition(
    (p) => {
      denied = false;
      const first = latest === undefined;
      latest = {
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
        speed: p.coords.speed,
        heading: p.coords.heading,
        timestamp: p.timestamp,
      };
      // A primeira posição é gravada logo, sem esperar o intervalo.
      if (first) void tick();
    },
    (e) => {
      if (e.code === PERMISSION_DENIED) {
        denied = true;
        onStatus('denied');
      } else {
        onStatus('waiting');
      }
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
  );

  const timer = setInterval(() => void tick(), intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    geo.clearWatch(watchId);
  };
}
