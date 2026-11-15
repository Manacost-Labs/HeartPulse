import type { ConstructedCardCollection, ConstructedCardDetailResult } from './serviceContracts.js';

type Row = Record<string, unknown>;
type Compose = (detail: Row, catalog: ConstructedCardCollection, stats: ConstructedCardCollection,
  options: { partial: boolean; fallback: boolean; warning: string | null }) => ConstructedCardDetailResult;

/** Detail answer built from the catalog row (plus the last cached detail) when the full detail read failed or is late. */
export function knownCardFallback(compose: Compose, cachedDetail: Row | undefined, knownCard: Row,
  catalog: ConstructedCardCollection, stats: ConstructedCardCollection): ConstructedCardDetailResult {
  return compose(cachedDetail ?? { ...knownCard, wiki: knownCard.wiki ?? {}, decks: [] }, catalog, stats,
    { partial: true, fallback: true, warning: cachedDetail
      ? 'Показывается последняя сохранённая версия подробной информации о карте.'
      : 'Часть подробной информации о карте временно недоступна.' });
}
