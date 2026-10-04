import type { CatalogPayload, CosmeticsCatalogSeed, HeroSummary } from '@/src/features/Cosmetics';
import { cosmeticsCatalogControls, cosmeticsCatalogRequest, type CosmeticKind } from '@/src/modules/cosmetics/public';

type RecordValue = Record<string, unknown>;
type CatalogItem = CatalogPayload['items'][number];
type RelatedCard = NonNullable<CatalogPayload['related']>[number];

/** The request a listing page makes first: same parser, same URL, so its seed matches. */
export function cosmeticsCatalogSeedRequest(kind: CosmeticKind, search: string) {
  const { filters, page } = cosmeticsCatalogControls(search);
  return cosmeticsCatalogRequest(kind, filters.q, filters, page);
}

class InvalidCatalog extends Error {}

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidCatalog();
  return value as RecordValue;
}

function text(value: unknown, maxLength = 300): string {
  if (typeof value !== 'string' || value.length > maxLength) throw new InvalidCatalog();
  return value;
}

function optionalText(value: unknown, maxLength = 1000): string | null {
  return value === null || value === undefined ? null : text(value, maxLength);
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidCatalog();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidCatalog();
  return value;
}

function cardId(value: unknown): string {
  const id = text(value, 100);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new InvalidCatalog();
  return id;
}

function names(value: unknown): { ru: string; en: string | null } {
  const name = record(value);
  return { ru: text(name.ru), en: optionalText(name.en, 300) };
}

function label(value: unknown): { slug: string; nameRu: string } {
  const entry = record(value);
  return { slug: text(entry.slug, 80), nameRu: text(entry.nameRu, 120) };
}

function hero(raw: unknown): HeroSummary {
  const item = record(raw);
  const images = record(item.images);
  return {
    cardId: cardId(item.cardId), dbf: optionalNumber(item.dbf), name: names(item.name),
    class: label(item.class), rarity: label(item.rarity),
    categorySlugs: Array.isArray(item.categorySlugs) ? item.categorySlugs.map(slug => text(slug, 80)) : [],
    images: { static: optionalText(images.static), animated: optionalText(images.animated) },
  };
}

function coin(raw: unknown): CatalogItem {
  const item = record(raw);
  const images = record(item.images);
  return {
    cardId: cardId(item.cardId), dbf: optionalNumber(item.dbf), name: names(item.name), textRu: optionalText(item.textRu),
    images: { card: optionalText(images.card), crop: optionalText(images.crop) },
  };
}

function petVariant(raw: unknown) {
  const item = record(raw);
  return {
    cardId: cardId(item.cardId), dbf: optionalNumber(item.dbf), variantId: optionalNumber(item.variantId),
    name: text(item.name), level: optionalNumber(item.level), images: { card: optionalText(record(item.images).card) },
  };
}

function pet(raw: unknown): CatalogItem {
  const family = record(raw);
  if (!Array.isArray(family.variants)) throw new InvalidCatalog();
  return { petId: count(family.petId), name: text(family.name), variants: family.variants.map(petVariant) };
}

function related(value: unknown): RelatedCard[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new InvalidCatalog();
  return value.map(raw => {
    const card = record(raw);
    return { cardId: cardId(card.cardId), dbf: optionalNumber(card.dbf), name: names(card.name) };
  });
}

const ITEM: Record<CosmeticKind, (raw: unknown) => CatalogItem> = { heroes: hero, coins: coin, pets: pet };

/**
 * The public catalog page Express answers, rebuilt field by field into what
 * the grid renders. Anything malformed, even one item, returns `null`: the
 * page then loads the catalog in the browser instead of failing its render.
 */
export function cosmeticsCatalogSeed(kind: CosmeticKind, requestUrl: string, raw: unknown): CosmeticsCatalogSeed | null {
  try {
    const payload = record(raw);
    const pagination = record(payload.pagination);
    if (!Array.isArray(payload.items) || payload.items.length > 200) return null;
    const page = count(pagination.page);
    if (page < 1) return null;
    const generatedBy = related(payload.generatedBy);
    const relatedCards = related(payload.related);
    return {
      requestUrl,
      payload: {
        items: payload.items.map(ITEM[kind]),
        ...(generatedBy ? { generatedBy } : {}),
        ...(relatedCards ? { related: relatedCards } : {}),
        pagination: { page, perPage: count(pagination.perPage), total: count(pagination.total), totalPages: count(pagination.totalPages) },
        updatedAt: optionalText(payload.updatedAt, 64),
        source: text(payload.source),
      },
    };
  } catch (error) {
    if (error instanceof InvalidCatalog) return null;
    throw error;
  }
}
