import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import type { FunDeckModeration, HiddenFunDeck } from './FunDeckModerationControls';

export type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  kind?: 'brew' | 'off_meta';
  moderation?: FunDeckModeration;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  winRate: number | null;
  games: number | null;
  reasons: string[];
  url: string | null;
};

export type FunDecksPayload = {
  fetchedAt: string | null;
  detectorVersion: string | null;
  stats: Record<string, unknown>;
  cadence: {
    label: string;
    timers: string[];
    schedule: string;
  };
  decks: FunDeckRow[];
  hidden?: HiddenFunDeck[];
};

export type FormatFilter = 'all' | 'Standard' | 'Wild';

export async function fetchFunDecks(signal?: AbortSignal): Promise<FunDecksPayload> {
  const response = await fetchWithDeadline('/api/admin/fun-decks', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({})) as FunDecksPayload & { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Не удалось загрузить фановые колоды');
  }
  return payload;
}
