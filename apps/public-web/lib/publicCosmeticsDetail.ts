import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { cosmeticsDetailPath, type CosmeticKind } from '@/src/modules/cosmetics/public';
import type { DetailPayload } from '@/src/features/Cosmetics';
import { MISSING_COSMETICS_DETAIL_HEADER } from './cosmeticsDetailContract';
import { fetchPublicExpress } from './expressApi';

/** Loads anonymous detail data from Express without forwarding account cookies. */
export const loadPublicCosmeticsDetail = cache(async (kind: string, cardId: string): Promise<DetailPayload | null> => {
  if (!cosmeticsDetailPath(kind, cardId)) return null;
  if ((await headers()).get(MISSING_COSMETICS_DETAIL_HEADER) === '1') return null;
  const response = await fetchPublicExpress(`/api/cosmetics/${kind}/${cardId}`);
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
