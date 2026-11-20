import 'server-only';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { robotsContent } from '@/src/shared/seo/robots';
import { classArchetypes, classDecksIndexable, classDecksSeoText, deckClass, type DeckClass } from './classDecks';
import { fetchPublicExpress } from './expressApi';
import { loadPublicArchetypeCatalogTeaser } from './publicArchetypeCatalogTeaser';
import { publicArchetypeTeaser, type OpenArchetypeBuild } from './publicArchetypeTeaserData';

/** The details of a page get this long all together; then the page renders, an archetype without its build shows no code. */
export const DETAIL_PAGE_DEADLINE_MS = 2_500;
/** One detail request may take this long before it is cancelled. */
const DETAIL_REQUEST_TIMEOUT_MS = 5_000;
/** Detail requests in flight at once, for every render of every deck page of this server together. */
const DETAIL_REQUESTS_AT_ONCE = 4;
/** A build read this recently is not asked for again. */
const DETAIL_FRESH_MS = 60_000;
/** A last good build older than this is no longer shown. */
const DETAIL_STALE_LIMIT_MS = 6 * 60 * 60 * 1000;
/** Archetypes remembered at most (the Standard catalog has about two hundred). */
const DETAIL_MAX_ENTRIES = 300;

type Entry = { build: OpenArchetypeBuild | null; at: number; loading: Promise<void> | null };
type DetailState = { entries: Map<string, Entry>; active: number; waiting: (() => void)[] };

// The pages are rendered by several bundles of one server: the state hangs off `globalThis`, like `firstPaintStore`.
const STATE_KEY = Symbol.for('hearthpulse.classDecks.details');
function state(): DetailState {
  const holder = globalThis as unknown as { [STATE_KEY]?: DetailState };
  return (holder[STATE_KEY] ??= { entries: new Map(), active: 0, waiting: [] });
}

async function slot(): Promise<() => void> {
  const shared = state();
  if (shared.active >= DETAIL_REQUESTS_AT_ONCE) await new Promise<void>(resolve => { shared.waiting.push(resolve); });
  else shared.active += 1;
  return () => {
    const next = shared.waiting.shift();
    if (next) next(); else shared.active -= 1;
  };
}

/** Reads one detail and keeps its best build: the first open build (the source orders builds by games). */
async function refresh(slug: string, entry: Entry): Promise<void> {
  const release = await slot();
  try {
    const response = await fetchPublicExpress(`/api/constructed-archetypes/teaser/standard/${slug}`, undefined, { timeoutMs: DETAIL_REQUEST_TIMEOUT_MS });
    if (!response.ok) { await response.body?.cancel(); return; }
    entry.build = publicArchetypeTeaser(await response.json(), 'standard', slug).openBuilds[0] ?? null;
    entry.at = Date.now();
  } catch {
    // A failed or cancelled read keeps the last good build.
  } finally {
    release();
    entry.loading = null;
  }
}

/** Starts a read of the detail unless one is in flight or the build is fresh: one request per archetype at a time. */
function load(slug: string): Promise<void> {
  const { entries } = state();
  let entry = entries.get(slug);
  if (!entry) {
    entry = { build: null, at: 0, loading: null };
    entries.set(slug, entry);
    if (entries.size > DETAIL_MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  }
  if (!entry.loading && Date.now() - entry.at >= DETAIL_FRESH_MS) entry.loading = refresh(slug, entry);
  return entry.loading ?? Promise.resolve();
}

/** The Standard catalog teaser the deck pages list (default window, cached per render), or `null`; `proxy.ts` answers 503 without it. */
export const loadDecksCatalog = () => loadPublicArchetypeCatalogTeaser('?format=standard');

/**
 * The best build of each archetype, checked by the detail's allowlist, within `DETAIL_PAGE_DEADLINE_MS` for all of
 * them: the page waits no longer whatever the source does, and a read still in flight goes on for the next visit
 * (reads are shared between renders and capped, never repeated). An archetype without a build in time gets `null`
 * (or its last good build) and its row keeps its numbers without a code.
 */
export async function loadBestBuilds(slugs: readonly string[]): Promise<Map<string, OpenArchetypeBuild | null>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(slugs.map(load)), new Promise(resolve => { timer = setTimeout(resolve, DETAIL_PAGE_DEADLINE_MS); })]);
  clearTimeout(timer);
  const { entries } = state();
  const now = Date.now();
  return new Map(slugs.map(slug => {
    const entry = entries.get(slug);
    return [slug, entry && now - entry.at < DETAIL_STALE_LIMIT_MS ? entry.build : null];
  }));
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
