import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { publicBattlegroundHero } from './publicBattlegroundHeroData';
import { publicBattlegroundHeroStatsOf, type PublicBattlegroundHeroStats } from './publicBattlegroundHeroStats';
import { publicBattlegroundHeroProfileOf, type PublicBattlegroundHeroProfile } from './publicBattlegroundHeroProfile';
import { decodePublicProjection, MISSING_PUBLIC_PROJECTION,
  PUBLIC_BG_PROJECTION_HEADER } from './publicProjectionHeader';
import { fetchPublicExpress } from './expressApi';

const validDbfId = (dbfId: string) => /^[1-9][0-9]*$/.test(dbfId) && Number.isSafeInteger(Number(dbfId));

async function readAnswer(dbfId: string): Promise<unknown | null> {
  const response = await fetchPublicExpress(`/api/bg/heroes/public/${dbfId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public hero projection temporarily unavailable');
  return response.json();
}

/**
 * The anonymous Express projection (identity and open statistics) without
 * forwarding browser cookies. Proxy reads it once and hands it over in a request
 * header; `stats` is `undefined` when the header could not carry it.
 */
const loadProjection = cache(async (dbfId: string) => {
  if (!validDbfId(dbfId)) return null;
  const projection = (await headers()).get(PUBLIC_BG_PROJECTION_HEADER);
  if (projection === MISSING_PUBLIC_PROJECTION) return null;
  const answer = projection ? decodePublicProjection(projection) : await readAnswer(dbfId);
  if (answer === null) return null;
  const carried = !projection || (typeof answer === 'object' && answer !== null && 'stats' in answer);
  return {
    hero: publicBattlegroundHero(answer, dbfId),
    stats: carried ? publicBattlegroundHeroStatsOf(answer) : undefined,
    // The proxy header carries the profile when it fits; otherwise the page reads it itself.
    profile: !projection || (typeof answer === 'object' && answer !== null && 'profile' in answer)
      ? publicBattlegroundHeroProfileOf(answer) : undefined,
  };
});

export const loadPublicBattlegroundHero = async (dbfId: string) => (await loadProjection(dbfId))?.hero ?? null;

/** Open statistics of the hero, `null` when it is not rated or the source has none. Never throws on a missing block. */
export const loadPublicBattlegroundHeroStats = cache(async (dbfId: string): Promise<PublicBattlegroundHeroStats | null> => {
  const projection = await loadProjection(dbfId);
  if (!projection) return null;
  if (projection.stats !== undefined) return projection.stats;
  try { return publicBattlegroundHeroStatsOf(await readAnswer(dbfId)); } catch { return null; }
});

/**
 * Open profile of the hero (game content of the hero library), `null` when the library has none.
 * Read from Express when the proxy header could not carry it; never throws.
 */
export const loadPublicBattlegroundHeroProfile = cache(async (dbfId: string): Promise<PublicBattlegroundHeroProfile | null> => {
  const projection = await loadProjection(dbfId);
  if (!projection) return null;
  if (projection.profile !== undefined) return projection.profile;
  try { return publicBattlegroundHeroProfileOf(await readAnswer(dbfId)); } catch { return null; }
});
