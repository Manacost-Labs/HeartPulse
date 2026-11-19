import 'server-only';
import { cache } from 'react';
import { readPublicJsonOrNull } from './firstPaintStore';
import {
  buildsPath, parsePublicBattlegroundBuilds, type BuildsList, type PublicBattlegroundBuilds,
} from './publicBattlegroundBuildsData';

/**
 * The open builds of one list, read through the last good store of the data pages (`firstPaintStore`): the
 * fresh answer, else the last good one. A failed read never turns into an empty page: with no copy at all a
 * prerendered page's regeneration throws (`emptyIsError`, the default), so Next keeps serving the copy it has
 * and tries again on the next request. A page rendered per request has no copy to keep and shows its notice
 * instead. Only the build (which has no Express) renders without the list.
 */
export const loadPublicBattlegroundBuilds = cache(async (list: BuildsList, emptyIsError = true): Promise<PublicBattlegroundBuilds | null> => {
  const data = parsePublicBattlegroundBuilds(
    await readPublicJsonOrNull(buildsPath(list), false, raw => parsePublicBattlegroundBuilds(raw, list) !== null), list);
  if (data) return data;
  if (!emptyIsError || process.env.NEXT_PHASE === 'phase-production-build') return null;
  throw new Error(`Battleground builds (${list}) are unavailable`);
});
