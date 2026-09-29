import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { publicBattlegroundHero } from './publicBattlegroundHeroData';
import { decodePublicBattlegroundProjection, MISSING_PUBLIC_BG_PROJECTION,
  PUBLIC_BG_PROJECTION_HEADER } from './publicBattlegroundProjectionHeader';
import { fetchPublicExpress } from './expressApi';

/** Loads the anonymous Express projection without forwarding browser cookies. */
export const loadPublicBattlegroundHero = cache(async (dbfId: string) => {
  if (!/^[1-9][0-9]*$/.test(dbfId) || !Number.isSafeInteger(Number(dbfId))) return null;
  const projection = (await headers()).get(PUBLIC_BG_PROJECTION_HEADER);
  if (projection === MISSING_PUBLIC_BG_PROJECTION) return null;
  if (projection) return publicBattlegroundHero(decodePublicBattlegroundProjection(projection), dbfId);
  const response = await fetchPublicExpress(`/api/bg/heroes/public/${dbfId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public hero projection temporarily unavailable');
  return publicBattlegroundHero(await response.json(), dbfId);
});
