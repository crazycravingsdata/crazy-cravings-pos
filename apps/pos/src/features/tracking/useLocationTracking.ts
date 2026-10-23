import { useEffect, useState } from 'react';
import { db } from '../../state/db';
import { startTracking, type GeoApi, type TrackingStatus } from './tracker';

type WakeLockSentinelLike = { release(): Promise<void> };
type WakeLockApi = { request(type: 'screen'): Promise<WakeLockSentinelLike> };

/**
 * Liga o rastreamento enquanto houver turno aberto e `enabled` for verdadeiro.
 * Também pede ao navegador para manter a tela ligada: com a tela apagada, o
 * navegador pode parar o GPS e a trilha fica com buracos.
 */
export function useLocationTracking(shiftId: string | undefined, enabled: boolean): TrackingStatus {
  const [status, setStatus] = useState<TrackingStatus>('off');
  const active = enabled && shiftId !== undefined;

  useEffect(() => {
    if (!active || !shiftId) {
      setStatus('off');
      return;
    }
    const geo: GeoApi | undefined =
      typeof navigator !== 'undefined' && 'geolocation' in navigator
        ? (navigator.geolocation as unknown as GeoApi)
        : undefined;
    const stop = startTracking({ db, shiftId, geo, onStatus: setStatus });
    return () => {
      stop();
      setStatus('off');
    };
  }, [active, shiftId]);

  useEffect(() => {
    if (!active) return;
    const wakeLock =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock
        : undefined;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | undefined;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await wakeLock.request('screen');
        if (cancelled) void s.release().catch(() => {});
        else sentinel = s;
      } catch {
        // Negado ou sem suporte: o rastreamento continua, só pode falhar com a tela apagada.
      }
    };
    // O navegador solta o bloqueio quando a aba some; pede de novo ao voltar.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);

  return status;
}
