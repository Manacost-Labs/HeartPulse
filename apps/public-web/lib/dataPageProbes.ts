import 'server-only';
import { PUBLIC_LEGENDARIES_PATH } from '@/src/modules/arenaLegendaries/public';
import { fetchPublicExpress } from './expressApi';
import { LIBRARY_INDEX_PATH, LIBRARY_LISTING_KINDS, libraryListingPath } from './publicBattlegroundLibraryListingData';
import { buildsPath } from './publicBattlegroundBuildsData';
import { heroesRankingPath } from './publicBattlegroundHeroesData';
import { CLASSES_TEASER_PATH } from './publicClassesTeaserData';
import { standardMatchupsPublicPath } from './publicStandardMatchupsData';
import { standardMetaPublicPath } from './publicStandardMetaTeaserData';
import { PUBLIC_TIERLIST_PATH } from './publicTierlistData';
import { archetypeTeaserPath } from './publicDataPaths';
import { GUIDES_LIST_PATH } from './publicGuidesListData';
import { VICIOUS_GOLD_PUBLIC_PATH } from '@/shared/viciousGoldPublicContract';

/**
 * The Express read each prerendered data page makes for its first paint, keyed by the page path of
 * `health/next/revalidate`. The route asks it before marking the page stale: a page marked stale
 * while its source is down regenerates without data (or fails), and the visitor loses the good copy.
 */
export const DATA_PAGE_PROBES = {
  '/standard/meta': standardMetaPublicPath(),
  '/standard/meta/wild': standardMetaPublicPath('wild'),
  '/articles': '/api/articles',
  '/tierlist': PUBLIC_TIERLIST_PATH,
  '/classes': CLASSES_TEASER_PATH,
  '/legendaries': `${PUBLIC_LEGENDARIES_PATH}?source=hsreplay`,
  '/heroes': heroesRankingPath('solo'),
  '/standard/matchups': standardMatchupsPublicPath,
  '/standard/vicious-gold': VICIOUS_GOLD_PUBLIC_PATH,
  '/battlegrounds/tier-list': buildsPath('compositions'),
  '/library': LIBRARY_INDEX_PATH,
  ...Object.fromEntries(LIBRARY_LISTING_KINDS.map(kind => [`/library/${kind}`, libraryListingPath(kind)])),
  // A mode hub reads several sources; its probe is the read behind its first rows.
  '/standard': standardMetaPublicPath(),
  '/arena': CLASSES_TEASER_PATH,
  '/battlegrounds': heroesRankingPath('solo'),
  '/wild': archetypeTeaserPath('wild', null),
  '/guides-archive': GUIDES_LIST_PATH,
} as Record<string, string>;

export type DataPageProbePath = string;

/** Whether the source answers 200 with a body that has data (not `null`, not `{}`). */
export async function dataSourceAvailable(path: string): Promise<boolean> {
  try {
    const response = await fetchPublicExpress(path, undefined, { timeoutMs: 5_000, freshOnly: true });
    if (response.status !== 200) return false;
    const body: unknown = await response.json();
    return body !== null && typeof body === 'object' && (Array.isArray(body) || Object.keys(body).length > 0);
  } catch {
    return false;
  }
}
