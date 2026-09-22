export type CardFormat = 'standard' | 'wild';
export type CardRoute = { page: 'list' | 'detail'; format: CardFormat; cardId: string | null };
const CARD_ID = /^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/;

export function constructedCardPath(format: CardFormat, cardId: string): string {
  if (!CARD_ID.test(cardId)) throw new Error('Invalid constructed card identity');
  return `/standard/cards/${format}/${encodeURIComponent(cardId)}`;
}

/** Decode only the identity segment; malformed or double encoding never becomes a card. */
export function constructedCardRoute(path: string): CardRoute {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  const match = pathname.match(/^\/standard\/cards\/(standard|wild)(?:\/([^/]+))?$/);
  const format = match?.[1] === 'wild' ? 'wild' : 'standard';
  try {
    const cardId = match?.[2] ? decodeURIComponent(match[2]) : null;
    if (cardId && CARD_ID.test(cardId)) return { page: 'detail', format, cardId };
  } catch { /* Invalid escapes are an unknown route, not a rendering exception. */ }
  return { page: 'list', format, cardId: null };
}
