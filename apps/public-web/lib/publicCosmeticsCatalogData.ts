import type { CatalogPayload, CosmeticsCatalogSeed } from '@/src/features/Cosmetics';
import { cosmeticsCatalogControls, cosmeticsCatalogRequest, type CosmeticKind } from '@/src/modules/cosmetics/public';

/** The request a listing page makes first: same parser, same URL, so its seed matches. */
export function cosmeticsCatalogSeedRequest(kind: CosmeticKind, search: string) {
  const { filters, page } = cosmeticsCatalogControls(search);
  return cosmeticsCatalogRequest(kind, filters.q, filters, page);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Accepts the public catalog page Express answers (the whole response is the
 * anonymous projection the browser already reads), or returns `null` for
 * anything that does not have the shape the grid renders.
 */
export function cosmeticsCatalogSeed(requestUrl: string, raw: unknown): CosmeticsCatalogSeed | null {
  if (!isRecord(raw) || !Array.isArray(raw.items) || raw.items.length > 200 || !raw.items.every(isRecord)) return null;
  const pagination = raw.pagination;
  if (!isRecord(pagination) || !isCount(pagination.page) || pagination.page < 1 || !isCount(pagination.perPage)
    || !isCount(pagination.total) || !isCount(pagination.totalPages)) return null;
  if (typeof raw.source !== 'string' || !(raw.updatedAt === null || typeof raw.updatedAt === 'string')) return null;
  return { requestUrl, payload: raw as CatalogPayload };
}
