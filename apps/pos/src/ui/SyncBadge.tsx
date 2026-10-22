import { useSync } from '../sync/useSync';
import { Icon, type IconName } from './Icon';

export function SyncBadge() {
  const status = useSync();

  let icon: IconName = 'cloud';
  let text = 'Synced';
  let tone = 'ok';

  switch (status.kind) {
    case 'disabled':
      icon = 'cloud';
      text = 'Sync not set up';
      tone = 'muted';
      break;
    case 'offline':
      icon = 'wifi-off';
      text = status.pending > 0 ? `Offline · ${status.pending} to send` : 'Offline';
      tone = 'warn';
      break;
    case 'pending':
      icon = 'wifi';
      text = `${status.pending} to send`;
      tone = 'warn';
      break;
    case 'synced':
      icon = 'wifi';
      text = 'Synced';
      tone = 'ok';
      break;
  }

  return (
    <span className={`badge ${tone}`} role="status">
      <Icon name={icon} size={16} /> {text}
    </span>
  );
}
