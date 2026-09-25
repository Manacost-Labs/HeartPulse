import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { cosmeticsDetailPath, type CosmeticKind } from '../../../src/modules/cosmetics/public';
import type { DetailPayload } from '../../../src/features/Cosmetics';
import { MISSING_COSMETICS_DETAIL_HEADER } from './cosmeticsDetailContract';

/** Loads anonymous detail data from Express without forwarding account cookies. */
export const loadPublicCosmeticsDetail = cache(async (kind: string, cardId: string): Promise<DetailPayload | null> => {
  if (!cosmeticsDetailPath(kind, cardId)) return null;
  if ((await headers()).get(MISSING_COSMETICS_DETAIL_HEADER) === '1') return null;
  let origin: URL;
  try {
    origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  } catch {
    throw new Error('Invalid legacy origin');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL(`/api/cosmetics/${kind}/${cardId}`, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public cosmetics detail temporarily unavailable');
  const detail = await response.json() as DetailPayload;
  if (detail?.cardId !== cardId) throw new Error('Public cosmetics detail identity mismatch');
  return detail;
});

export function typedCosmeticsKind(kind: string): CosmeticKind {
  if (kind !== 'heroes' && kind !== 'coins' && kind !== 'pets') throw new Error('Unsupported cosmetics kind');
  return kind;
}
