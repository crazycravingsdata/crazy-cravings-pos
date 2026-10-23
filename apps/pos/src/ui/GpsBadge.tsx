import type { TrackingStatus } from '../features/tracking/tracker';
import { Icon } from './Icon';

/** Mostra se a posição da van está sendo gravada. Some quando o rastreamento está desligado. */
export function GpsBadge({ status }: { status: TrackingStatus }) {
  if (status === 'off') return null;

  let text = 'GPS on';
  let tone = 'ok';
  switch (status) {
    case 'starting':
      text = 'GPS starting';
      tone = 'muted';
      break;
    case 'waiting':
      text = 'GPS waiting for signal';
      tone = 'warn';
      break;
    case 'denied':
      text = 'GPS blocked: allow location';
      tone = 'warn';
      break;
    case 'unsupported':
      text = 'GPS not available';
      tone = 'warn';
      break;
    case 'tracking':
      break;
  }

  return (
    <span className={`badge ${tone}`} role="status" aria-label={`Location: ${text}`}>
      <Icon name="map-pin" size={16} /> {text}
    </span>
  );
}
