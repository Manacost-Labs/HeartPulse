import { useCallback, useEffect, useEffectEvent, useState } from 'react';

/**
 * Tells the gallery whether this card shows a placeholder: its image is being
 * rendered, or the render failed and the fallback list is still resolving.
 */
export function useReportedPending(deckCode: string, pending: boolean, onPendingChange: (deckCode: string, pending: boolean) => void) {
  const report = useEffectEvent((value: boolean) => onPendingChange(deckCode, value));
  useEffect(() => {
    report(pending);
    return () => report(false);
  }, [pending]);
}

/** The decks whose cards show a placeholder, and the callback each card reports through. */
export function usePendingDecks() {
  const [pendingDecks, setPendingDecks] = useState<ReadonlySet<string>>(() => new Set());
  const setDeckPending = useCallback((deckCode: string, pending: boolean) => setPendingDecks(current => {
    if (current.has(deckCode) === pending) return current;
    const next = new Set(current);
    if (pending) next.add(deckCode);
    else next.delete(deckCode);
    return next;
  }), []);
  return [pendingDecks, setDeckPending] as const;
}
