import sanitizeHtml from 'sanitize-html';

export type PublicCardFormat = 'standard' | 'wild';

type JsonRecord = Record<string, unknown>;

export type PublicCardCatalogCollection = {
  cards: JsonRecord[];
  datasetVersion: string;
  dataStatus: 'fresh' | 'stale';
  cacheSource: 'fresh' | 'LKG';
  catalogPublishedAt: string;
};

export type PublicCardCatalogDetail = {
  card: JsonRecord;
  datasetVersion: string;
  dataStatus: 'fresh' | 'stale';
  cacheSource: 'fresh' | 'LKG';
  partial: boolean;
  warning: string | null;
};

export type PublicCardCatalogSource = {
  loadCards: (format: PublicCardFormat) => Promise<PublicCardCatalogCollection>;
  loadCardDetail: (
    format: PublicCardFormat,
    cardId: string,
  ) => Promise<PublicCardCatalogDetail | null>;
};

export type PublicCardImages = {
  thumb: string;
  full: string;
  tile: string;
};

export type PublicCardSummary = {
  id: string;
  dbfId: number | null;
  slug: string | null;
  collectible: boolean;
  formats: PublicCardFormat[];
  name: { ru: string | null; en: string | null };
  text: { ru: string | null; en: string | null };
  flavor: { ru: string | null; en: string | null };
  set: string | null;
  type: { id: string | null; nameRu: string | null };
  rarity: string | null;
  cardClass: string | null;
  multiClass: string[];
  minionType: string | null;
  minionTypes: string[];
  spellSchool: string | null;
  cost: number | null;
  attack: number | null;
  health: number | null;
  durability: number | null;
  armor: number | null;
  artist: string | null;
  mechanics: string[];
  referencedTags: string[];
  keywordIds: number[];
  releasedAt: string | null;
  images: PublicCardImages;
};

export type PublicRelatedCard = {
  id: string | null;
  name: { ru: string | null; en: string | null };
  images: PublicCardImages | null;
};

export type PublicCardDetail = PublicCardSummary & {
  relatedCards: Array<{ heading: string | null; cards: PublicRelatedCard[] }>;
  generatedCardPools: Array<{ name: string | null; cards: PublicRelatedCard[] }>;
};

export type PublicCardListResult = {
  data: PublicCardSummary[];
  pagination: {
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  meta: {
    format: PublicCardFormat;
    datasetVersion: string;
    dataStatus: 'fresh' | 'stale';
    publishedAt: string;
  };
  cacheSource: 'fresh' | 'LKG';
};

export type PublicCardDetailResult = {
  data: PublicCardDetail;
  meta: {
    format: PublicCardFormat;
    datasetVersion: string;
    dataStatus: 'fresh' | 'stale';
    partial: boolean;
    warning: string | null;
  };
  cacheSource: 'fresh' | 'LKG';
};

export class PublicCardQueryError extends Error {
  constructor() {
    super('Card catalog query is invalid');
    this.name = 'PublicCardQueryError';
  }
}

const CARD_ID_PATTERN = /^[A-Za-z0-9_]{2,80}$/;
const FILTER_PATTERN = /^[A-Za-z0-9_]{1,80}$/;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;
const HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'br'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function publicTerm(value: unknown): string | null {
  const normalized = boundedString(value, 80)?.toUpperCase() ?? null;
  return normalized && FILTER_PATTERN.test(normalized) ? normalized : null;
}

function localized(value: unknown, options?: { html?: boolean; maxLength?: number }) {
  const source = record(value);
  const normalize = (item: unknown) => {
    const text = boundedString(item, options?.maxLength ?? 4_000);
    return text && options?.html ? sanitizeHtml(text, HTML_OPTIONS) || null : text;
  };
  return { ru: normalize(source.ru), en: normalize(source.en) };
}

function finiteInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function uniqueTerms(value: unknown, maxItems = 64): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    const term = publicTerm(item);
    return term ? [term] : [];
  }))].slice(0, maxItems);
}

function uniquePositiveIntegers(value: unknown, maxItems = 64): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    const number = finiteInteger(item);
    return number !== null && number > 0 ? [number] : [];
  }))].slice(0, maxItems);
}

function publicFormats(value: unknown): PublicCardFormat[] {
  if (!Array.isArray(value)) return [];
  return [...new Set<PublicCardFormat>(value.flatMap<PublicCardFormat>(item => {
    const slug = boundedString(record(item).slug ?? item, 20)?.toLocaleLowerCase('en-US');
    return slug === 'standard' || slug === 'wild' ? [slug as PublicCardFormat] : [];
  }))];
}

function publicTimestamp(value: unknown): string | null {
  const text = boundedString(value, 80);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function imageLinks(cardId: string): PublicCardImages {
  const encoded = encodeURIComponent(cardId);
  const root = `/api/v1/cards/${encoded}/images`;
  return {
    thumb: `${root}/thumb.webp`,
    full: `${root}/full.webp`,
    tile: `${root}/tile.webp`,
  };
}

/** Maps the provider record to the stable, explicitly allowlisted v1 schema. */
export function serializePublicCard(rawValue: unknown): PublicCardSummary {
  const raw = record(rawValue);
  const id = boundedString(raw.card_id, 80);
  if (!id || !CARD_ID_PATTERN.test(id)) {
    throw new PublicCardQueryError();
  }
  const cardType = record(raw.card_type);
  return {
    id,
    dbfId: finiteInteger(raw.dbf),
    slug: boundedString(raw.slug, 160),
    collectible: raw.collectible === true,
    formats: publicFormats(raw.formats),
    name: localized(raw.name, { maxLength: 240 }),
    text: localized(raw.text, { html: true, maxLength: 8_000 }),
    flavor: localized(raw.flavor, { maxLength: 4_000 }),
    set: publicTerm(raw.card_set),
    type: {
      id: publicTerm(cardType.slug),
      nameRu: boundedString(cardType.name_ru, 120),
    },
    rarity: publicTerm(raw.rarity),
    cardClass: publicTerm(raw.class),
    multiClass: uniqueTerms(raw.multi_class, 12),
    minionType: publicTerm(raw.minion_type),
    minionTypes: uniqueTerms(raw.minion_types, 12),
    spellSchool: publicTerm(raw.spell_school),
    cost: finiteInteger(raw.mana_cost),
    attack: finiteInteger(raw.attack),
    health: finiteInteger(raw.health),
    durability: finiteInteger(raw.durability),
    armor: finiteInteger(raw.armor),
    artist: boundedString(raw.artist, 240),
    mechanics: uniqueTerms(raw.mechanics),
    referencedTags: uniqueTerms(raw.referenced_tags),
    keywordIds: uniquePositiveIntegers(raw.keyword_ids),
    releasedAt: publicTimestamp(raw.released_at ?? raw.release_date),
    images: imageLinks(id),
  };
}

function relationName(value: JsonRecord) {
  const fromName = localized(value.name, { maxLength: 240 });
  return {
    ru: fromName.ru ?? boundedString(value.name_ru, 240),
    en: fromName.en ?? boundedString(value.name_en ?? value.title, 240),
  };
}

function serializeRelatedCard(value: unknown): PublicRelatedCard | null {
  const source = record(value);
  const candidateId = boundedString(source.card_id ?? source.id, 80);
  const id = candidateId && CARD_ID_PATTERN.test(candidateId) ? candidateId : null;
  const name = relationName(source);
  if (!id && !name.ru && !name.en) return null;
  return { id, name, images: id ? imageLinks(id) : null };
}

function relatedCardGroups(value: unknown): PublicCardDetail['relatedCards'] {
  if (!Array.isArray(value)) return [];
  const grouped = value.some(item => Array.isArray(record(item).cards));
  if (!grouped) {
    const cards = value.flatMap(item => {
      const card = serializeRelatedCard(item);
      return card ? [card] : [];
    });
    return cards.length > 0 ? [{ heading: null, cards }] : [];
  }
  return value.flatMap(groupValue => {
    const group = record(groupValue);
    const cards = Array.isArray(group.cards)
      ? group.cards.flatMap(item => {
        const card = serializeRelatedCard(item);
        return card ? [card] : [];
      })
      : [];
    return cards.length > 0
      ? [{ heading: boundedString(group.heading, 160), cards }]
      : [];
  });
}

function generatedCardPools(value: unknown): PublicCardDetail['generatedCardPools'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(poolValue => {
    const pool = record(poolValue);
    const cards = Array.isArray(pool.cards)
      ? pool.cards.flatMap(item => {
        const card = serializeRelatedCard(item);
        return card ? [card] : [];
      })
      : [];
    return cards.length > 0
      ? [{ name: boundedString(pool.pool ?? pool.name, 160), cards }]
      : [];
  });
}

export function serializePublicCardDetail(rawValue: unknown): PublicCardDetail {
  const raw = record(rawValue);
  const wiki = record(raw.wiki);
  return {
    ...serializePublicCard(raw),
    relatedCards: relatedCardGroups(wiki.related_cards),
    generatedCardPools: generatedCardPools(wiki.generated_card_pools),
  };
}

function singleQueryValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new PublicCardQueryError();
  return value.trim();
}

function queryTerm(value: unknown): string {
  const text = singleQueryValue(value);
  if (!text) return '';
  const normalized = text.toUpperCase();
  if (!FILTER_PATTERN.test(normalized)) throw new PublicCardQueryError();
  return normalized;
}

function querySearch(value: unknown): string {
  const text = singleQueryValue(value);
  if (text.length > 120) throw new PublicCardQueryError();
  return text.toLocaleLowerCase('ru');
}

function queryFormat(value: unknown, fallback: PublicCardFormat): PublicCardFormat {
  const text = singleQueryValue(value).toLocaleLowerCase('en-US');
  if (!text) return fallback;
  if (text === 'standard' || text === 'wild') return text;
  throw new PublicCardQueryError();
}

function queryLimit(value: unknown): number {
  const text = singleQueryValue(value);
  if (!text) return DEFAULT_LIMIT;
  if (!/^[1-9]\d{0,3}$/.test(text)) throw new PublicCardQueryError();
  const limit = Number(text);
  if (!Number.isSafeInteger(limit) || limit > MAX_LIMIT) throw new PublicCardQueryError();
  return limit;
}

function decodeCursor(value: unknown): string | null {
  const text = singleQueryValue(value);
  if (!text) return null;
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(text)) throw new PublicCardQueryError();
  const decoded = Buffer.from(text, 'base64url').toString('utf8');
  const match = /^v1:([A-Za-z0-9_]{2,80})$/.exec(decoded);
  if (!match || Buffer.from(decoded).toString('base64url') !== text) throw new PublicCardQueryError();
  return match[1].toUpperCase();
}

function encodeCursor(cardId: string): string {
  return Buffer.from(`v1:${cardId.toUpperCase()}`).toString('base64url');
}

function searchable(card: PublicCardSummary): string {
  return [
    card.id,
    card.dbfId,
    card.name.ru,
    card.name.en,
    card.text.ru,
    card.text.en,
  ].filter(value => value !== null).join(' ').toLocaleLowerCase('ru');
}

function includesTerm(values: Array<string | null>, term: string): boolean {
  return !term || values.some(value => value === term);
}

/**
 * Provides bounded, deterministic pagination over the authoritative
 * constructed-card catalog without exposing provider-specific records.
 */
export function createPublicCardCatalog(source: PublicCardCatalogSource) {
  const serializedCatalogs = new Map<
    PublicCardFormat,
    { datasetVersion: string; cards: PublicCardSummary[] }
  >();

  const serializedCards = (
    format: PublicCardFormat,
    collection: PublicCardCatalogCollection,
  ): PublicCardSummary[] => {
    const cached = serializedCatalogs.get(format);
    if (cached?.datasetVersion === collection.datasetVersion) return cached.cards;
    const cards = collection.cards
      .map(serializePublicCard)
      .sort((left, right) => left.id.localeCompare(right.id, 'en', {
        numeric: true,
        sensitivity: 'base',
      }));
    serializedCatalogs.set(format, { datasetVersion: collection.datasetVersion, cards });
    return cards;
  };

  return {
    async list(query: Record<string, unknown>): Promise<PublicCardListResult> {
      const format = queryFormat(query.format, 'standard');
      const search = querySearch(query.query);
      const cardClass = queryTerm(query.class);
      const set = queryTerm(query.set);
      const type = queryTerm(query.type);
      const rarity = queryTerm(query.rarity);
      const mechanic = queryTerm(query.mechanic);
      const limit = queryLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const collection = await source.loadCards(format);
      const cards = serializedCards(format, collection)
        .filter(card => (!search || searchable(card).includes(search))
          && includesTerm([card.cardClass, ...card.multiClass], cardClass)
          && includesTerm([card.set], set)
          && includesTerm([card.type.id], type)
          && includesTerm([card.rarity], rarity)
          && includesTerm([...card.mechanics, ...card.referencedTags], mechanic));
      const start = cursor
        ? cards.findIndex(card => card.id.toUpperCase().localeCompare(cursor, 'en', {
          numeric: true,
          sensitivity: 'base',
        }) > 0)
        : 0;
      const safeStart = start < 0 ? cards.length : start;
      const data = cards.slice(safeStart, safeStart + limit);
      const hasMore = safeStart + data.length < cards.length;
      return {
        data,
        pagination: {
          limit,
          total: cards.length,
          hasMore,
          nextCursor: hasMore && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null,
        },
        meta: {
          format,
          datasetVersion: collection.datasetVersion,
          dataStatus: collection.dataStatus,
          publishedAt: collection.catalogPublishedAt,
        },
        cacheSource: collection.cacheSource,
      };
    },

    async detail(formatValue: unknown, cardIdValue: unknown): Promise<PublicCardDetailResult | null> {
      const format = queryFormat(formatValue, 'wild');
      const cardId = singleQueryValue(cardIdValue);
      if (!CARD_ID_PATTERN.test(cardId)) throw new PublicCardQueryError();
      const result = await source.loadCardDetail(format, cardId.toUpperCase());
      if (!result) return null;
      return {
        data: serializePublicCardDetail(result.card),
        meta: {
          format,
          datasetVersion: result.datasetVersion,
          dataStatus: result.dataStatus,
          partial: result.partial,
          warning: boundedString(result.warning, 500),
        },
        cacheSource: result.cacheSource,
      };
    },
  };
}
