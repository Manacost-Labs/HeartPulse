import { projectPublicBattlegroundLibraryCard, type BattlegroundLibraryKind } from './battlegroundLibrarySeoRoutes.js';
import { createSitemapIndexNowHook } from './indexNow.js';
import { isIndexableBattlegroundLibraryCard } from '../shared/battlegroundLibraryIndexing.js';
import { libraryCardIndexingFacts } from './battlegroundLibraryOpenCard.js';
import { createLibraryStatsStore } from './battlegroundLibraryOpenStats.js';
import { StaleSitemapSourceError } from './entitySitemapDynamicLoader.js';
import {
  loadIndexableArchetypeRows,
  type ArchetypeSitemapSource,
} from './entitySitemapArchetypeSources.js';
import { isIndexableBattlegroundHero } from '../shared/battlegroundHeroIndexing.js';
import { projectBattlegroundHeroRanking, type PublicHeroRankingMode } from './battlegroundHeroRankingProjection.js';

export { selectIndexableArchetypeRows, type ArchetypeSitemapCatalog } from './entitySitemapArchetypeSources.js';
import { createBattlegroundHeroCatalogLoader } from './battlegroundHeroRankingSource.js';
import { projectBattlegroundHeroStats } from './battlegroundHeroStatsProjection.js';
import {
  loadCosmeticsSitemapRows,
  loadGuideArchiveSitemapRows,
  type CosmeticsCatalogLoader,
  type GuideSitemapDatabase,
} from './entitySitemapEditorial.js';

type JsonRecord = Record<string, unknown>;

type SourceOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ConstructedCardLoader = (
  format: 'standard' | 'wild',
) => Promise<{ cards: unknown[]; dataStatus?: string }>;

const BATTLEGROUNDS_ORIGIN = 'http://127.0.0.1:3108';

function minimumFromEnvironment(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 50_000 ? parsed : fallback;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

async function fetchJson(url: string, options: SourceOptions): Promise<JsonRecord> {
  const timeoutMs = Math.max(1, Math.min(25_000, Math.floor(options.timeoutMs ?? 20_000)));
  const response = await (options.fetchImpl ?? fetch)(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HearthPulse/EntitySitemap',
    },
  });
  if (!response.ok) throw new Error(`Entity sitemap catalog HTTP ${response.status}`);
  return record(await response.json());
}

/**
 * Rows of the library segment of the sitemap: the cards the page answers as indexable
 * (`isIndexableBattlegroundLibraryCard`, judged on the same open projection and the same base statistics
 * the page reads). A failing statistics source rejects the whole candidate, so the last known good sitemap
 * stays: a page must never be listed on the strength of figures the source did not give.
 */
export async function loadBattlegroundLibrarySitemapRows(
  kind: BattlegroundLibraryKind,
  options: SourceOptions = {},
): Promise<unknown[]> {
  const [catalogs, slice] = await Promise.all([
    Promise.all([true, false].map(async inPool => {
      const url = new URL('/api/bg/library/cards', BATTLEGROUNDS_ORIGIN);
      url.searchParams.set('card_type', kind);
      url.searchParams.set('in_pool', String(Number(inPool)));
      const payload = await fetchJson(url.href, options);
      if (!Array.isArray(payload.data) || payload.data.length === 0) {
        throw new Error(`Entity sitemap ${kind} catalog is invalid or empty`);
      }
      return payload.data;
    })),
    kind === 'minion'
      ? createLibraryStatsStore({ fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs }).get().then(read => read.slice)
      : Promise.resolve(null),
  ]);
  return catalogs.flat().filter(raw => {
    const source = record(raw);
    const card = projectPublicBattlegroundLibraryCard(source, kind, source.in_pool === true);
    // A broken row stays in the list: the projection of the sitemap rejects it with its own error.
    if (!card) return true;
    const stats = card.inPool ? slice?.byDbf.get(card.dbfId) ?? null : null;
    return isIndexableBattlegroundLibraryCard(libraryCardIndexingFacts(card, stats));
  });
}

function heroRows(payload: JsonRecord): unknown[] {
  if (payload.ok === false) throw new Error('Entity sitemap hero catalog reported an error');
  const heroes = Array.isArray(payload.heroes) ? payload.heroes : record(payload.view).heroes;
  if (!Array.isArray(heroes) || heroes.length === 0) {
    throw new Error('Entity sitemap hero catalog is invalid or empty');
  }
  return heroes;
}

/**
 * Hero rows of the sitemap: the de-duplicated union of solo and Duos heroes that
 * the page answers as indexable (`isIndexableBattlegroundHero`, judged on the
 * same open ranking the page reads). A failing ranking source rejects the whole
 * candidate, so the last known good sitemap stays.
 */
export async function loadBattlegroundHeroSitemapRows(
  options: SourceOptions = {},
): Promise<unknown[]> {
  const loadCatalog = createBattlegroundHeroCatalogLoader({
    fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs, baseUrl: `${BATTLEGROUNDS_ORIGIN}/api/bg/heroes`,
  });
  const ranking = async (mode: PublicHeroRankingMode) => {
    const projected = projectBattlegroundHeroRanking(await loadCatalog(mode), mode);
    if (!projected) throw new Error('Entity sitemap hero ranking is unavailable');
    return projected;
  };
  const [solo, duos, soloRanking, duosRanking] = await Promise.all([
    fetchJson(`${BATTLEGROUNDS_ORIGIN}/api/bg/heroes`, options).then(heroRows),
    fetchJson(`${BATTLEGROUNDS_ORIGIN}/api/bg/heroes?mode=duos`, options).then(heroRows),
    ranking('solo'),
    ranking('duos'),
  ]);
  const seen = new Set<string>();
  return [...solo, ...duos].filter(row => {
    const key = String(record(row).dbfId ?? '');
    if (!/^[1-9][0-9]*$/.test(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    const stats = projectBattlegroundHeroStats(Number(key), { solo: soloRanking, duos: duosRanking });
    return stats !== null && isIndexableBattlegroundHero({ ...stats.modes, heroPowerName: stats.heroPowerName });
  });
}

export function excludeStandardCardsFromWildCatalog(
  standardCards: unknown[],
  wildCards: unknown[],
): unknown[] {
  const standardIds = new Set(standardCards.map(card => record(card).card_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0));
  return wildCards.filter(card => {
    const cardId = record(card).card_id;
    return typeof cardId !== 'string' || !standardIds.has(cardId);
  });
}

type CardCollection = { cards: unknown[]; dataStatus?: string };

/** A stale collection is still usable, but must not be published as a fresh build. */
function freshCards(collection: CardCollection): unknown[] {
  if (collection.dataStatus === 'stale') throw new StaleSitemapSourceError(collection.cards);
  return collection.cards;
}

export function createEntitySitemapLoaders(loadConstructedCards: ConstructedCardLoader) {
  return {
    loadStandardCards: () => loadConstructedCards('standard').then(freshCards),
    loadWildCards: async () => {
      const [standard, wild] = await Promise.all([
        loadConstructedCards('standard'),
        loadConstructedCards('wild'),
      ]);
      const cards = excludeStandardCardsFromWildCatalog(standard.cards, wild.cards);
      if (standard.dataStatus === 'stale' || wild.dataStatus === 'stale') throw new StaleSitemapSourceError(cards);
      return cards;
    },
    loadBattlegroundMinions: () => loadBattlegroundLibrarySitemapRows('minion'),
    // No spell segment: a spell page states four to six facts (name, type, tier, text, mechanics), below the
    // threshold of ten, so every spell page is `noindex` and none belongs in a sitemap. An empty segment is
    // invalid, so the loader is not registered; it returns with the first spell that crosses the line.
    loadBattlegroundHeroes: () => loadBattlegroundHeroSitemapRows(),
  };
}

type EditorialSitemapSources = {
  loadCosmeticsCatalog: CosmeticsCatalogLoader;
  getGuidesDatabase: () => GuideSitemapDatabase;
};

export function createEntitySitemapRuntimeOptions(
  loadConstructedCards: ConstructedCardLoader,
  environment: Record<string, string | undefined>,
  editorial?: EditorialSitemapSources,
  archetypes?: ArchetypeSitemapSource,
) {
  return {
    ...createEntitySitemapLoaders(loadConstructedCards),
    ...(archetypes ? {
      loadArchetypes: () => loadIndexableArchetypeRows(archetypes),
      minimumArchetypeCount: minimumFromEnvironment(environment.SITEMAP_ARCHETYPES_MIN, 30),
    } : {}),
    ...(editorial ? {
      loadCosmetics: () => loadCosmeticsSitemapRows(editorial.loadCosmeticsCatalog),
      loadGuidesArchive: async () => loadGuideArchiveSitemapRows(editorial.getGuidesDatabase()),
      minimumCosmeticsCount: minimumFromEnvironment(environment.SITEMAP_COSMETICS_MIN, 500),
      minimumGuideCount: minimumFromEnvironment(environment.SITEMAP_GUIDES_MIN, 500),
    } : {}),
    minimumStandardCardCount: minimumFromEnvironment(environment.SITEMAP_STANDARD_MIN_CARDS, 500),
    minimumWildCardCount: minimumFromEnvironment(environment.SITEMAP_WILD_MIN_CARDS, 500),
    minimumBattlegroundMinionCount: minimumFromEnvironment(environment.SITEMAP_BG_MIN_MINIONS, 500),
    minimumBattlegroundHeroCount: minimumFromEnvironment(environment.SITEMAP_BG_MIN_HEROES, 80),
    // IndexNow announces each rebuilt segment's changed addresses; production only (server/indexNow.ts).
    onSegmentPublished: createSitemapIndexNowHook(environment.NODE_ENV),
  };
}
