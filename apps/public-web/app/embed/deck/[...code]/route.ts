import 'server-only';
import { deckEmbedBody, deckTitle } from '@/apps/public-web/lib/embedBodies';
import { embedDocument, embedMessage, embedResponse } from '@/apps/public-web/lib/embedDocument';
import { loadPublicDeck } from '@/apps/public-web/lib/publicDeck';

export const dynamic = 'force-dynamic';

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/**
 * `/embed/deck/<code>/`: a deck code as a card list with the mana curve and «Скопировать код». The code's `/` may be
 * sent raw or as `%2F`, so the route takes every segment.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string[] }> }): Promise<Response> {
  const { code } = await params;
  const deck = await loadPublicDeck(code.map(decode).join('/'));
  if (deck === 'unavailable') return embedMessage('Колода временно недоступна. Обновите страницу через минуту.', 503);
  if (!deck) return embedMessage('Это не код колоды Hearthstone.', 404);
  const back = `https://hearthpulse.net/embed/deck/${encodeURIComponent(deck.deckCode)}/`;
  // A code always lists the same cards; an hour keeps names fresh after a card catalog update.
  return embedResponse(embedDocument({ title: `${deckTitle(deck)} — Hearthpulse`, body: deckEmbedBody(deck), back, script: true }),
    200, 'public, max-age=3600');
}
