import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import {
  buildsPath, parsePublicBattlegroundBuilds, type BuildsList, type PublicBattlegroundBuilds,
} from './publicBattlegroundBuildsData';

// The last good list of this process, per list. `globalThis`: the page bundles are separate modules.
const lastGood = globalThis as typeof globalThis & { __hpBuildsLastGood?: Partial<Record<BuildsList, PublicBattlegroundBuilds>> };

/**
 * The open builds of one list. A failed read never turns into an empty page: the last good list
 * of this process is used, and with none a prerendered page's regeneration throws (`emptyIsError`,
 * the default), so Next keeps serving the copy it has and tries again on the next request. A page
 * rendered per request has no copy to keep and shows its notice instead. Only the build (which has
 * no Express) renders without the list.
 */
export const loadPublicBattlegroundBuilds = cache(async (list: BuildsList, emptyIsError = true): Promise<PublicBattlegroundBuilds | null> => {
  const fresh = parsePublicBattlegroundBuilds(await readFirstPaintJson(
    signal => fetchPublicExpress(buildsPath(list), signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
    Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
  ), list);
  const store = (lastGood.__hpBuildsLastGood ??= {});
  if (fresh) {
    store[list] = fresh;
    return fresh;
  }
  if (store[list]) return store[list]!;
  if (!emptyIsError || process.env.NEXT_PHASE === 'phase-production-build') return null;
  throw new Error(`Battleground builds (${list}) are unavailable`);
});
