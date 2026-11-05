/** A deck the account saved in «Мои колоды»; see `docs/specs/saved-decks.md`. */
export type SavedDeck = {
  id: string;
  deckCode: string;
  name: string;
  format: 'standard' | 'wild';
  comment: string;
  /** `pending` while the image is rendered; `failed` offers a retry. */
  status: 'pending' | 'ready' | 'failed';
  imageUrl: string | null;
  previewImageUrl: string | null;
  createdAt: string;
};

export const MAX_DECK_COMMENT_LENGTH = 500;

const STATUSES = new Set(['pending', 'ready', 'failed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only images the site serves itself are shown; anything else is treated as not rendered. */
function siteImage(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/api/public-resource/deckview/') ? value : null;
}

export function savedDeckFromPayload(value: unknown): SavedDeck | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.deckCode !== 'string'
    || typeof value.name !== 'string' || !STATUSES.has(String(value.status))) return null;
  const imageUrl = siteImage(value.imageUrl);
  return {
    id: value.id,
    deckCode: value.deckCode,
    name: value.name,
    format: value.format === 'wild' ? 'wild' : 'standard',
    comment: typeof value.comment === 'string' ? value.comment : '',
    status: value.status as SavedDeck['status'],
    imageUrl,
    previewImageUrl: siteImage(value.previewImageUrl) ?? imageUrl,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
  };
}

export function savedDecksFromPayload(payload: unknown): SavedDeck[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.decks)) return null;
  return payload.decks.flatMap(item => {
    const deck = savedDeckFromPayload(item);
    return deck ? [deck] : [];
  });
}
