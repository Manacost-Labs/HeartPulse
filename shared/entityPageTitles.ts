import { fitMetaDescription, META_TITLE_MAX } from './metaText.js';

/**
 * Titles and descriptions of the detail pages (a card, a cosmetic item, a
 * Battlegrounds card). Express, the Next server and the browser build the same
 * text from here, so the three places cannot drift apart.
 *
 * A title is a ladder of variants, the fullest first: the first one that fits
 * `META_TITLE_MAX` wins. The brand goes first, then the filler words; what makes
 * a page unique (the format and the ID of a card) stays in every variant.
 */
const BRAND = ' | HearthPulse';

/** The first variant that fits `max`; a name too long for every variant gets the shortest one. */
export function fitTitleLadder(variants: readonly string[], max = META_TITLE_MAX): string {
  return variants.find(variant => variant.length <= max) ?? variants[variants.length - 1];
}

/** A page named by its own title (a guide): the brand is added only while the title still fits. */
export function brandedTitle(title: string): string {
  return fitTitleLadder([`${title}${BRAND}`, title]);
}

export type ConstructedCardFormat = 'standard' | 'wild';

const FORMAT_FULL: Record<ConstructedCardFormat, string> = { standard: 'Стандарт', wild: 'Вольный формат' };
const FORMAT_SHORT: Record<ConstructedCardFormat, string> = { standard: 'Стандарт', wild: 'Вольный' };

/** «Огненный шар — карта Hearthstone (Стандарт, CORE_CS2_029) | HearthPulse», shortened to fit. */
export function constructedCardTitle(card: { name: string; id: string; format: ConstructedCardFormat }): string {
  const { name, id, format } = card;
  const full = FORMAT_FULL[format];
  return fitTitleLadder([
    `${name} — карта Hearthstone (${full}, ${id})${BRAND}`,
    `${name} — карта Hearthstone (${full}, ${id})`,
    `${name} — карта (${full}, ${id})`,
    `${name} (${full}, ${id})`,
    `${name} (${FORMAT_SHORT[format]}, ${id})`,
  ]);
}

/**
 * The format and the ID come right after the name, so a long rules text cut at the end
 * never makes two descriptions the same: not the Standard and the Wild one of a card,
 * not the reprints that share a name and a text.
 */
export function constructedCardDescription(card: {
  name: string; id: string; format: ConstructedCardFormat; rulesText?: string | null;
}): string {
  const lead = `${card.name} (${FORMAT_FULL[card.format]}, ${card.id})`;
  const rules = String(card.rulesText ?? '').replace(/\s+/g, ' ').trim();
  return fitMetaDescription(rules
    ? `${lead}: ${rules}${/[.!?…]$/.test(rules) ? '' : '.'} Статистика и колоды с картой на HearthPulse.`
    : `${lead} — карта Hearthstone: характеристики, статистика и колоды с картой на HearthPulse.`);
}

export type CosmeticTitleKind = 'heroes' | 'coins' | 'pets';

const COSMETIC_NOUN: Record<CosmeticTitleKind, string> = { heroes: 'скин героя', coins: 'монета', pets: 'питомец' };

/**
 * «Тюремщик Старого города — скин героя (Рыцарь смерти, HERO_11bv) | HearthPulse».
 * Skins share names across classes and versions, so a hero skin keeps its ID;
 * coins and pets are unique by name.
 */
export function cosmeticTitle(item: { kind: CosmeticTitleKind; name: string; id?: string; className?: string | null }): string {
  const noun = COSMETIC_NOUN[item.kind];
  if (item.kind !== 'heroes' || !item.id) {
    return fitTitleLadder([`${item.name} — ${noun} Hearthstone${BRAND}`, `${item.name} — ${noun} Hearthstone`, `${item.name} — ${noun}`]);
  }
  const withClass = item.className ? `${item.className}, ${item.id}` : item.id;
  return fitTitleLadder([
    `${item.name} — ${noun} (${withClass})${BRAND}`,
    `${item.name} — ${noun} (${withClass})`,
    `${item.name} — ${noun} (${item.id})`,
    `${item.name} (${item.id})`,
  ]);
}

/** A description that names the item, so two skins never share one. */
export function cosmeticDescription(item: {
  kind: CosmeticTitleKind; name: string; id?: string; className?: string | null; rarity?: string | null;
}): string {
  if (item.kind === 'coins') {
    return fitMetaDescription(`Косметическая монета Hearthstone «${item.name}»: изображение карты, crop-арт и связанные карты.`);
  }
  if (item.kind === 'pets') {
    return fitMetaDescription(`Питомец Hearthstone «${item.name}»: карточка, End Screen, дополнительные арты и другие раскраски семейства.`);
  }
  const facts = [item.className ?? 'класс не указан', item.rarity ?? 'редкость не указана'].join(', ');
  return fitMetaDescription(`Скин героя «${item.name}»: ${facts}${item.id ? `, ID ${item.id}` : ''}. Анимация, полный арт и звуковые дорожки.`);
}

/** «Хромакрылая тень — существо Полей сражений | HearthPulse»; an archive card says so in brackets. */
export function battlegroundCardTitle(card: { name: string; type: string; archive?: boolean }): string {
  const noun = card.type.toLowerCase();
  const tail = card.archive ? ' (архив)' : '';
  return fitTitleLadder([
    `${card.name} — ${noun} Полей сражений${tail}${BRAND}`,
    `${card.name} — ${noun} Полей сражений${tail}`,
    `${card.name} — ${noun}${tail}`,
    card.name,
  ]);
}
