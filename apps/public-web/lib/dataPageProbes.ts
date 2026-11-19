import 'server-only';
import { PUBLIC_LEGENDARIES_PATH } from '@/src/modules/arenaLegendaries/public';
import { fetchPublicExpress } from './expressApi';
import { heroesRankingPath } from './publicBattlegroundHeroesData';
import { CLASSES_TEASER_PATH } from './publicClassesTeaserData';
import { standardMatchupsPublicPath } from './publicStandardMatchupsData';
import { standardMetaPublicPath } from './publicStandardMetaTeaserData';
import { PUBLIC_TIERLIST_PATH } from './publicTierlistData';

/**
 * The Express read each prerendered data page makes for its first paint, keyed by the page path of
 * `health/next/revalidate`. The route asks it before marking the page stale: a page marked stale
 * while its source is down regenerates without data (or fails), and the visitor loses the good copy.
 */
export const DATA_PAGE_PROBES = {
  '/standard/meta': standardMetaPublicPath(),
  '/articles': '/api/articles',
  '/tierlist': PUBLIC_TIERLIST_PATH,
  '/classes': CLASSES_TEASER_PATH,
  '/legendaries': `${PUBLIC_LEGENDARIES_PATH}?source=hsreplay`,
  '/heroes': heroesRankingPath('solo'),
  '/standard/matchups': standardMatchupsPublicPath,
} as const;

export type DataPageProbePath = keyof typeof DATA_PAGE_PROBES;

/** Whether the source answers 200 with a body that has data (not `null`, not `{}`). */
export async function dataSourceAvailable(path: string): Promise<boolean> {
  try {
    const response = await fetchPublicExpress(path, undefined, { timeoutMs: 5_000 });
    if (response.status !== 200) return false;
    const body: unknown = await response.json();
    return body !== null && typeof body === 'object' && (Array.isArray(body) || Object.keys(body).length > 0);
  } catch {
    return false;
  }
}
