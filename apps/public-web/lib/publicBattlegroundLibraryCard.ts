import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { publicBattlegroundLibraryCard } from './publicBattlegroundLibraryCardData';
import { battlegroundLibraryDetailApiPath, type BattlegroundLibraryPool } from './battlegroundLibraryDetailKinds';
import { decodePublicBattlegroundProjection, MISSING_PUBLIC_BG_PROJECTION,
  PUBLIC_BG_PROJECTION_HEADER } from './publicBattlegroundProjectionHeader';

/** Loads an anonymous card projection without forwarding a browser session. */
export const loadPublicBattlegroundLibraryCard = cache(async (kind: string, slugAndDbfId: string,
  pool: BattlegroundLibraryPool = 'current') => {
  if (slugAndDbfId.length > 600) return null;
  let decodedSlugAndDbfId: string;
  try { decodedSlugAndDbfId = decodeURIComponent(slugAndDbfId); } catch { return null; }
  if (decodedSlugAndDbfId.length > 180) return null;
  const match = decodedSlugAndDbfId.match(/^(.+)-([1-9][0-9]*)$/u);
  if (!match || match[1].length > 80 || !Number.isSafeInteger(Number(match[2]))) return null;
  const apiPath = battlegroundLibraryDetailApiPath(kind, pool, match[2]);
  if (!apiPath) return null;
  const projection = (await headers()).get(PUBLIC_BG_PROJECTION_HEADER);
  if (projection === MISSING_PUBLIC_BG_PROJECTION) return null;
  if (projection) return publicBattlegroundLibraryCard(
    decodePublicBattlegroundProjection(projection), kind, match[2], pool);
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL(apiPath, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public Battleground card temporarily unavailable');
  return publicBattlegroundLibraryCard(await response.json(), kind, match[2], pool);
});
