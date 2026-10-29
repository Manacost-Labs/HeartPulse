import type { BattlegroundLibraryKind } from './battlegroundLibrarySeoRoutes.js';
import {
  archetypeIndexingFacts,
  archetypePageSlug,
  type ArchetypeSitemapRow,
} from './entitySitemapProjections.js';
import { isIndexableArchetype } from '../shared/constructedArchetypeIndexing.js';
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
) => Promise<{ cards: unknown[] }>;

/** The catalog the archetype pages open on (`loadArchetypeCatalogForPeriod`), as far as the sitemap reads it. */
export type ArchetypeSitemapCatalog = {
  format: string;
  period: string | null;
  updatedAt: string | null;
  items: unknown[];
};

type ArchetypeSitemapSource = {
  loadCatalog: (format: 'standard') => Promise<ArchetypeSitemapCatalog>;
};

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

export async function loadBattlegroundLibrarySitemapRows(
  kind: BattlegroundLibraryKind,
  options: SourceOptions = {},
): Promise<unknown[]> {
  const catalogs = await Promise.all([true, false].map(async inPool => {
    const url = new URL('/api/bg/library/cards', BATTLEGROUNDS_ORIGIN);
    url.searchParams.set('card_type', kind);
    url.searchParams.set('in_pool', String(Number(inPool)));
    const payload = await fetchJson(url.href, options);
    if (!Array.isArray(payload.data) || payload.data.length === 0) {
      throw new Error(`Entity sitemap ${kind} catalog is invalid or empty`);
    }
    return payload.data;
  }));
  return catalogs.flat();
}

function heroRows(payload: JsonRecord): unknown[] {
  if (payload.ok === false) throw new Error('Entity sitemap hero catalog reported an error');
  const heroes = Array.isArray(payload.heroes) ? payload.heroes : record(payload.view).heroes;
  if (!Array.isArray(heroes) || heroes.length === 0) {
    throw new Error('Entity sitemap hero catalog is invalid or empty');
  }
  return heroes;
}

export async function loadBattlegroundHeroSitemapRows(
  options: SourceOptions = {},
): Promise<unknown[]> {
  const [solo, duos] = await Promise.all([
    fetchJson(`${BATTLEGROUNDS_ORIGIN}/api/bg/heroes`, options).then(heroRows),
    fetchJson(`${BATTLEGROUNDS_ORIGIN}/api/bg/heroes?mode=duos`, options).then(heroRows),
  ]);
  const seen = new Set<string>();
  return [...solo, ...duos].filter(row => {
    const key = String(record(row).dbfId ?? '');
    if (!/^[1-9][0-9]*$/.test(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The archetype rows of the Standard sitemap: those the page of the same
 * catalog answers as indexable. The page serves the first row of a slug, so a
 * later row with the same slug never enters the list, whatever its numbers.
 * Wild is not read at all.
 */
export function selectIndexableArchetypeRows(catalog: ArchetypeSitemapCatalog): ArchetypeSitemapRow[] {
  if (catalog?.format !== 'standard' || !Array.isArray(catalog.items)) {
    throw new Error('Entity sitemap archetype catalog is invalid');
  }
  const seen = new Set<string>();
  return catalog.items.flatMap(item => {
    const slug = archetypePageSlug(item);
    if (slug === null || seen.has(slug)) return [];
    seen.add(slug);
    return isIndexableArchetype(archetypeIndexingFacts(item))
      ? [{ item, updatedAt: catalog.updatedAt, period: catalog.period }]
      : [];
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

export function createEntitySitemapLoaders(loadConstructedCards: ConstructedCardLoader) {
  return {
    loadStandardCards: () => loadConstructedCards('standard').then(collection => collection.cards),
    loadWildCards: async () => {
      const [standard, wild] = await Promise.all([
        loadConstructedCards('standard'),
        loadConstructedCards('wild'),
      ]);
      return excludeStandardCardsFromWildCatalog(standard.cards, wild.cards);
    },
    loadBattlegroundMinions: () => loadBattlegroundLibrarySitemapRows('minion'),
    loadBattlegroundSpells: () => loadBattlegroundLibrarySitemapRows('spell'),
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
      loadArchetypes: async () => selectIndexableArchetypeRows(await archetypes.loadCatalog('standard')),
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
    minimumBattlegroundSpellCount: minimumFromEnvironment(environment.SITEMAP_BG_MIN_SPELLS, 50),
    minimumBattlegroundHeroCount: minimumFromEnvironment(environment.SITEMAP_BG_MIN_HEROES, 80),
  };
}
