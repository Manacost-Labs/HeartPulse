import 'server-only';
import { cache } from 'react';
import type { CosmeticKind } from '@/src/modules/cosmetics/public';
import { cosmeticsCatalogSeed, cosmeticsCatalogSeedRequest } from './publicCosmeticsCatalogData';
import { readPublicJsonOrNull } from './firstPaintStore';
import { cosmeticsCatalogCheck } from './publicPayloadChecks';

/**
 * First page of a public cosmetics listing for the server-rendered grid, so
 * its pictures load with the document; `null` lets the browser load it.
 */
export const loadPublicCosmeticsCatalog = cache(async (kind: CosmeticKind, search: string) => {
  const request = cosmeticsCatalogSeedRequest(kind, search);
  const raw = await readPublicJsonOrNull(request.url, false, cosmeticsCatalogCheck(kind, request.url));
  return raw === null ? null : cosmeticsCatalogSeed(kind, request.url, raw);
});
