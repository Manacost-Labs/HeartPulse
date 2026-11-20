import type { GuideArchiveItem, GuidesArchiveResponse } from '@/src/features/GuidesArchiveData';

/**
 * The first page of the open guide list as the page keeps it. Express answers `GET /api/guides-archive/public/list`
 * with the card fields only; this parser copies field by field, so nothing else (the paid text, the address
 * of the legacy site) can reach the HTML or the RSC payload even if it arrived. Anything unexpected gives `null`:
 * the page then renders without the list and the browser asks for it.
 */
export const GUIDES_LIST_PATH = '/api/guides-archive/public/list?page=1&limit=18';
const MAX_ITEMS = 48;
const MAX_FILTERS = 40;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nullableText = (value: unknown): string | null | undefined =>
  value === null || value === undefined ? null : typeof value === 'string' && value.length <= 600 ? value : undefined;

function image(value: unknown): string | null | undefined {
  const text = nullableText(value);
  if (!text) return text;
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  try { return new URL(text).protocol === 'https:' ? text : undefined; } catch { return undefined; }
}

function item(value: unknown): GuideArchiveItem | null {
  const row = record(value);
  if (!row || typeof row.id !== 'number' || !Number.isInteger(row.id) || typeof row.slug !== 'string' || !SLUG.test(row.slug)
    || typeof row.title !== 'string' || typeof row.description !== 'string' || row.description.length > 400) return null;
  const cover = image(row.image);
  const publishedAt = nullableText(row.publishedAt);
  const menuName = nullableText(row.menuName);
  const menuCode = nullableText(row.menuCode);
  const kind = nullableText(row.kind);
  const kindSlug = nullableText(row.kindSlug);
  if ([cover, publishedAt, menuName, menuCode, kind, kindSlug].includes(undefined)) return null;
  return { id: row.id, slug: row.slug, title: row.title, description: row.description, image: cover as string | null,
    publishedAt: publishedAt as string | null, menuName: menuName as string | null, menuCode: menuCode as string | null,
    kind: kind as string | null, kindSlug: kindSlug as string | null, oldUrl: null };
}

function filters(value: unknown): GuidesArchiveResponse['filters']['kinds'] | null {
  if (!Array.isArray(value) || value.length > MAX_FILTERS) return null;
  const parsed = value.map(entry => {
    const row = record(entry);
    return row && typeof row.slug === 'string' && typeof row.label === 'string' && typeof row.count === 'number'
      ? { slug: row.slug, label: row.label, count: row.count } : null;
  });
  return parsed.every(entry => entry !== null) ? parsed as GuidesArchiveResponse['filters']['kinds'] : null;
}

export function parsePublicGuidesList(raw: unknown): GuidesArchiveResponse | null {
  const data = record(raw);
  const source = record(data?.filters);
  if (!data || !source || !Array.isArray(data.items) || data.items.length === 0 || data.items.length > MAX_ITEMS) return null;
  const items = data.items.map(item);
  const kinds = filters(source.kinds);
  const menus = filters(source.menus);
  if (items.some(entry => entry === null) || !kinds || !menus || data.page !== 1
    || typeof data.limit !== 'number' || typeof data.total !== 'number' || typeof data.totalPages !== 'number') return null;
  return { page: 1, limit: data.limit, total: data.total, totalPages: data.totalPages, items: items as GuideArchiveItem[],
    filters: { kinds, menus } };
}
