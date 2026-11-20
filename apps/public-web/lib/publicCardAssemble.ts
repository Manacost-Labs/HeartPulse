import 'server-only';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';
import {
  isAssembleCardData, isAssembleList, resolveAssembleCard,
  type CardAssembleData, type CardAssembleListData,
} from '@/src/modules/constructedCards/public';

export type PublicCardAssemble = { list: CardAssembleListData | null; card: CardAssembleData | null };

const read = (path: string, deadline: number) => readFirstPaintJson(signal => fetchPublicExpress(path, signal), deadline);

/**
 * What the tool page draws on the server: the list of cards and the data of the shown card (default base),
 * both from Express's open projection within one first-paint budget. A read that misses it is `null`: the
 * page then draws what it has and the browser loads the rest. Express caches both for ten minutes.
 */
export async function loadPublicCardAssemble(format: CardAssembleData['format'], requested: string | null): Promise<PublicCardAssemble> {
  const deadline = Date.now() + FIRST_PAINT_READ_BUDGET_MS;
  const readCard = (cardId: string) => read(`/api/card-assemble/${format}/${encodeURIComponent(cardId)}?base=top`, deadline)
    .then(value => (isAssembleCardData(value, format, cardId) ? value : null));
  // A requested card is read beside the list; the default card is only known from the list.
  const listRead = read(`/api/card-assemble/${format}`, deadline).then(value => (isAssembleList(value, format) ? value : null));
  const early = requested ? readCard(requested) : null;
  const list = await listRead;
  if (!list) return { list: null, card: null };
  const shown = resolveAssembleCard(list.cards, requested);
  if (!shown || shown.state !== 'ok') return { list, card: null };
  const card = shown.card.cardId === requested && early ? await early : await readCard(shown.card.cardId);
  return { list, card };
}
