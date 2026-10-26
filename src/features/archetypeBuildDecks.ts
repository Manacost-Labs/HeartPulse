import { useEffect, useState } from 'react';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import type { ComparedDeckCard } from './archetypeComparisonModel';

// Card lists of the compared builds. A list is requested once per page: going back to a build,
// or closing and reopening the comparison, reads it from here. A failed request is forgotten,
// so «Повторить» asks the server again.
const lists = new Map<string, Promise<ComparedDeckCard[]>>();

export function resolveBuildCards(deckCode: string, format: string, archetype: string): Promise<ComparedDeckCard[]> {
  const query = new URLSearchParams({ code: deckCode, format, archetype });
  const key = query.toString();
  const known = lists.get(key);
  if (known) return known;
  const request = fetchWithDeadline(`/api/deck/resolve?${query}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then((payload: { cards?: ComparedDeckCard[] }) => payload.cards ?? []);
  lists.set(key, request);
  request.catch(() => lists.delete(key));
  return request;
}

type Read = { key: string; cards: ComparedDeckCard[] | null; failed: boolean };

/** The build's main list; `failed` until `retry` once the request has not been answered. */
export function useBuildCards(deckCode: string | undefined, format: string, archetype: string) {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read | null>(null);
  const key = deckCode ? `${format}:${archetype}:${deckCode}:${attempt}` : '';
  useEffect(() => {
    if (!deckCode) return undefined;
    let active = true;
    resolveBuildCards(deckCode, format, archetype).then(
      cards => { if (active) setRead({ key, cards, failed: false }); },
      () => { if (active) setRead({ key, cards: null, failed: true }); },
    );
    return () => { active = false; };
  }, [deckCode, format, archetype, key]);
  const current = read?.key === key ? read : null;
  return { cards: current?.cards ?? null, failed: current?.failed ?? false, retry: () => setAttempt(value => value + 1) };
}
