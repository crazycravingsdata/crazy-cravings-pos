import { useEffect, useState } from 'react';
import type { AuthService, AuthState } from './auth-service';

export type AppAuthState = AuthState | { kind: 'local' };

/** Sem serviço de login configurado, o app roda em modo local (sem conta, sem sincronização). */
export function useAuthState(service: AuthService | undefined): AppAuthState {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  useEffect(() => {
    if (!service) return;
    return service.subscribe(setState);
  }, [service]);

  return service ? state : { kind: 'local' };
}
