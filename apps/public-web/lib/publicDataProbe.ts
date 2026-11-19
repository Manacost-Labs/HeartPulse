import {
  isLeaderboardSeasonCatalog, isLeaderboardStats, isLeaderboardTable, parseLeaderboardSelection,
} from '@/src/modules/leaderboards/public';
import { isStreamerPage, isStreamersPage } from '@/src/modules/streamers/public';
import { normalizePatchVersion } from '@/src/modules/patchNotes/public';
import { cosmeticsListing } from '@/src/modules/cosmetics/public';
import { readInitialCatalogFilters } from '@/src/features/constructedArchetypeCatalogUrl';
import { COLD_READ_WAIT_MS, readPublicJson, type PublicPayloadCheck } from './firstPaintStore';
import { isPublicDataMissing } from './publicCatalogCache';
import { patchNotesReader } from './patchNotesStore';
import { cosmeticsCatalogSeedRequest } from './publicCosmeticsCatalogData';
import { FUN_DECKS_PATH, HOME_PATHS, STREAMERS_PATH, archetypeTeaserPath, streamerPath } from './publicDataPaths';
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
  if (path === '/standard/archetypes') {
    const { format } = readInitialCatalogFilters(search, []);
    return probeReads([archetypeTeaserPath(format, null), archetypeTeaserCheck(format)]);
  }
  if (path === '/standard/patches') {
    const version = normalizePatchVersion(searchParams.get('version') ?? undefined) || null;
    const reader = patchNotesReader();
    const { patch } = await reader(version, Date.now() + COLD_READ_WAIT_MS);
    if (patch) return 'ready';
    return reader.isMissing(version) ? 'none' : 'unavailable';
  }
  const kind = cosmeticsListing(path)?.kind;
  if (kind) {
    const { url } = cosmeticsCatalogSeedRequest(kind, search);
    return probeReads([url, cosmeticsCatalogCheck(kind, url)]);
  }
  return 'none';
}
