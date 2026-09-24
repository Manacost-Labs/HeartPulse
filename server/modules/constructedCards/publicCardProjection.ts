type JsonRecord = Record<string, unknown>;
const CANONICAL_ORIGIN = 'https://hearthpulse.net';
const CONSTRUCTED_CARD_ID_PATTERN = /^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/;
export type PublicConstructedCardSeoData = {
  id: string;
  name: string;
  englishName: string | null;
  rulesText: string | null;
  flavorText: string | null;
  set: string | null;
  type: string | null;
  className: string | null;
  rarity: string | null;
  mana: number | null;
  attack: number | null;
  health: number | null;
  durability: number | null;
  armor: number | null;
  artist: string | null;
  image: string | null;
};

const CLASS_LABELS: Record<string, string> = {
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
  NEUTRAL: 'Нейтральная карта',
};
const RARITY_LABELS: Record<string, string> = {
  FREE: 'Базовая',
  COMMON: 'Обычная',
  RARE: 'Редкая',
  EPIC: 'Эпическая',
  LEGENDARY: 'Легендарная',
};
const TYPE_LABELS: Record<string, string> = {
  MINION: 'Существо',
  SPELL: 'Заклинание',
  WEAPON: 'Оружие',
  LOCATION: 'Локация',
  HERO: 'Герой',
  ENCHANTMENT: 'Эффект',
};
const SET_LABELS: Record<string, string> = {
  BE: 'Власть Темной империи',
  ESCAPEFROM_VIOLET_HOLD: 'Побег из Аметистовой крепости',
  CATACLYSM: 'Катаклизм',
  TIME_TRAVEL: 'Сквозь потоки времени',
  THE_LOST_CITY: 'Затерянный город Ун’Горо',
  EMERALD_DREAM: 'В Изумрудный Сон',
  SPACE: 'Бескрайняя тьма',
  ISLAND_VACATION: 'Раздор в тропиках',
  WHIZBANGS_WORKSHOP: 'Мастерская Чудастера',
  WILD_WEST: 'Битва в Бесплодных землях',
  WONDERS: 'Пещеры Времени',
  TITANS: 'ТИТАНЫ',
  BATTLE_OF_THE_BANDS: 'Фестиваль легенд',
  RETURN_OF_THE_LICH_KING: 'Марш Короля-лича',
  PATH_OF_ARTHAS: 'Путь Артаса',
  REVENDRETH: 'Убийство в замке Нафрия',
  THE_SUNKEN_CITY: 'Путешествие в Затонувший город',
  ALTERAC_VALLEY: 'Разделённые Альтераком',
  STORMWIND: 'Сплочённые Штормградом',
  THE_BARRENS: 'Закалённые Степями',
  DARKMOON_FAIRE: 'Ярмарка безумия',
  SCHOLOMANCE: 'Некроситет',
  BLACK_TEMPLE: 'Руины Запределья',
  YEAR_OF_THE_DRAGON: 'Пробуждение Галакронда',
  DRAGONS: 'Натиск драконов',
  ULDUM: 'Спасители Ульдума',
  DALARAN: 'Возмездие теней',
  TROLL: 'Растахановы игрища',
  BOOMSDAY: 'Проект Бумного дня',
  GILNEAS: 'Ведьмин лес',
  LOOTAPALOOZA: 'Кобольды и катакомбы',
  ICECROWN: 'Рыцари Ледяного Трона',
  UNGORO: 'Экспедиция в Ун’Горо',
  GANGS: 'Злачный город Прибамбасск',
  KARA: 'Вечеринка в Каражане',
  OG: 'Пробуждение древних богов',
  LOE: 'Лига исследователей',
  TGT: 'Большой турнир',
  BRM: 'Чёрная гора',
  GVG: 'Гоблины и гномы',
  NAXX: 'Проклятие Наксрамаса',
  DEMON_HUNTER_INITIATE: 'Иллидари',
  EXPERT1: 'Классический набор',
  CORE: 'Основной набор',
  LEGACY: 'Наследие',
  EVENT: 'Событийный набор',
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, maximum = 500): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function plainCatalogText(value: unknown, maximum = 500): string | null {
  const normalized = text(value, maximum * 2);
  if (!normalized) return null;
  const plain = normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain ? plain.slice(0, maximum) : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function codeLabel(value: string | null, labels: Record<string, string>): string | null {
  if (!value) return null;
  const normalized = value.toLocaleUpperCase('en-US');
  return labels[normalized]
    ?? normalized.toLocaleLowerCase('ru').replace(/_/g, ' ').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('ru'));
}

export function isIndexableConstructedCard(card: JsonRecord): boolean {
  const id = text(card.card_id, 80) ?? '';
  const name = record(card.name);
  const publicName = text(name.ru, 180) ?? text(name.en, 180);
  return card.catalogPending !== true
    && CONSTRUCTED_CARD_ID_PATTERN.test(id)
    && Boolean(publicName);
}

export function projectPublicConstructedCardSeoData(
  card: JsonRecord,
  originValue: string | undefined,
  resolveImage: (value: string | null, origin: string, fallback: string) => string | null,
): PublicConstructedCardSeoData {
  const name = record(card.name);
  const cardText = record(card.text);
  const flavor = record(card.flavor);
  const cardType = record(card.card_type);
  const images = record(card.images);
  const id = text(card.card_id, 80) ?? '';
  return {
    id,
    name: text(name.ru, 180) ?? text(name.en, 180) ?? id,
    englishName: text(name.en, 180),
    rulesText: plainCatalogText(cardText.ru ?? cardText.en, 500),
    flavorText: plainCatalogText(flavor.ru ?? flavor.en, 400),
    set: codeLabel(text(card.card_set, 100), SET_LABELS),
    type: text(cardType.name_ru, 100) ?? codeLabel(text(cardType.slug, 100), TYPE_LABELS),
    className: codeLabel(text(card.class, 100), CLASS_LABELS),
    rarity: codeLabel(text(card.rarity, 100), RARITY_LABELS),
    mana: finiteNumber(card.mana_cost),
    attack: finiteNumber(card.attack),
    health: finiteNumber(card.health),
    durability: finiteNumber(card.durability),
    armor: finiteNumber(card.armor),
    artist: text(card.artist, 180),
    image: resolveImage(text(images.card, 1_000), canonicalOrigin(originValue), `${canonicalOrigin(originValue)}/assets/og-preview.png`),
  };
}

function canonicalOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? CANONICAL_ORIGIN);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return CANONICAL_ORIGIN;
    return parsed.origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
}
