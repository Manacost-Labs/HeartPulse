import 'server-only';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { robotsContent } from '@/src/shared/seo/robots';
import { classArchetypes, classDecksIndexable, classDecksSeoText, deckClass, type DeckClass } from './classDecks';
import { createDetailLoader } from './detailLoader';
import { fetchPublicExpress } from './expressApi';
import { loadPublicArchetypeCatalogTeaser } from './publicArchetypeCatalogTeaser';
import { publicArchetypeTeaser, type OpenArchetypeBuild } from './publicArchetypeTeaserData';

/** The details of a page get this long all together; then the page renders, an archetype without its build shows no code. */
export const DETAIL_PAGE_DEADLINE_MS = 2_500;

const LOADER_KEY = Symbol.for('hearthpulse.classDecks.details');

/**
 * Best builds of the deck pages, shared by every render of this server (the pages are bundled apart, so the loader
 * hangs off `globalThis`, like `firstPaintStore`): one read per archetype, 4 in flight and 32 waiting at most, each
 * cancelled 5 s after it was asked for; a build is fresh for a minute and shown for six hours. 300 archetypes kept:
 * the pages reach at most 11 classes × 12.
 */
function details() {
  const holder = globalThis as unknown as { [LOADER_KEY]?: ReturnType<typeof createDetailLoader<OpenArchetypeBuild | null>> };
  return (holder[LOADER_KEY] ??= createDetailLoader<OpenArchetypeBuild | null>({
    read: async (slug, signal) => {
      const response = await fetchPublicExpress(`/api/constructed-archetypes/teaser/standard/${slug}`, signal);
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
      // The first open build: the source orders builds by games.
      return publicArchetypeTeaser(await response.json(), 'standard', slug).openBuilds[0] ?? null;
    },
    maxActive: 4, maxWaiting: 32, capacity: 300, timeoutMs: 5_000, freshMs: 60_000, staleMs: 6 * 60 * 60 * 1000,
  }));
}

/** The Standard catalog teaser the deck pages list (default window, cached per render), or `null`; `proxy.ts` answers 503 without it. */
export const loadDecksCatalog = () => loadPublicArchetypeCatalogTeaser('?format=standard');

/**
 * The best build of each archetype, checked by the detail's allowlist, within `DETAIL_PAGE_DEADLINE_MS` for all of
 * them: the page waits no longer whatever the source does, and a read still in flight goes on for the next visit
 * (`detailLoader.ts`). An archetype without a build in time gets `null` (or its last good build) and its row keeps
 * its numbers without a code.
 */
export async function loadBestBuilds(slugs: readonly string[]): Promise<Map<string, OpenArchetypeBuild | null>> {
  const loader = details();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(slugs.map(slug => loader.load(slug))),
    new Promise(resolve => { timer = setTimeout(resolve, DETAIL_PAGE_DEADLINE_MS); })]);
  clearTimeout(timer);
  return new Map(slugs.map(slug => [slug, loader.get(slug)]));
}

/** The class of a class page, or the page's 404 for any other key. */
export async function resolveDeckClass(params: Promise<{ classKey: string }>): Promise<DeckClass> {
  const entry = deckClass((await params).classKey);
  if (!entry) notFound();
  return entry;
}

/**
 * Metadata of a class page: title and description from its data, robots and canonical from the route inventory;
 * an indexable route still keeps a class below the content threshold out of the index (as archetype pages do).
 */
export async function classDecksMetadata(entry: DeckClass): Promise<Metadata> {
  const [catalog, policy] = await Promise.all([loadDecksCatalog(), resolvePublicUrlPolicy(`/standard/decks/${entry.key}`, '')]);
  const indexable = classDecksIndexable(catalog ? classArchetypes(catalog, entry.key) : []);
  return {
    ...classDecksSeoText(entry, catalog, Date.now()),
    ...(policy.canonicalUrl ? { alternates: { canonical: policy.canonicalUrl } } : {}),
    robots: policy.indexPolicy === 'index' && !indexable ? robotsContent('noindex-follow') : policy.robots,
  };
}
