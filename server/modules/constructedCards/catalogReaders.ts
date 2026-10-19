import { mergeConstructedCardRows, validateConstructedCardStatsDataset } from './catalogStatistics.js';
import type { ConstructedCardDataService, ConstructedCardCollection, ConstructedCardFormat, ConstructedCardPeriod,
  ConstructedCardPeriodDescriptor, ConstructedCardRank, ConstructedCardRankDescriptor } from './serviceContracts.js';

type Row = Record<string, unknown>;
type Statistics = Row & { view?: { cards?: Row[]; source?: unknown } };
type Catalog = Pick<ConstructedCardCollection, 'cacheSource' | 'dataStatus' | 'warning'> & {
  document: { cards: Row[]; datasetVersion: string; verifiedAt: string; publishedAt: string };
};
type Ports = {
  catalog: (format: ConstructedCardFormat) => Promise<Catalog>;
  patch: () => Promise<string | null>;
  statistics: (format: ConstructedCardFormat, period: ConstructedCardPeriod, rank: ConstructedCardRank) => Promise<Statistics>;
  period: (period: ConstructedCardPeriod, payload: Row) => ConstructedCardPeriodDescriptor;
  rank: (rank: ConstructedCardRank, payload: Row) => ConstructedCardRankDescriptor;
  record: (format: ConstructedCardFormat, period: ConstructedCardPeriod, rank: ConstructedCardRank,
    updatedAt: string | null, cards: Row[]) => void;
  onHistoryError?: (error: unknown) => void;
  cache: Map<string, { value: ConstructedCardCollection; expiresAt: number }>;
  jobs: Map<string, Promise<ConstructedCardCollection>>;
  generation: () => number; now: () => number; ttlMs: number; origin: string;
};

/** Public identity never waits for statistics. Both variants share source catalogs but isolate their result caches. */
export function createConstructedCardCatalogReaders(ports: Ports) {
  const load = async (withStatistics: boolean, format: ConstructedCardFormat,
    period: ConstructedCardPeriod, rank: ConstructedCardRank): Promise<ConstructedCardCollection> => {
    const key = `${withStatistics ? '' : 'public:'}${format}:${rank}:${period}`;
    const cached = ports.cache.get(key);
    if (cached && cached.expiresAt > ports.now()) return cached.value;
    const active = ports.jobs.get(key);
    if (active) return active;
    const generation = ports.generation();
    const job = (async () => {
      const [catalog, patch] = await Promise.all([ports.catalog(format), ports.patch()]);
      let statsPayload: Statistics = {}, statsCards: Row[] = [];
      let statsWarning = false;
      if (withStatistics) {
        try {
          statsPayload = await ports.statistics(format, period, rank);
          statsCards = Array.isArray(statsPayload?.view?.cards) ? statsPayload.view.cards : [];
          validateConstructedCardStatsDataset(statsCards);
        } catch { statsWarning = true; statsCards = []; }
      }
      const warnings = [
        catalog.dataStatus === 'stale' ? 'Показывается последняя сохранённая версия библиотеки карт.' : '',
        catalog.warning ?? '', statsWarning ? 'Статистика карт временно недоступна.' : '',
      ].filter((warning, index, values) => Boolean(warning) && values.indexOf(warning) === index);
      const value: ConstructedCardCollection = {
        cards: mergeConstructedCardRows(catalog.document.cards, statsCards),
        updatedAt: withStatistics ? String(statsPayload?.fetched_at ?? '') || null : catalog.document.publishedAt,
        sourceUrl: String(statsPayload?.url ?? statsPayload?.view?.source ?? '') || ports.origin,
        warning: warnings.join(' ') || null, cacheSource: catalog.cacheSource, dataStatus: catalog.dataStatus,
        partial: false, datasetVersion: catalog.document.datasetVersion,
        catalogVerifiedAt: catalog.document.verifiedAt, catalogPublishedAt: catalog.document.publishedAt,
        period: ports.period(period, { ...statsPayload, patch: patch ?? statsPayload?.patch }),
        rank: ports.rank(rank, statsPayload),
      };
      if (withStatistics && !statsWarning) {
        try { ports.record(format, period, rank, value.updatedAt, value.cards); }
        catch (error) { ports.onHistoryError?.(error); }
      }
      if (ports.generation() === generation) ports.cache.set(key, { value, expiresAt: ports.now() + ports.ttlMs });
      return value;
    })().finally(() => { if (ports.jobs.get(key) === job) ports.jobs.delete(key); });
    ports.jobs.set(key, job); return job;
  };
  return {
    loadCards: (format: ConstructedCardFormat, period: ConstructedCardPeriod = '1d', rank: ConstructedCardRank = 'legend') => load(true, format, period, rank),
    loadPublicCards: (format: ConstructedCardFormat, period: ConstructedCardPeriod = '1d', rank: ConstructedCardRank = 'legend') => load(false, format, period, rank),
  };
}

/** Preserves compatibility for injected callers that have not supplied the public reader. */
export function constructedCatalogReaderForAccess(
  readers: Pick<ConstructedCardDataService, 'loadCards' | 'loadPublicCards'>, statsAccess: boolean,
) {
  return statsAccess ? readers.loadCards : readers.loadPublicCards ?? readers.loadCards;
}
