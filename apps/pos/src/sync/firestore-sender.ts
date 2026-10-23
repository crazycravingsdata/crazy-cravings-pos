import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import type { DriverRecord } from '../db/schema';
import type { DriverSource } from './driver-sync';
import type { EventSender } from './outbox';

/**
 * Grava o evento em vans/{vanId}/events/{eventId}.
 * setDoc com ID fixo: reenviar o mesmo evento não duplica nada.
 * As regras do Firestore só aceitam reenvio com conteúdo idêntico.
 */
export function createFirestoreSender(firestore: Firestore): EventSender {
  return async (event) => {
    await setDoc(doc(firestore, `vans/${event.vanId}/events/${event.id}`), {
      vanId: event.vanId,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    });
  };
}

/** Lê a coleção `drivers`. Documentos mal formados são ignorados, não derrubam a lista. */
export function createDriverSource(firestore: Firestore): DriverSource {
  return async () => {
    const snapshot = await getDocs(collection(firestore, 'drivers'));
    const drivers: DriverRecord[] = [];
    for (const d of snapshot.docs) {
      const v = d.data();
      if (
        typeof v.name === 'string' &&
        typeof v.active === 'boolean' &&
        typeof v.pinSalt === 'string' &&
        typeof v.pinHash === 'string' &&
        typeof v.pinIterations === 'number'
      ) {
        drivers.push({
          id: d.id,
          name: v.name,
          active: v.active,
          pinSalt: v.pinSalt,
          pinHash: v.pinHash,
          pinIterations: v.pinIterations,
          updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0,
        });
      }
    }
    return drivers;
  };
}
