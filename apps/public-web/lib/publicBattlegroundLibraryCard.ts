import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { publicBattlegroundLibraryCard } from './publicBattlegroundLibraryCardData';
import { battlegroundLibraryDetailApiPath, type BattlegroundLibraryPool } from './battlegroundLibraryDetailKinds';
import { decodePublicProjection, MISSING_PUBLIC_PROJECTION,
  PUBLIC_BG_PROJECTION_HEADER, PUBLIC_BG_RELATED_HEADER } from './publicProjectionHeader';
import { fetchPublicExpress } from './expressApi';

function relatedFrom(header: string | null): unknown {
  if (!header) return [];
  try { return decodePublicProjection(header); } catch { return []; }
}

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
  const requestHeaders = await headers();
  const projection = requestHeaders.get(PUBLIC_BG_PROJECTION_HEADER);
  if (projection === MISSING_PUBLIC_PROJECTION) return null;
  // Proxy read the open projection once; the related cards come in a header of their own (the longest prefix that fits).
  if (projection) return publicBattlegroundLibraryCard(
    { ...decodePublicProjection(projection) as object, related: relatedFrom(requestHeaders.get(PUBLIC_BG_RELATED_HEADER)) },
    kind, match[2], pool);
  const response = await fetchPublicExpress(apiPath);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public Battleground card temporarily unavailable');
  return publicBattlegroundLibraryCard(await response.json(), kind, match[2], pool);
});
