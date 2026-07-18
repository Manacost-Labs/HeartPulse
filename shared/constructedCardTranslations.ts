export type ConstructedTranslationMap = Record<string, string>;

export function normalizeConstructedTranslationKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Official Russian names used by the current ruRU card data. Some historical
 * keywords were renamed in the client (for example Colossal -> «Гигант» and
 * Spellburst -> «Резонанс»), so these labels intentionally follow the
 * live Russian card text rather than old community terminology.
 */
export const CONSTRUCTED_MECHANIC_TRANSLATIONS: ConstructedTranslationMap = {
  ADAPT: 'Адаптация',
  ADJACENT_BUFF: 'Эффект для соседних карт',
  AFFECTED_BY_SPELL_POWER: 'Усиливается уроном от заклинаний',
  AURA: 'Аура',
  BATTLECRY: 'Боевой клич',
  CANT_ATTACK: 'Не может атаковать',
  CHARGE: 'Рывок',
  CHOOSE_ONE: 'Выберите эффект',
  COLLECTIONMANAGER_FILTER_MANA_EVEN: 'Чётная стоимость',
  COLLECTIONMANAGER_FILTER_MANA_ODD: 'Нечётная стоимость',
  COLOSSAL: 'Гигант',
  COMBO: 'Серия приёмов',
  CORRUPT: 'Порча',
  COUNTER: 'Отмена',
  DEATH_KNIGHT: 'Рыцарь смерти',
  DEATHRATTLE: 'Предсмертный хрип',
  DISCOVER: 'Раскопка',
  DIVINE_SHIELD: 'Божественный щит',
  DREDGE: 'Улов',
  ECHO: 'Эхо',
  ELUSIVE: 'Неуловимость',
  ENRAGED: 'Неполное здоровье',
  EXCAVATE: 'Добыча',
  FINALE: 'Финал',
  FINISH_ATTACK_SPELL_ON_DAMAGE: 'Урон герою после атаки',
  FORGE: 'Ковка',
  FORGETFUL: 'Непредсказуемость',
  FREEZE: 'Заморозка',
  FRENZY: 'Бешенство',
  GEARS: 'Особая раскопка',
  GIGANTIFY: 'Гигантизация',
  GRIMY_GOONS: 'Ржавые Бугаи',
  HEROPOWER_DAMAGE: 'Урон силы героя',
  HONORABLE_KILL: 'Почётная победа',
  IMBUE: 'Заряд силы героя',
  IMMUNE: 'Неуязвимость',
  IMMUNETOSPELLPOWER: 'Не усиливается уроном от заклинаний',
  INFUSE: 'Насыщение',
  INSPIRE: 'Воодушевление',
  INVISIBLEDEATHRATTLE: 'Скрытое срабатывание',
  JADE_GOLEM: 'Нефритовый голем',
  JADE_LOTUS: 'Нефритовый Лотос',
  KABAL: '«Кабал»',
  LIFESTEAL: 'Похищение жизни',
  MAGNETIC: 'Магнетизм',
  MANATHIRST: 'Жажда маны',
  MINIATURIZE: 'Уменьшение',
  MULTIPLY_BUFF_VALUE: 'Усиленный эффект',
  OUTCAST: 'Изгой',
  OVERHEAL: 'Сверхисцеление',
  OVERKILL: 'Сверхурон',
  OVERLOAD: 'Перегрузка',
  POISONOUS: 'Яд',
  QUEST: 'Задача',
  QUICKDRAW: 'Навскидку',
  REBORN: 'Перерождение',
  RECEIVES_DOUBLE_SPELLDAMAGE_BONUS: 'Двойной бонус от урона заклинаний',
  RECRUIT: 'Вербовка',
  RUSH: 'Натиск',
  SECRET: 'Секрет',
  SIDE_QUEST: 'Побочная задача',
  SILENCE: 'Немота',
  SPARE_PART: 'Запасная часть',
  SPELLBURST: 'Резонанс',
  SPELLPOWER: 'Урон от заклинаний',
  STARSHIP: 'Звездолёт',
  STARSHIP_PIECE: 'Часть звездолёта',
  START_OF_GAME_KEYWORD: 'Начало матча',
  STEALTH: 'Маскировка',
  TAUNT: 'Провокация',
  TITAN: 'Титан',
  TRADEABLE: 'Можно обменять',
  TRIGGER_VISUAL: 'Срабатывающий эффект',
  TWINSPELL: 'Дуплет',
  WINDFURY: 'Неистовство ветра',
};

export const CONSTRUCTED_WIKI_TERM_TRANSLATIONS: ConstructedTranslationMap = {
  AREA_OF_EFFECT: 'Массовый эффект',
  ATTACK_RELATED: 'Связано с атакой',
  BATTLEFIELD_RELATED: 'Связано с полем боя',
  COPY: 'Копирование',
  COST_RELATED: 'Связано со стоимостью',
  DEAL_DAMAGE: 'Нанесение урона',
  DECK_RELATED: 'Связано с колодой',
  DECKBUILDING_EFFECT: 'Эффект при сборе колоды',
  DESTROY: 'Уничтожение',
  DISCARD: 'Сброс карт',
  DRAW: 'Взятие карты',
  DRAW_CARDS: 'Взятие карт',
  DRAW_RELATED: 'Связано с взятием карт',
  GAME_RELATED: 'Связано с матчем',
  GENERATE: 'Создание карты',
  GAIN_ARMOR: 'Получение брони',
  HAND_RELATED: 'Связано с рукой',
  HEALING_RELATED: 'Связано с исцелением',
  HERO_POWER_RELATED: 'Связано с силой героя',
  HERO_RELATED: 'Связано с героем',
  IN_DECK_EFFECT: 'Эффект в колоде',
  IN_HAND_EFFECT: 'Эффект в руке',
  NEXT_CARD: 'Следующая карта',
  NEXT_TURN: 'Следующий ход',
  ON_DISCARD_EFFECT: 'Эффект при сбросе',
  ON_DRAW_EFFECT: 'Эффект при взятии',
  ONGOING_EFFECT: 'Постоянный эффект',
  ONE_TIME_EFFECT: 'Одноразовый эффект',
  POSITIONAL_EFFECT: 'Позиционный эффект',
  PUT_INTO_BATTLEFIELD: 'Размещение на поле',
  PUT_INTO_HAND: 'Добавление в руку',
  RANDOM: 'Случайный эффект',
  RESTORE_HEALTH: 'Восстановление здоровья',
  SHUFFLE_INTO_DECK: 'Замешивание в колоду',
  SPELL_RELATED: 'Связано с заклинаниями',
  SUMMON: 'Призыв',
  SUMMONING_RELATED: 'Связано с призывом',
  TARGETED: 'Выбор цели',
  THIS_TURN: 'В этот ход',
  TRIGGERED_EFFECT: 'Срабатывающий эффект',
  TURN_RELATED: 'Связано с ходом',
};

const TERM_STEMS: ConstructedTranslationMap = {
  ADAPT: 'адаптация', ADVENTURER: 'искатель приключений', ALL: 'любой тип', ARCANE: 'тайная магия',
  ARMOR: 'броня', ATTACK: 'атака', ATTACKING: 'атака', AURA: 'аура', BATTLECRY: 'боевой клич',
  BATTLEFIELD: 'поле боя', BEAST: 'звери', BONUS_EFFECT: 'дополнительный эффект', C_THUN: "К'Тун", CARD_SET: 'дополнение',
  CANT_ATTACK: 'запрет атаки', CANT_ATTACK_HEROES: 'запрет атаки героев', CASTS_WHEN_DRAWN: 'при взятии',
  CHARGE: 'рывок', CHOOSE_ONE: 'выбор эффекта', CLASS: 'класс', COIN: 'Монетка', COLOSSAL: 'гигант',
  COMBAT: 'бой', COMBO: 'серия приёмов', CONCOCTION: 'смеси', CORPSE: 'трупы', CORRUPT: 'порча', COST: 'стоимость',
  DAMAGE: 'урон', DAMAGED: 'повреждённые персонажи', DARK_GIFT: 'тёмный дар', DEATH: 'гибель', DEATHRATTLE: 'предсмертный хрип',
  DECK: 'колода', DEMON: 'демоны', DISCARD: 'сброс карт', DISCOVER: 'раскопка', DIVINE_SHIELD: 'божественный щит',
  DORMANT: 'спячка', DRAENEI: 'дренеи', DRAGON: 'драконы', DRAW: 'взятие карт', DURABILITY: 'прочность', ECHO: 'эхо',
  ELEMENTAL: 'элементали', ELUSIVE: 'неуловимость', EMOTE: 'эмоции', EQUIP: 'снаряжение', EXCAVATE: 'добыча', FACTION: 'фракция',
  FATIGUE: 'усталость', FEL: 'Скверна', FIRE: 'огонь', FORGE: 'ковка', FORMAT: 'формат', FREEZE: 'заморозка', FRENZY: 'бешенство',
  FROST: 'лёд', FROZEN: 'замороженные персонажи', GAME: 'матч', HAND: 'рука', HEALING: 'исцеление', HEALTH: 'здоровье',
  HERALD: 'герольд', HERO: 'герой', HERO_POWER: 'сила героя', HOLY: 'Свет', HONORABLE_KILL: 'почётная победа', IMBUE: 'заряд силы героя',
  IMP: 'бесы', INFUSE: 'насыщение', INSPIRE: 'воодушевление', INVOKE: 'воззвание', JADE_GOLEM: 'нефритовый голем',
  KINDRED: 'родство', LACKEY: 'прихвостни', LIBRAM: 'либрамы', LIFESTEAL: 'похищение жизни', LOCATION: 'локация', MAGNETIC: 'магнетизм',
  MANA: 'мана', MANATHIRST: 'жажда маны', MECH: 'механизмы', MEGA_WINDFURY: 'мега-неистовство ветра', MINI: 'миниатюра', MINION_TYPE: 'тип существа',
  MULTI_CLASS: 'несколько классов', MURLOC: 'мурлоки', NAGA: 'наги', NATURE: 'природа', OUTCAST: 'изгой', OVERHEAL: 'сверхисцеление',
  OVERKILL: 'сверхурон', OVERLOAD: 'перегрузка', PIRATE: 'пираты', POISONOUS: 'яд', PREPARE: 'подготовка', QUEST: 'задача', QUICKDRAW: 'навскидку',
  QUILBOAR: 'свинобразы', RARITY: 'редкость', REBORN: 'перерождение', RECRUIT: 'вербовка', RELIC: 'реликвии', REWIND: 'перемотка',
  RUNE: 'руны', RUSH: 'натиск', SECRET: 'секрет', SHADOW: 'Тьма', SHATTER: 'разбитие', SHUFFLE_INTO_DECK: 'замешивание в колоду',
  SIDEQUEST: 'побочная задача', SI_7: 'ШРУ', SILENCE: 'немота', SOUL_FRAGMENT: 'фрагменты душ', SPARE_PART: 'запасная часть',
  SPELL: 'заклинания', SPELL_DAMAGE: 'урон от заклинаний', SPELL_SCHOOL: 'школа магии', SPELLBURST: 'резонанс', SPY_GIZMO: 'шпионский гаджет',
  STARSHIP: 'звездолёт', STARSHIP_PIECE: 'часть звездолёта', STEALTH: 'маскировка', SUMMONED_WHEN_DRAWN: 'призыв при взятии', SUMMONING: 'призыв',
  TAUNT: 'провокация', TEMPORARY: 'временный эффект', TITAN: 'титан', TOTEM: 'тотемы', TRADEABLE: 'обмен', TRANSFORM: 'превращение',
  TREANT: 'древни', TRIGGERED_EFFECT: 'срабатывающий эффект', TURN: 'ход', UNDEAD: 'нежить', WEAPON: 'оружие', WHELP: 'дракончики', WINDFURY: 'неистовство ветра',
};

export const DEFAULT_CONSTRUCTED_TERM_TRANSLATIONS: ConstructedTranslationMap = {
  ...CONSTRUCTED_MECHANIC_TRANSLATIONS,
  ...CONSTRUCTED_WIKI_TERM_TRANSLATIONS,
};

export const CONSTRUCTED_ADMIN_WIKI_TERMS = new Set([
  'COPY', 'DRAW_CARDS', 'DECKBUILDING_EFFECT', 'HAND_RELATED', 'RANDOM',
]);

// HearthstoneJSON uses these values to drive client behaviour or VFX. They are
// not player-facing keywords and must not pollute mechanics filters or detail
// tags even when a descriptive Russian label is technically possible.
export const INTERNAL_CONSTRUCTED_TERM_KEYS = new Set([
  'FINISH_ATTACK_SPELL_ON_DAMAGE',
  'FORGETFUL',
  'GEARS',
  'IMMUNETOSPELLPOWER',
  'INVISIBLEDEATHRATTLE',
  'MULTIPLY_BUFF_VALUE',
  'TRIGGER_VISUAL',
]);

export function isPublicConstructedTerm(value: unknown): boolean {
  const key = normalizeConstructedTranslationKey(value);
  return Boolean(key) && !INTERNAL_CONSTRUCTED_TERM_KEYS.has(key) && !/^\d+$/.test(String(value).trim());
}

export const CONSTRUCTED_TRANSLATION_EXAMPLE_CARD_IDS: ConstructedTranslationMap = {
  COPY: 'JAIL_430',
  DRAW_CARDS: 'JAIL_430',
  DECKBUILDING_EFFECT: 'JAIL_430',
  HAND_RELATED: 'JAIL_430',
  RANDOM: 'JAIL_430',
};

const TRIBE_LABELS: ConstructedTranslationMap = {
  ALL: 'Все типы',
  BEAST: 'Зверь',
  DEMON: 'Демон',
  DRAENEI: 'Дреней',
  DRAGON: 'Дракон',
  ELEMENTAL: 'Элементаль',
  MECH: 'Механизм',
  MECHANICAL: 'Механизм',
  MURLOC: 'Мурлок',
  NAGA: 'Нага',
  PIRATE: 'Пират',
  QUILBOAR: 'Свинобраз',
  TOTEM: 'Тотем',
  UNDEAD: 'Нежить',
};

const SPELL_SCHOOL_LABELS: ConstructedTranslationMap = {
  ARCANE: 'Тайная магия',
  FEL: 'Скверна',
  FIRE: 'Огонь',
  FROST: 'Лёд',
  HOLY: 'Свет',
  NATURE: 'Природа',
  SHADOW: 'Тьма',
};

function overrideTranslation(value: unknown, overrides: ConstructedTranslationMap): string {
  const rawKey = String(value ?? '').trim().toLocaleUpperCase('en-US');
  const canonicalKey = normalizeConstructedTranslationKey(value);
  return String(overrides[rawKey] ?? overrides[canonicalKey] ?? '').trim();
}

function generatedWikiLabel(key: string): string {
  for (const [suffix, prefix] of [
    ['_GENERATING', 'Создание'],
    ['_GRANTING', 'Дарует'],
    ['_RELATED', 'Связано'],
  ] as const) {
    if (!key.endsWith(suffix)) continue;
    const stem = TERM_STEMS[key.slice(0, -suffix.length)];
    if (stem) return `${prefix}: ${stem}`;
  }
  return '';
}

export function translateConstructedMechanic(value: unknown, overrides: ConstructedTranslationMap = {}): string {
  const manual = overrideTranslation(value, overrides);
  if (manual) return manual;
  const key = normalizeConstructedTranslationKey(value);
  if (!key) return '';
  return DEFAULT_CONSTRUCTED_TERM_TRANSLATIONS[key]
    ?? generatedWikiLabel(key)
    ?? String(value).trim();
}

export function constructedWikiTagLabel(value: unknown, overrides: ConstructedTranslationMap = {}): string {
  return translateConstructedMechanic(value, overrides);
}

export function constructedWikiTranslationMap(wiki: unknown): ConstructedTranslationMap {
  if (!wiki || typeof wiki !== 'object') return {};
  const source = wiki as Record<string, unknown>;
  const translations: ConstructedTranslationMap = {};
  for (const field of ['wiki_mechanics_localized', 'wiki_tags_localized']) {
    const items = Array.isArray(source[field]) ? source[field] : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const term = item as Record<string, unknown>;
      const key = normalizeConstructedTranslationKey(term.name_en);
      const nameRu = String(term.name_ru ?? '').trim();
      if (key && nameRu) translations[key] = nameRu;
    }
  }
  return translations;
}

export function mergeConstructedTranslationSources(
  wiki: unknown,
  adminOverrides: ConstructedTranslationMap = {},
): ConstructedTranslationMap {
  const translations = constructedWikiTranslationMap(wiki);
  for (const [rawKey, rawValue] of Object.entries(adminOverrides)) {
    const key = normalizeConstructedTranslationKey(rawKey);
    const value = String(rawValue ?? '').trim();
    if (key && value) translations[key] = value;
  }
  return translations;
}

export function constructedTribeLabel(value: unknown): string {
  const key = normalizeConstructedTranslationKey(value);
  return key ? TRIBE_LABELS[key] ?? String(value).trim() : '—';
}

export function constructedSpellSchoolLabel(value: unknown): string {
  const key = normalizeConstructedTranslationKey(value);
  return key ? SPELL_SCHOOL_LABELS[key] ?? String(value).trim() : '—';
}

const MEDIA_LABELS: ConstructedTranslationMap = {
  REGULAR: 'Обычная карта',
  REGULAR_CARD: 'Обычная карта',
  NORMAL_CARD: 'Обычная карта',
  GOLDEN: 'Золотая карта',
  GOLDEN_CARD: 'Золотая карта',
  GOLDEN_DUPLICATE: 'Золотая карта',
  SIGNATURE: 'Сигнатурная карта',
  SIGNATURE_CARD: 'Сигнатурная карта',
  SIGNATURE_ART: 'Сигнатурный арт',
  DIAMOND: 'Алмазная карта',
  DIAMOND_CARD: 'Алмазная карта',
  FULL_ART: 'Полный арт',
  CARD_ART: 'Арт карты',
  CONCEPT_ART: 'Концепт-арт',
};

export function localizeConstructedMediaLabel(value: unknown, fallback: string): string {
  const label = String(value ?? '')
    .replace(/^File:/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!label) return fallback;
  const key = normalizeConstructedTranslationKey(label);
  if (MEDIA_LABELS[key]) return MEDIA_LABELS[key];
  const suffixes: Array<[RegExp, string]> = [
    [/^(.+?),?\s+full art$/i, 'Полный арт'],
    [/^(.+?),?\s+signature art$/i, 'Сигнатурный арт'],
    [/^(.+?),?\s+concept art$/i, 'Концепт-арт'],
  ];
  for (const [pattern, translated] of suffixes) {
    if (pattern.test(label)) return translated;
  }
  return label;
}

const SOUND_DESCRIPTIONS: Record<string, string> = {
  'music stinger': 'Музыкальная заставка',
  'underlay sound': 'Фоновый звук',
  'summon sound': 'Звук призыва',
  'play sound': 'Звук разыгрывания',
  'attack sound': 'Звук атаки',
  'death sound': 'Звук смерти',
  'trigger sound': 'Звук срабатывания',
  'triggering sound': 'Звук срабатывания',
  death: 'Звук смерти',
};

export function localizeConstructedSoundDescription(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const technical = raw.replace(/^<|>$/g, '').trim().toLocaleLowerCase('en-US');
  return SOUND_DESCRIPTIONS[technical] ?? raw;
}
