import 'server-only';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { robotsContent } from '@/src/shared/seo/robots';
import { classArchetypes, classDecksIndexable, classDecksSeoText, deckClass, type DeckClass } from './classDecks';
import { loadPublicArchetypeCatalogTeaser } from './publicArchetypeCatalogTeaser';
import { publicArchetypeTeaser, type OpenArchetypeBuild } from './publicArchetypeTeaserData';
import { readPublicJsonOrNull } from './firstPaintStore';

/** Details read at once: a page asks Express for up to twelve, never all of them in one burst. */
const DETAIL_READS_AT_ONCE = 4;

const detailPath = (slug: string) => `/api/constructed-archetypes/teaser/standard/${slug}`;

function detailCheck(slug: string) {
  return (raw: unknown) => {
    try { publicArchetypeTeaser(raw, 'standard', slug); return true; } catch { return false; }
  };
}

/** The Standard catalog teaser the deck pages list (default window, cached per render), or `null`; `proxy.ts` answers 503 without it. */
export const loadDecksCatalog = () => loadPublicArchetypeCatalogTeaser('?format=standard');

/**
 * The best build of each archetype: the first open build of its public detail (the source orders builds by games),
 * already checked by the detail's allowlist. Reads go through the shared store of last good answers (the same
 * cache the data pages use), at most `DETAIL_READS_AT_ONCE` at a time; an archetype whose detail does not answer
 * gets `null` and its row keeps its numbers without a code.
 */
export async function loadBestBuilds(slugs: readonly string[]): Promise<Map<string, OpenArchetypeBuild | null>> {
  const builds = new Map<string, OpenArchetypeBuild | null>();
  const queue = [...slugs];
  const worker = async () => {
    for (let slug = queue.shift(); slug !== undefined; slug = queue.shift()) {
      const raw = await readPublicJsonOrNull(detailPath(slug), true, detailCheck(slug));
      builds.set(slug, raw === null ? null : publicArchetypeTeaser(raw, 'standard', slug).openBuilds[0] ?? null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DETAIL_READS_AT_ONCE, queue.length) }, worker));
  return builds;
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
