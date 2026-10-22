import { doc, setDoc, type Firestore } from 'firebase/firestore';
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
