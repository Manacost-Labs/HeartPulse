import type { BuilderCard, BuilderCatalog, BuilderCatalogQuery, BuilderFacet } from '../model/selection';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {};

function resourcePath(value: unknown, host: string, prefix: string, source: string): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value, 'https://hearthpulse.net');
    const proxyPrefix = `/api/public-resource/${source}${prefix}`;
    if (url.origin === 'https://hearthpulse.net' && url.pathname.startsWith(proxyPrefix)) return `${url.pathname}${url.search}`;
    if (url.protocol === 'https:' && url.hostname === host && url.pathname.startsWith(prefix)) {
      return `/api/public-resource/${source}${url.pathname}${url.search}`;
    }
  } catch { /* Invalid provider URLs have no usable image. */ }
  return '';
}

const kolodaImage = (value: unknown) => resourcePath(value, 'api.kolodahearthstone.com', '/uploads/', 'db');

export function catalogCard(value: unknown, heroClass: string): BuilderCard | null {
  const card = record(value);
  if (typeof card.card_id !== 'string' || !/^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/.test(card.card_id)
    || !Number.isSafeInteger(card.dbf) || Number(card.dbf) <= 0 || Number(card.dbf) > 10_000_000) return null;
  const names = record(card.name);
  const name = typeof names.ru === 'string' && names.ru.trim() ? names.ru : names.en;
  if (typeof name !== 'string' || !name.trim()) return null;
  const classes = [card.class, ...(Array.isArray(card.multi_class) ? card.multi_class : [])]
    .filter((value): value is string => typeof value === 'string').map(value => value.toUpperCase());
  if (!classes.includes(heroClass) && !classes.includes('NEUTRAL')) return null;
  const images = record(card.images);
  const texts = record(card.text);
  const text = typeof texts.ru === 'string' ? texts.ru : typeof texts.en === 'string' ? texts.en : '';
  return {
    id: card.card_id, dbfId: Number(card.dbf), name: name.slice(0, 200),
    cost: Number.isSafeInteger(card.mana_cost) && Number(card.mana_cost) >= 0 ? Number(card.mana_cost) : 0,
    rarity: typeof card.rarity === 'string' ? card.rarity.toUpperCase() : 'COMMON', classes,
    image: kolodaImage(images.card) || `/api/card-image/${encodeURIComponent(card.card_id)}/thumb.webp`,
    tile: kolodaImage(images.tile) || kolodaImage(card.tile_image_url),
    attack: Number.isSafeInteger(card.attack) ? Number(card.attack) : undefined,
    health: Number.isSafeInteger(card.health) ? Number(card.health) : undefined,
    set: typeof card.card_set === 'string' ? card.card_set.toUpperCase() : undefined,
    text: text.replace(/<[^>]*>/g, '').replace(/\[x\]/g, '').slice(0, 2000),
  };
}

/** Reads only anonymous catalog data; the caller owns cancellation on filter changes. */
export async function loadDeckCatalog(query: BuilderCatalogQuery, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<BuilderCatalog> {
  const guest = query.pool === 'tourist' ? query.guestClass : undefined;
  const params = new URLSearchParams({ format: query.format, deckClass: guest ?? query.heroClass,
    page: String(query.page), perPage: '24', sort: query.sort || 'mana', direction: query.direction || 'asc' });
  if (query.query.trim()) params.set('query', query.query.trim());
  if (query.mana) params.set('mana', query.mana);
  if (query.rarity) params.set('rarity', query.rarity);
  if (query.pool) params.set('class', guest ?? (query.pool === 'neutral' ? 'NEUTRAL' : query.heroClass));
  for (const key of ['set', 'type', 'mechanic', 'minionType', 'spellSchool'] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  if (guest) params.set('set', 'ISLAND_VACATION');
  const response = await fetcher(`/api/constructed-cards?${params}`, {
    signal, credentials: 'same-origin', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Не удалось загрузить каталог карт. Попробуйте ещё раз.');
  const data = record(await response.json());
  const pagination = record(data.pagination);
  if (!Array.isArray(data.cards) || !Number.isSafeInteger(pagination.totalPages)
    || Number(pagination.totalPages) < 1 || !Number.isSafeInteger(pagination.total) || Number(pagination.total) < 0) {
    throw new Error('Сервис вернул некорректный каталог карт. Попробуйте ещё раз.');
  }
  const rawFacets = record(data.facets);
  const facets = Object.fromEntries((['sets', 'types', 'mechanics', 'minionTypes', 'spellSchools'] as BuilderFacet[]).map(key =>
    [key, [...new Set((Array.isArray(rawFacets[key]) ? rawFacets[key] : [])
      .filter((value): value is string => typeof value === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(value))
      .map(value => value.toUpperCase()))]])) as Record<BuilderFacet, string[]>;
  const mechanicTranslations = Object.fromEntries(Object.entries(record(data.mechanicTranslations))
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length <= 200));
  return { cards: data.cards.map(value => catalogCard(value, guest ?? query.heroClass)).filter((value): value is BuilderCard => value !== null)
    .filter(card => !guest || card.classes.includes(guest) && card.set === 'ISLAND_VACATION'),
    total: Number(pagination.total), totalPages: Number(pagination.totalPages), facets, mechanicTranslations };
}

export function deckDownloadUrl(value: string): string {
  const path = resourcePath(value, 'api.blizzcore.ru', '/static/generated/', 'deckview');
  if (!path) {
    throw new Error('Сервис вернул некорректную ссылку на изображение. Попробуйте ещё раз.');
  }
  return path;
}

export async function downloadDeckImage(url: string, name: string): Promise<void> {
  const response = await fetchWithDeadline(deckDownloadUrl(url), { deadlineMs: 30_000 });
  if (!response.ok || !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
    throw new Error('Не удалось загрузить изображение колоды. Попробуйте ещё раз.');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
  anchor.download = `${name.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().slice(0, 100) || 'Колода'}.${extension}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
}
