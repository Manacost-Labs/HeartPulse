import 'server-only';
import { cache } from 'react';
import { publicBattlegroundHero } from './publicBattlegroundHeroData';

/** Loads the anonymous Express projection without forwarding browser cookies. */
export const loadPublicBattlegroundHero = cache(async (dbfId: string) => {
  if (!/^[1-9][0-9]*$/.test(dbfId) || !Number.isSafeInteger(Number(dbfId))) return null;
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL(`/api/bg/heroes/public/${dbfId}`, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public hero projection temporarily unavailable');
  return publicBattlegroundHero(await response.json(), dbfId);
});
