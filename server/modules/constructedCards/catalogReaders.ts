import { answerWithin, withDeadline } from './deadline.js';
import { ConstructedCardCatalogUnavailableError } from './serviceContracts.js';
import { mergeConstructedCardRows, validateConstructedCardStatsDataset } from './catalogStatistics.js';
import type { ConstructedCardDataService, ConstructedCardCollection, ConstructedCardFormat, ConstructedCardPeriod,
  ConstructedCardPeriodDescriptor, ConstructedCardRank, ConstructedCardRankDescriptor } from './serviceContracts.js';

type Row = Record<string, unknown>;
type Statistics = Row & { view?: { cards?: Row[]; source?: unknown } };
type Catalog = Pick<ConstructedCardCollection, 'cacheSource' | 'dataStatus' | 'warning'> & {
  document: { cards: Row[]; datasetVersion: string; verifiedAt: string; publishedAt: string };
  /** The last good copy after a failed or late refresh, not a stale-but-loaded catalog (#396). */
  fallback?: true;
};
type StoredCopy = { document: Catalog['document']; repairWarning?: string | null };
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
  /** Last verified catalog without any network read; null when none is usable. */
  lastKnown?: (format: ConstructedCardFormat) => StoredCopy | null;
  /** A caller waits this long for a shared load before it gets the last good version. */
  responseDeadlineMs?: number;
  /** A shared load that has not settled by then is dropped from `jobs` so the next caller retries. */
  loadDeadlineMs?: number;
  onDeadline?: (operation: string, deadlineMs: number) => void;
};

function stalePublicCatalog(value: ConstructedCardCollection): ConstructedCardCollection {
  const warning = 'Показывается последняя сохранённая версия библиотеки карт.';
  return { ...value, dataStatus: 'stale', cacheSource: 'LKG',
    warning: value.warning?.includes(warning) ? value.warning : [warning, value.warning].filter(Boolean).join(' ') };
}

/**
 * The stored catalog is large (tens of MB for Wild, ~90 MB of heap parsed) and
 * read synchronously: read it once per format and generation every 30 s, not
 * once per waiting request, and let it go after those 30 s or as soon as a
 * catalog for the format is in memory.
 */
function storedCatalogMemo(ports: Pick<Ports, 'lastKnown' | 'generation' | 'now'>) {
  const stored = new Map<ConstructedCardFormat, { generation: number; until: number; value: StoredCopy | null }>();
  const held = (format: ConstructedCardFormat) => {
    const memo = stored.get(format);
    return memo && memo.generation === ports.generation() && memo.until > ports.now() ? memo : undefined;
  };
  const read = (format: ConstructedCardFormat) => {
    const memo = held(format);
    if (memo) return memo.value;
    let value: StoredCopy | null = null;
    try { value = ports.lastKnown?.(format) ?? null; } catch { /* no stored catalog to fall back to */ }
    const until = ports.now() + 30_000;
    stored.set(format, { generation: ports.generation(), until, value });
    // The timer must not hold the document itself, or a released copy would live on for 30 s.
    setTimeout(() => { if (stored.get(format)?.until === until) stored.delete(format); }, 30_000).unref?.();
    return value;
  };
  return Object.assign(read, {
    release: (format: ConstructedCardFormat) => { stored.delete(format); },
    /** The copy already read, without reading the disk; null when none is held. */
    held: (format: ConstructedCardFormat) => held(format)?.value ?? null,
  });
}

/**
 * Anonymous identity may reuse a bounded, explicitly stale snapshot while one
 * refresh runs. Full statistics still await their read; the result caches stay isolated.
 */
export function createConstructedCardCatalogReaders(ports: Ports) {
  const publicBackoff = new Map<string, { generation: number; until: number; error: unknown }>();
  const responseMs = ports.responseDeadlineMs ?? 2_000;
  const loadMs = ports.loadDeadlineMs ?? 20_000;
  // Keys whose shared load already missed the response deadline: until it
  // settles (or the memo expires) callers get the last good version at once.
  const slow = new Map<string, number>();
  const storedCatalog = storedCatalogMemo(ports);
  const keyOf = (withStatistics: boolean, format: ConstructedCardFormat, period: ConstructedCardPeriod,
    rank: ConstructedCardRank) => `${withStatistics ? '' : 'public:'}${format}:${rank}:${period}`;

  const compose = (catalog: Catalog, patch: string | null, statsPayload: Statistics, statsCards: Row[],
    statsWarning: boolean, withStatistics: boolean, period: ConstructedCardPeriod, rank: ConstructedCardRank,
  ): ConstructedCardCollection => {
    const warnings = [
      catalog.dataStatus === 'stale' ? 'Показывается последняя сохранённая версия библиотеки карт.' : '',
      catalog.warning ?? '', statsWarning ? 'Статистика карт временно недоступна.' : '',
    ].filter((warning, index, values) => Boolean(warning) && values.indexOf(warning) === index);
    return {
      cards: mergeConstructedCardRows(catalog.document.cards, statsCards),
      updatedAt: withStatistics ? String(statsPayload?.fetched_at ?? '') || null : catalog.document.publishedAt,
      sourceUrl: String(statsPayload?.url ?? statsPayload?.view?.source ?? '') || ports.origin,
      warning: warnings.join(' ') || null, cacheSource: catalog.cacheSource, dataStatus: catalog.dataStatus,
      partial: false, datasetVersion: catalog.document.datasetVersion,
      catalogVerifiedAt: catalog.document.verifiedAt, catalogPublishedAt: catalog.document.publishedAt,
      period: ports.period(period, { ...statsPayload, patch: patch ?? statsPayload?.patch }),
      rank: ports.rank(rank, statsPayload),
    };
  };

  /** Last good version without waiting for any source: the previous result, else the stored catalog. */
  const fallback = (withStatistics: boolean, format: ConstructedCardFormat, period: ConstructedCardPeriod,
    rank: ConstructedCardRank): ConstructedCardCollection | null => {
    const previous = ports.cache.get(keyOf(withStatistics, format, period, rank))?.value;
    if (previous) return stalePublicCatalog(previous);
    const copy = storedCatalog(format);
    if (!copy) return null;
    return stalePublicCatalog(compose(
      { document: copy.document, cacheSource: 'LKG', dataStatus: 'stale', warning: null },
      null, {}, [], withStatistics, withStatistics, period, rank,
    ));
  };

  const load = async (withStatistics: boolean, format: ConstructedCardFormat,
    period: ConstructedCardPeriod, rank: ConstructedCardRank): Promise<ConstructedCardCollection> => {
    const key = keyOf(withStatistics, format, period, rank);
    const generation = ports.generation();
    const cached = ports.cache.get(key);
    if (cached && cached.expiresAt > ports.now()) return cached.value;
    // Source rebuilds may outlast the page deadline. Only public identity can
    // reuse the verified snapshot; its stale flag still prevents a false 404.
    const previous = !withStatistics && cached
      && cached.expiresAt + Math.min(15 * 60_000, ports.ttlMs * 3) > ports.now() ? cached.value : undefined;
    const backoff = !withStatistics ? publicBackoff.get(key) : undefined;
    if (backoff?.generation === generation && backoff.until > ports.now()) {
      if (previous) return stalePublicCatalog(previous);
      throw backoff.error;
    }
    const active = ports.jobs.get(key);
    if (active && previous) return stalePublicCatalog(previous);
    if (active && (slow.get(key) ?? 0) > ports.now()) {
      const last = fallback(withStatistics, format, period, rank);
      if (last) return last;
    }
    const job = active ?? (() => {
      const created = withDeadline((async () => {
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
        const value = compose(catalog, patch, statsPayload, statsCards, statsWarning, withStatistics, period, rank);
        if (withStatistics && !statsWarning) {
          try { ports.record(format, period, rank, value.updatedAt, value.cards); }
          catch (error) { ports.onHistoryError?.(error); }
        }
        if (ports.generation() === generation) {
          // A collection built on the last good copy after a failed refresh is kept for at most 30 s, like that
          // copy itself (#396), so a recovered source shows up without a five-minute wait. A catalog that loaded
          // but is stale for another reason (stored without a backup) keeps the normal window: no rebuild loop.
          const ttlMs = catalog.fallback ? Math.min(ports.ttlMs, 30_000) : ports.ttlMs;
          ports.cache.set(key, { value, expiresAt: ports.now() + ttlMs });
          publicBackoff.delete(key);
          storedCatalog.release(format);
        }
        return value;
      })(), loadMs, `constructed-cards:${key}`, ports.onDeadline)
        .finally(() => {
          if (ports.jobs.get(key) === created) ports.jobs.delete(key);
          slow.delete(key);
        });
      ports.jobs.set(key, created);
      if (previous) {
        void created.catch(error => {
          if (ports.generation() === generation) publicBackoff.set(key, { generation, until: ports.now() + 30_000, error });
        });
      }
      return created;
    })();
    if (previous && !active) return stalePublicCatalog(previous);
    return answerWithin(job, responseMs, `constructed-cards-response:${key}`, ports.onDeadline, () => {
      slow.set(key, ports.now() + 30_000);
      return fallback(withStatistics, format, period, rank);
    }, cause => new ConstructedCardCatalogUnavailableError(undefined, { cause }));
  };
  return {
    loadCards: (format: ConstructedCardFormat, period: ConstructedCardPeriod = '1d', rank: ConstructedCardRank = 'legend') => load(true, format, period, rank),
    loadPublicCards: (format: ConstructedCardFormat, period: ConstructedCardPeriod = '1d', rank: ConstructedCardRank = 'legend') => load(false, format, period, rank),
    /** Synchronous last good version of the full-statistics reader, for callers with their own deadline. */
    peekCards: (format: ConstructedCardFormat, period: ConstructedCardPeriod = '1d', rank: ConstructedCardRank = 'legend') => fallback(true, format, period, rank),
    /** The same for public identity: the latest public result, else the stored catalog; never reads a source. */
    peekPublicCards: (format: ConstructedCardFormat) => fallback(false, format, '1d', 'legend'),
    heldStoredCatalog: storedCatalog.held,
  };
}

/** Preserves compatibility for injected callers that have not supplied the public reader. */
export function constructedCatalogReaderForAccess(
  readers: Pick<ConstructedCardDataService, 'loadCards' | 'loadPublicCards'>, statsAccess: boolean,
) {
  return statsAccess ? readers.loadCards : readers.loadPublicCards ?? readers.loadCards;
}
