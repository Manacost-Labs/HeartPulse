import { useEffect, useState } from 'react';
import type { DeckListCard, DeckListSideboard } from './DeckListView';

export type ResolvedDeckPayload = {
  ok: boolean;
  format: 'standard' | 'wild';
  heroDbfId: number;
  deckCode: string;
  cards: DeckListCard[];
  sideboards: DeckListSideboard[];
  totalCards: number;
  deckSizeLimit: 30 | 40;
  archetype: {
    archetype: string;
    archetypeLabel: string;
    score: number;
  } | null;
};

type UseResolvedDeckState = {
  data: ResolvedDeckPayload | null;
  loading: boolean;
  error: string;
  reload: () => void;
};

/**
 * Instant deck card list for embeds.
 * Uses public `GET/POST /api/deck/resolve`.
 */
export function useResolvedDeck(deckCode: string | null | undefined): UseResolvedDeckState {
  const [data, setData] = useState<ResolvedDeckPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const code = String(deckCode || '').trim();

  useEffect(() => {
    if (!code) {
      setData(null);
      setError('');
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch(`/api/deck/resolve?code=${encodeURIComponent(code)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось разобрать колоду');
        setData({
          ok: true,
          format: payload.format === 'wild' ? 'wild' : 'standard',
          heroDbfId: Number(payload.heroDbfId) || 0,
          deckCode: String(payload.deckCode || code),
          cards: Array.isArray(payload.cards) ? payload.cards : [],
          sideboards: Array.isArray(payload.sideboards) ? payload.sideboards : [],
          totalCards: Number(payload.totalCards) || 0,
          deckSizeLimit: Number(payload.deckSizeLimit) === 40 ? 40 : 30,
          archetype: payload.archetype?.archetypeLabel
            ? {
              archetype: String(payload.archetype.archetype),
              archetypeLabel: String(payload.archetype.archetypeLabel),
              score: Number(payload.archetype.score) || 0,
            }
            : null,
        });
      })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof Error ? cause.message : 'Ошибка загрузки колоды');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [code, reloadToken]);

  return {
    data,
    loading,
    error,
    reload: () => setReloadToken(token => token + 1),
  };
}
