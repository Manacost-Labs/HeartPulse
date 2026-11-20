import { fitMetaDescription, META_DESCRIPTION_MAX, META_TITLE_MAX } from './metaText.js';

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

/**
 * The open facts of a constructed card that its title and description name.
 * Every field may be missing: a card without its set falls back to the ID.
 */
export type ConstructedCardFacts = {
  name: string;
  id: string;
  format: ConstructedCardFormat;
  rulesText?: string | null;
  /** The Russian name of the set, «Власть Темной империи». */
  set?: string | null;
  /** The Hearthstone class code, `PALADIN`; `NEUTRAL` for a neutral card. */
  classCode?: string | null;
  /** The Russian card type, «Существо». */
  type?: string | null;
  /** The Russian rarity, «Легендарная» (agrees with «карта»). */
  rarity?: string | null;
  mana?: number | null;
  attack?: number | null;
  health?: number | null;
  durability?: number | null;
};

const CLASS_GENITIVE: Record<string, string> = {
  DEATHKNIGHT: 'рыцаря смерти', DEMONHUNTER: 'охотника на демонов', DRUID: 'друида', HUNTER: 'охотника',
  MAGE: 'мага', PALADIN: 'паладина', PRIEST: 'жреца', ROGUE: 'разбойника', SHAMAN: 'шамана',
  WARLOCK: 'чернокнижника', WARRIOR: 'воина',
};

// The source text has stray spaces before punctuation («Похищение жизни .»); the browser's plain text drops them.
const clean = (value: string | null | undefined): string => String(value ?? '').replace(/\s+/g, ' ').replace(/ ([.,!?:;…])/g, '$1').trim();
const lowerFirst = (value: string): string => value ? `${value[0].toLocaleLowerCase('ru-RU')}${value.slice(1)}` : value;

/**
 * «Радж — карта Hearthstone (Власть Темной империи) | HearthPulse», shortened to fit.
 * A name repeats across reprints, but not together with its set inside one format
 * (checked over the whole catalog 2026-11-20), so the set replaces the ID; the
 * Wild page of a card says «Вольный», so it never repeats the Standard title.
 * A card without a set keeps the ID.
 */
export function constructedCardTitle(card: ConstructedCardFacts): string {
  const { name, id, format } = card;
  const set = clean(card.set);
  if (!set) {
    const full = FORMAT_FULL[format];
    return fitTitleLadder([
      `${name} — карта Hearthstone (${full}, ${id})${BRAND}`,
      `${name} — карта Hearthstone (${full}, ${id})`,
      `${name} — карта (${full}, ${id})`,
      `${name} (${full}, ${id})`,
      `${name} (${FORMAT_SHORT[format]}, ${id})`,
    ]);
  }
  const scope = format === 'wild' ? `Вольный, ${set}` : set;
  return fitTitleLadder([
    `${name} — карта Hearthstone (${scope})${BRAND}`,
    `${name} — карта Hearthstone (${scope})`,
    `${name} — карта (${scope})`,
    `${name} (${scope})`,
  ]);
}

function manaWord(mana: number): string {
  return mana % 10 === 1 && mana % 100 !== 11 ? 'ману' : 'маны';
}

/** «карта паладина: существо 4/4 за 5 маны, легендарная, набор «Власть Темной империи»», or null without facts. */
function constructedCardFactPhrase(card: ConstructedCardFacts): string | null {
  const type = lowerFirst(clean(card.type));
  const set = clean(card.set);
  if (!type && !set) return null;
  const code = clean(card.classCode).toUpperCase();
  const owner = code === 'NEUTRAL' ? 'нейтральная карта' : CLASS_GENITIVE[code] ? `карта ${CLASS_GENITIVE[code]}` : 'карта';
  const body = card.attack != null && card.health != null ? `${card.attack}/${card.health}`
    : card.attack != null && card.durability != null ? `${card.attack}/${card.durability}` : '';
  const cost = card.mana != null ? `за ${card.mana} ${manaWord(card.mana)}` : '';
  const what = [type, body, cost].filter(Boolean).join(' ');
  const rest = [lowerFirst(clean(card.rarity)), set ? `набор «${set}»` : ''].filter(Boolean).join(', ');
  return `${owner}${what ? `: ${what}` : ''}${rest ? `, ${rest}` : ''}`;
}

/**
 * «Радж — карта паладина: существо 4/4 за 5 маны, легендарная, набор «…». <rules>».
 * The facts lead, so a long rules text cut at the end keeps them; the Wild page
 * names its format right after the card. Without facts the old ID formula stays.
 */
export function constructedCardDescription(card: ConstructedCardFacts): string {
  const rules = clean(card.rulesText);
  const rulesSentence = rules ? `${rules}${/[.!?…]$/.test(rules) ? '' : '.'}` : '';
  const facts = constructedCardFactPhrase(card);
  if (!facts) {
    const lead = `${card.name} (${FORMAT_FULL[card.format]}, ${card.id})`;
    return fitMetaDescription(rulesSentence
      ? `${lead}: ${rulesSentence} Статистика и колоды с картой на HearthPulse.`
      : `${lead} — карта Hearthstone: характеристики, статистика и колоды с картой на HearthPulse.`);
  }
  const lead = `${card.name}${card.format === 'wild' ? ' (Вольный формат)' : ''} — ${facts}.`;
  const tail = 'История изменений и колоды с картой.';
  // A long rules text is cut, never dropped: it is what a reader searches by.
  const variants = [`${lead} ${rulesSentence} ${tail}`, `${lead} ${rulesSentence}`].map(clean);
  return variants.find(text => text.length <= META_DESCRIPTION_MAX) ?? fitMetaDescription(variants[1]);
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
