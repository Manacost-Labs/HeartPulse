import {
  constructedCardPath, CONSTRUCTED_CARD_PERIOD_OPTIONS, CONSTRUCTED_CARD_RANK_OPTIONS,
  type CardFormat, type PublicCardCatalogSeed, type PublicCatalogCard,
} from '../../../src/modules/constructedCards/public';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const translations = (value: unknown): Record<string, string> => Object.fromEntries(Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));

function publicCatalogCard(value: unknown, format: CardFormat): PublicCatalogCard {
  const card = record(value); const name = record(card.name); const type = record(card.card_type);
  const id = text(card.card_id); const title = text(name.ru) || text(name.en);
  if (!id || !title) throw new Error('Invalid public catalog card');
  constructedCardPath(format, id);
  return {
    card_id: id, dbf: number(card.dbf), name: { ru: title, en: text(name.en) },
    text: { ru: text(record(card.text).ru) }, flavor: { ru: text(record(card.flavor).ru) },
    class: text(card.class) ?? 'NEUTRAL', card_set: text(card.card_set),
    card_type: { slug: text(type.slug), name_ru: text(type.name_ru) },
    rarity: text(card.rarity), mana_cost: number(card.mana_cost), attack: number(card.attack), health: number(card.health),
    durability: number(card.durability), armor: number(card.armor), artist: text(card.artist),
    images: { card: text(record(card.images).card), crop: text(record(card.images).crop) }, stats: null,
    multi_class: strings(card.multi_class), mechanics: strings(card.mechanics), referenced_tags: strings(card.referenced_tags),
    minion_type: text(card.minion_type), spell_school: text(card.spell_school),
  };
}

export function publicCatalogSeed(payload: unknown, format: CardFormat): PublicCardCatalogSeed {
  const data = record(payload); const period = record(data.period); const facets = record(data.facets); const pagination = record(data.pagination);
  const periodOption = CONSTRUCTED_CARD_PERIOD_OPTIONS.find(item => item.id === period.id);
  const rankOption = CONSTRUCTED_CARD_RANK_OPTIONS.find(item => item.id === data.rank);
  if (data.format !== format || !periodOption || !rankOption || !Array.isArray(data.cards) || data.cards.length > 120
    || !['fresh', 'stale'].includes(String(data.dataStatus))) throw new Error('Invalid public catalog');
  const { page, perPage, total, totalPages } = pagination;
  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1
    || typeof perPage !== 'number' || ![60, 120].includes(perPage)
    || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0
    || typeof totalPages !== 'number' || totalPages !== Math.max(1, Math.ceil(total / perPage)) || page > totalPages
    || data.cards.length > perPage) throw new Error('Invalid public catalog pagination');
  return {
    format, rank: rankOption.id, rankLabel: text(data.rankLabel) ?? rankOption.label,
    period: { id: periodOption.id, label: text(period.label) ?? periodOption.label, timeRange: text(period.timeRange), patch: text(period.patch) },
    updatedAt: text(data.updatedAt), sourceUrl: text(data.sourceUrl) ?? '', statsAccess: false,
    cards: data.cards.map(card => publicCatalogCard(card, format)),
    facets: { classes: strings(facets.classes), sets: strings(facets.sets), mechanics: strings(facets.mechanics), types: strings(facets.types), rarities: strings(facets.rarities) },
    mechanicTranslations: translations(data.mechanicTranslations), mechanicOverrides: translations(data.mechanicOverrides),
    warning: text(data.warning), dataStatus: data.dataStatus === 'stale' ? 'stale' : 'fresh', partial: false,
    datasetVersion: text(data.datasetVersion) ?? '', pagination: { page, perPage, total, totalPages },
  };
}
