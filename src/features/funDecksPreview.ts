export type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  winRate: number | null;
  games: number | null;
  reasons: string[];
  url: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  render?: {
    imageUrl: string;
    previewImageUrl: string;
  };
};

export type FunDecksPayload = {
  fetchedAt: string | null;
  stats: {
    total: number;
    standard: number;
    wild: number;
  };
  methodology: {
    detectorVersion: string | null;
    minFunScore: number;
    maxMetaSimilarity: number;
  };
  decks: FunDeckRow[];
};

export type FunDecksSortMode = 'newest' | 'fun';

/** Decks a guest sees; the rest of the selection is for Diamond subscribers. */
export const FUN_DECKS_FREE_PREVIEW_COUNT = 3;

function timestamp(value: string | null): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The page's order: newest first (or most unusual first), the other key breaking ties. */
export function orderFunDecks(decks: FunDeckRow[], sortMode: FunDecksSortMode): FunDeckRow[] {
  return [...decks].sort((left, right) => {
    if (sortMode === 'fun') {
      return (right.funScore ?? 0) - (left.funScore ?? 0)
        || timestamp(right.firstSeenAt) - timestamp(left.firstSeenAt);
    }
    return timestamp(right.firstSeenAt) - timestamp(left.firstSeenAt)
      || (right.funScore ?? 0) - (left.funScore ?? 0);
  });
}

/**
 * What a guest's first view shows: the selection's summary and its newest
 * free decks. This is all that may enter server-rendered HTML; the complete
 * selection is paid and stays a browser request.
 */
export function funDecksGuestPreview(payload: FunDecksPayload): FunDecksPayload {
  return { ...payload, decks: orderFunDecks(payload.decks, 'newest').slice(0, FUN_DECKS_FREE_PREVIEW_COUNT) };
}
