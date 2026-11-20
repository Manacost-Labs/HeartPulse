import {
  isLeaderboardSeasonCatalog, isLeaderboardStats, isLeaderboardTable, parseLeaderboardSelection,
} from '@/src/modules/leaderboards/public';
import { isStreamerPage, isStreamersPage } from '@/src/modules/streamers/public';
import { normalizePatchVersion } from '@/src/modules/patchNotes/public';
import { cosmeticsListing } from '@/src/modules/cosmetics/public';
import { readInitialCatalogFilters } from '@/src/features/constructedArchetypeCatalogUrl';
import { isIndexableArchetype } from '@/shared/constructedArchetypeIndexing';
import { deckClass } from './classDecks';
import { COLD_READ_WAIT_MS, readPublicJson, type PublicPayloadCheck } from './firstPaintStore';
import { isCatalogReadLate, isPublicDataMissing } from './publicCatalogCache';
import { patchNotesReader } from './patchNotesStore';
import { cosmeticsCatalogSeedRequest } from './publicCosmeticsCatalogData';
import { probeArchetypeDetailRead } from './publicArchetypeDetailRead';
import { publicArchetypeTeaser } from './publicArchetypeTeaserData';
import { FUN_DECKS_PATH, HOME_PATHS, STREAMERS_PATH, archetypeCatalogPeriod, archetypeTeaserPath, streamerPath } from './publicDataPaths';
import { leaderboardPaths } from './publicLeaderboardPaths';
import {
  archetypeTeaserCheck, cosmeticsCatalogCheck, funDecksCheck, homeArticlesCheck, homeSummaryCheck,
} from './publicPayloadChecks';

/**
 * What a document of a data page has to start with, decided by `proxy.ts`
 * before the page renders (a page cannot set its own status or headers):
 *
 * - `none`: not a data page, or the data is not the question (an unknown
 *   streamer or patch is the page's own 404 or empty state);
 * - `ready`: the data the page lists is in the store, fresh or the last good
 *   copy, and the page renders from it;
 * - `partial`: a page that is useful without part of its data (the home page
 *   without its feeds) renders, but must not be kept by the shared cache;
 * - `unavailable`: no copy and Express did not answer in time, so a document
 *   would be the page without its data: the proxy answers 503 instead.
 *
 * Every read goes through the shared store, so the page that follows finds the
 * answers here instead of asking Express again.
 */
export type DataProbe = 'none' | 'ready' | 'partial' | 'unavailable';

type Read = 'ok' | 'missing' | 'failed';
const read = (path: string, patient = true, check?: PublicPayloadCheck): Promise<Read> => readPublicJson(path, patient, check).then(() => 'ok' as const,
  error => (isPublicDataMissing(error) ? 'missing' as const : 'failed' as const));

/** Reads in parallel; the page needs the `required` ones. */
async function probeReads(required: [string, PublicPayloadCheck], optional: ReadonlyArray<[string, PublicPayloadCheck]> = []): Promise<DataProbe> {
  const [main] = await Promise.all([read(required[0], true, required[1]), ...optional.map(([path, check]) => read(path, true, check))]);
  if (main === 'missing') return 'none';
  return main === 'ok' ? 'ready' : 'unavailable';
}

const SLUG = /^[a-z0-9_]{1,40}$/;
const ARCHETYPE_DETAIL = /^\/standard\/archetypes\/(standard|wild)\/([a-z0-9-]{1,90})$/u;

/**
 * An indexable archetype page (#599) is worth its index for its open builds or for the plates and neighbours it
 * reads from its window's catalog. With neither (every build refused, and the catalog failed or refused with no
 * copy, as after a restart during an outage) it would be a thin page: a 503. Whatever else the detail answers
 * (a 404, an error, an archetype that does not index) is the page's own business, as before.
 */
async function probeArchetypeDetail(format: 'standard' | 'wild', slug: string): Promise<DataProbe> {
  let detail;
  try {
    // The page's own read, handed over to it (`publicArchetypeDetailRead.ts`): no second request, the same deadline.
    const { status, json } = await probeArchetypeDetailRead(format, slug);
    if (status !== 200) return 'none';
    detail = publicArchetypeTeaser(json, format, slug);
  } catch {
    return 'none';
  }
  if (!isIndexableArchetype(detail.item) || detail.openBuilds.length > 0) return 'none';
  // Through the page's store and key. Only a catalog surely not there (failed or a 404, no copy) is a 503; one still on
  // its way when the wait runs out, or another refusal (400, 401: the request, not the source), is served as before.
  try {
    await readPublicJson(archetypeTeaserPath(format, archetypeCatalogPeriod(detail.patch)), true, archetypeTeaserCheck(format));
    return 'ready';
  } catch (error) {
    const refused = isPublicDataMissing(error) && (error as { status?: number }).status !== 404;
    return isCatalogReadLate(error) || refused ? 'none' : 'unavailable';
  }
}

const trimSlash = (pathname: string) => (pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname);

export async function probePublicData(pathname: string, searchParams: URLSearchParams): Promise<DataProbe> {
  const path = trimSlash(pathname);
  const search = searchParams.toString();
  if (path === '/') {
    // The page is worth showing without its feeds, so it does not wait longer for them than it always did.
    const [summary, articles] = await Promise.all([read(HOME_PATHS.summary, false, homeSummaryCheck), read(HOME_PATHS.articles, false, homeArticlesCheck)]);
    return summary === 'ok' && articles === 'ok' ? 'ready' : 'partial';
  }
  if (path === '/leaderboards') {
    const paths = leaderboardPaths(parseLeaderboardSelection(new URLSearchParams(search)));
    return probeReads([paths.table, isLeaderboardTable],
      [[paths.catalog, isLeaderboardSeasonCatalog], [paths.stats, isLeaderboardStats]]);
  }
  if (path === '/streamers') return probeReads([STREAMERS_PATH, isStreamersPage]);
  const streamer = path.match(/^\/streamers\/([^/]+)$/u);
  if (streamer) {
    const slug = streamer[1].toLowerCase();
    return SLUG.test(slug) ? probeReads([streamerPath(slug), isStreamerPage]) : 'none';
  }
  if (path === '/standard/fun-decks') return probeReads([FUN_DECKS_PATH, funDecksCheck]);
  if (path === '/standard/archetypes' || path === '/standard/archetypes/wild') {
    // The Wild catalog's own page (#543) needs Wild's catalog whatever its query says.
    const format = path === '/standard/archetypes/wild' ? 'wild' : readInitialCatalogFilters(search, []).format;
    return probeReads([archetypeTeaserPath(format, null), archetypeTeaserCheck(format)]);
  }
  const archetype = path.match(ARCHETYPE_DETAIL);
  if (archetype) return probeArchetypeDetail(archetype[1] as 'standard' | 'wild', archetype[2]);
  // The deck hub and class pages (#309) are nothing but the Standard catalog: a source that refuses it (a 404 of a
  // rollout) is an outage for them too, not «no such page». An unknown class is the page's own 404.
  const decks = path.match(/^\/standard\/decks(?:\/([^/]+))?$/u);
  if (decks) {
    if (decks[1] && !deckClass(decks[1])) return 'none';
    const catalog = await probeReads([archetypeTeaserPath('standard', null), archetypeTeaserCheck('standard')]);
    return catalog === 'none' ? 'unavailable' : catalog;
  }
  if (path === '/standard/patches') {
    const version = normalizePatchVersion(searchParams.get('version') ?? undefined) || null;
    const reader = patchNotesReader();
    const { patches } = await reader(version, Date.now() + COLD_READ_WAIT_MS);
    if (patches) return 'ready';
    return reader.isMissing(version) ? 'none' : 'unavailable';
  }
  const kind = cosmeticsListing(path)?.kind;
  if (kind) {
    const { url } = cosmeticsCatalogSeedRequest(kind, search);
    return probeReads([url, cosmeticsCatalogCheck(kind, url)]);
  }
  return 'none';
}
