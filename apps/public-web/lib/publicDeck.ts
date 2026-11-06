import 'server-only';
import { fetchPublicExpress } from './expressApi';
import { normalizeDeckCode, readDeck, type PublicDeck } from './publicDeckData';

export { deckClassName, normalizeDeckCode, type PublicDeck, type PublicDeckCard } from './publicDeckData';

/**
 * The deck behind a code through the site's public resolver (`/api/deck/resolve`, the deck builder's own): null for a
 * code that is not a deck, 'unavailable' when the API cannot answer now.
 */
export async function loadPublicDeck(code: string): Promise<PublicDeck | 'unavailable' | null> {
  const deckCode = normalizeDeckCode(code);
  if (!deckCode) return null;
  let response: Response;
  try {
    response = await fetchPublicExpress(`/api/deck/resolve?code=${encodeURIComponent(deckCode)}`);
  } catch {
    return 'unavailable';
  }
  if (response.status === 400) return null;
  if (!response.ok) return 'unavailable';
  return readDeck(await response.json().catch(() => null));
}
