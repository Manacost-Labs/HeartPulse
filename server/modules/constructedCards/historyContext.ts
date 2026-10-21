import { CLASS_LABELS } from './publicCardProjection.js';
import type { ConstructedCardHistoryStore } from './repository/historyStore.js';
import type {
  ConstructedCardCollection,
  ConstructedCardFormat,
  ConstructedCardHistoryContext,
  ConstructedCardHistoryPoint,
  ConstructedCardHistoryReference,
  ConstructedCardPeriod,
  ConstructedCardRank,
} from './serviceContracts.js';

const CACHE_ENTRIES = 96;
const DAY_MS = 24 * 60 * 60_000;

type Ports = {
  store: Pick<ConstructedCardHistoryStore, 'trackedSince' | 'readAverages'>;
  loadCards: (format: ConstructedCardFormat, period: ConstructedCardPeriod, rank: ConstructedCardRank) => Promise<ConstructedCardCollection>;
  now: () => number;
};

const cardIdOf = (card: Record<string, unknown>) => String(card?.card_id ?? '').trim().toUpperCase();

/**
 * Start of a card's history and the class/format averages it is compared with. Averages are the
 * same for every card of a class until the next snapshot, so they are cached per slice, class,
 * range and collection update: the format average reads the whole slice (about 0.1 s) and runs
 * synchronously, so it must not be repeated on every chart open.
 */
export function createCardHistoryContextReader({ store, loadCards, now }: Ports) {
  const cache = new Map<string, ReturnType<Ports['store']['readAverages']>>();
  const averages = (key: string, read: () => ReturnType<Ports['store']['readAverages']>) => {
    let value = cache.get(key);
    if (!value) {
      value = read();
      cache.set(key, value);
      const oldest = cache.keys().next();
      if (cache.size > CACHE_ENTRIES && !oldest.done) cache.delete(oldest.value);
    }
    return value;
  };
  return async (
    format: ConstructedCardFormat,
    cardId: string,
    period: ConstructedCardPeriod,
    rank: ConstructedCardRank,
    days: number,
    points: ConstructedCardHistoryPoint[],
  ): Promise<ConstructedCardHistoryContext> => {
    const trackedSince = store.trackedSince(format, period, rank, cardId);
    if (!points.length) return { trackedSince, references: [] };
    const since = new Date(Math.floor((now() - days * DAY_MS) / DAY_MS) * DAY_MS).toISOString();
    const collection = await loadCards(format, period, rank);
    const id = cardId.trim().toUpperCase();
    const classCode = String(collection.cards.find(card => cardIdOf(card) === id)?.class ?? '').trim().toUpperCase();
    const plotted = new Set(points.map(point => point.recordedAt));
    const reference = (scope: ConstructedCardHistoryReference['scope'], label: string, cardIds: string[] | null) => {
      const key = [format, period, rank, scope === 'class' ? classCode : '*', since, collection.updatedAt].join('|');
      const values = averages(key, () => store.readAverages(format, period, rank, cardIds, since));
      return { scope, label, points: values.filter(value => plotted.has(value.recordedAt)) };
    };
    const references = [
      ...(classCode !== 'NEUTRAL' && CLASS_LABELS[classCode] ? [reference('class', `Среднее класса «${CLASS_LABELS[classCode]}»`,
        collection.cards.filter(card => String(card?.class ?? '').trim().toUpperCase() === classCode).map(cardIdOf))] : []),
      reference('format', 'Среднее формата', null),
    ].filter(item => item.points.length >= 2);
    return { trackedSince, references };
  };
}
