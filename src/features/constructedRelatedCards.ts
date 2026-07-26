type JsonRecord = Record<string, any>;

export type ConstructedRelatedArtMetadata = {
  source: string | null;
  fileTitle: string | null;
  filePageUrl: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  sha1: string | null;
  mime: string | null;
};

export type ConstructedRelatedCard = {
  cardId: string;
  dbf: number | null;
  nameRu: string | null;
  nameEn: string | null;
  textRu: string | null;
  textEn: string | null;
  manaCost: number | null;
  attack: number | null;
  health: number | null;
  artist: string | null;
  cardImageUrl: string | null;
  artUrl: string | null;
  artMetadata: ConstructedRelatedArtMetadata | null;
  wikiUrl: string | null;
};

export type ConstructedRelatedCardGroup = {
  id: string;
  headingRu: string;
  headingEn: string | null;
  cards: ConstructedRelatedCard[];
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown): string | null {
  const result = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return result || null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function mediaUrl(value: unknown): string | null {
  const result = string(value);
  if (!result) return null;
  if (result.startsWith('/') && !result.startsWith('//')) return result;
  try {
    const url = new URL(result);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function relatedCard(value: unknown): ConstructedRelatedCard | null {
  const item = record(value);
  const images = record(item.images);
  const name = record(item.name);
  const cardId = string(item.card_id ?? item.id) ?? '';
  const nameRu = string(name.ru ?? item.name_ru);
  const nameEn = string(name.en ?? (typeof item.name === 'string' ? item.name : null) ?? item.title);
  const cardImageUrl = mediaUrl(images.card ?? item.image_url ?? item.image);
  const artUrl = mediaUrl(images.art);
  const wikiUrl = mediaUrl(record(item.relationship).wiki_url ?? item.url);
  if (!cardId && !nameRu && !nameEn && !cardImageUrl && !artUrl && !wikiUrl) return null;

  const art = record(images.art_metadata);
  const artMetadata = artUrl ? {
    source: string(art.source),
    fileTitle: string(art.file_title),
    filePageUrl: mediaUrl(art.file_page_url),
    width: number(art.width),
    height: number(art.height),
    sizeBytes: number(art.size_bytes),
    sha1: string(art.sha1),
    mime: string(art.mime),
  } : null;

  return {
    cardId,
    dbf: number(item.dbf),
    nameRu,
    nameEn,
    textRu: string(record(item.text).ru),
    textEn: string(record(item.text).en),
    manaCost: number(item.mana_cost),
    attack: number(item.attack),
    health: number(item.health),
    artist: string(item.artist),
    cardImageUrl,
    artUrl,
    artMetadata,
    wikiUrl,
  };
}

function uniqueCards(values: unknown[]): ConstructedRelatedCard[] {
  const seen = new Set<string>();
  return values.flatMap(value => {
    const card = relatedCard(value);
    if (!card) return [];
    const key = (card.cardId || card.wikiUrl || `${card.nameRu ?? card.nameEn}|${card.cardImageUrl ?? ''}`)
      .toLocaleUpperCase('en-US');
    if (seen.has(key)) return [];
    seen.add(key);
    return [card];
  });
}

export function normalizeConstructedRelatedCardGroups(card: JsonRecord): ConstructedRelatedCardGroup[] {
  const localized = Array.isArray(card?.related_cards_localized) ? card.related_cards_localized : [];
  const groups = localized.flatMap((value: unknown, index: number) => {
    const group = record(value);
    const cards = uniqueCards(Array.isArray(group.cards) ? group.cards : []);
    if (cards.length === 0) return [];
    const heading = record(group.heading);
    const headingEn = string(heading.en ?? (typeof group.heading === 'string' ? group.heading : null));
    const headingRu = string(heading.ru) ?? headingEn ?? 'Сопутствующие карты';
    return [{ id: `localized-${index}`, headingRu, headingEn, cards }];
  });
  if (groups.length > 0) return groups;

  const legacy = uniqueCards(Array.isArray(card?.wiki?.related_cards) ? card.wiki.related_cards : []);
  return legacy.length > 0
    ? [{ id: 'legacy-related', headingRu: 'Связанные карты', headingEn: 'Related cards', cards: legacy }]
    : [];
}

