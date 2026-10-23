/**
 * Card changes from the Hearthstone wiki ("Now costs 4 (Down from 5).") turned
 * into short Russian lines with a direction, so the card page can show what
 * actually changed instead of the generic announcement of the patch.
 */
export type CardPatchChangeKind = 'buff' | 'nerf' | 'added' | 'removed' | 'change';

export type CardPatchChange = {
  text: string;
  kind: CardPatchChangeKind;
  /** Flavor text, unlock requirements, Duels buckets, animation fixes: kept apart from the gameplay changes. */
  minor: boolean;
};

export type CardPatchEntry = {
  /** "Патч 32.0", or the raw value when it has no version. */
  version: string;
  date: string | null;
  changes: CardPatchChange[];
  articleUrl: string | null;
  articleTitle: string | null;
  wikiUrl: string | null;
};

const SETS: Record<string, string> = {
  Classic: 'Классический', Legacy: 'Наследие', Basic: 'Базовый', Core: 'Основной',
  'Core reserve': 'резерв Основного', 'Hall of Fame': 'Зал славы', Wild: 'Вольный',
};
const STATS: Record<string, string> = { attack: 'Атака', health: 'Здоровье', durability: 'Прочность', armor: 'Броня' };
const SCHOOLS: Record<string, string> = {
  Arcane: 'Тайная магия', Fire: 'Огонь', Frost: 'Лёд', Nature: 'Природа', Holy: 'Свет', Shadow: 'Тьма', Fel: 'Скверна',
};
const TYPES: Record<string, string> = {
  Beast: 'Зверь', Demon: 'Демон', Dragon: 'Дракон', Elemental: 'Элементаль', Mech: 'Механизм', Murloc: 'Мурлок',
  Naga: 'Нага', Pirate: 'Пират', Quilboar: 'Свинобраз', Totem: 'Тотем', Undead: 'Нежить', Draenei: 'Дреней', All: 'Все',
};
const RARITIES: Record<string, string> = { Free: 'Базовая', Common: 'Обычная', Rare: 'Редкая', Epic: 'Эпическая', Legendary: 'Легендарная' };

const MINOR = /^(?:Flavor text|Golden card unlock|Signature card unlock|Removed (?:golden|signature) card unlock|Signature artist|Artist|Targeting arrow text|bg_premiumDbfId)|Duels|jousting|animation|no longer appears|will no longer|Fixed a bug|Is now considered a/i;

const quoted = (value: string) => value.replace(/^\s*"\s*|\s*"\s*$/g, '').trim();
const set = (value: string) => SETS[value.trim()] ?? value.trim();
const translate = (map: Record<string, string>, value: string) => map[value.trim()] ?? value.trim();

/** One wiki change line as Russian text with a direction; unknown lines keep their English text. */
export function cardPatchChange(raw: string): CardPatchChange {
  // Some lines start with the date of an older patch: "2014-12-04: Moved from …".
  const value = String(raw ?? '').trim().replace(/^\d{1,4}-\d{1,2}-\d{1,4}:\s*/, '');
  const minor = MINOR.test(value);
  let match: RegExpMatchArray | null;
  if (/^Added(?: to the pool of available minions in Battlegrounds)?\.?$/i.test(value)) {
    return { text: /Battlegrounds/i.test(value) ? 'Добавлена в пул Полей сражений' : 'Карта добавлена в игру', kind: 'added', minor: false };
  }
  if (/^Removed\.?$/i.test(value)) return { text: 'Карта убрана', kind: 'removed', minor: false };
  if ((match = value.match(/^Now costs (\d+) \((Up|Down) from (\d+)\)\.?$/i))) {
    return { text: `Стоимость: ${match[3]} → ${match[1]}`, kind: match[2].toLowerCase() === 'down' ? 'buff' : 'nerf', minor: false };
  }
  if ((match = value.match(/^Now has (\d+) (attack|health|durability|armor) \((Up|Down) from (\d+)\)\.?$/i))) {
    const up = match[3].toLowerCase() === 'up';
    return { text: `${STATS[match[2].toLowerCase()]}: ${match[4]} → ${match[1]}`, kind: up ? 'buff' : 'nerf', minor: false };
  }
  if ((match = value.match(/^Is now Tavern Tier (\d+) \((Up|Down) from (\d+)\)\.?$/i))) {
    return { text: `Уровень таверны: ${match[3]} → ${match[1]}`, kind: 'change', minor: false };
  }
  if ((match = value.match(/^Moved from the (.+?) set to the (.+?) set\.?$/i))) {
    return { text: `Перенесена из набора «${set(match[1])}» в «${set(match[2])}»`, kind: 'change', minor: false };
  }
  if (/^Now has a Signature version\.?$/i.test(value)) return { text: 'Появилась сигнатурная версия', kind: 'change', minor: false };
  if ((match = value.match(/^Now reads: "(.+?)"\s*\(previously: "(.+?)"\s*\)\.?$/i))) {
    return { text: `Новый текст: «${quoted(match[1])}» (было: «${quoted(match[2])}»)`, kind: 'change', minor: false };
  }
  if ((match = value.match(/^Spell school is now (\w+) \(previously: (.+?)\)\.?$/i))) {
    return { text: `Школа магии: ${translate(SCHOOLS, match[1])}`, kind: 'change', minor: false };
  }
  if ((match = value.match(/^Minion type is now (\w+) \(previously: (.+?)\)\.?$/i))) {
    return { text: `Тип существа: ${translate(TYPES, match[1])}`, kind: 'change', minor: false };
  }
  if ((match = value.match(/^Rarity is now (\w+) \(previously: (\w+)\)\.?$/i))) {
    return { text: `Редкость: ${translate(RARITIES, match[2])} → ${translate(RARITIES, match[1])}`, kind: 'change', minor: false };
  }
  if (/^No longer banned from Arena/i.test(value)) return { text: 'Снова доступна на Арене', kind: 'change', minor: false };
  if (/^(?:Temporarily )?banned from Arena/i.test(value)) return { text: 'Убрана из драфта Арены', kind: 'change', minor: false };
  return { text: value, kind: 'change', minor };
}

const version = (patch: unknown) => {
  const value = String(patch ?? '').trim();
  const match = value.match(/(\d+)\.(\d+)/);
  return match ? `Патч ${match[1]}.${match[2]}` : value;
};

type WikiPatchEntry = {
  patch?: unknown; date?: unknown; items?: unknown; patch_url?: unknown;
  manacost_url?: unknown; manacost_title?: unknown; manacost_published_at?: unknown;
};

const text = (value: unknown) => String(value ?? '').trim() || null;
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});

/** Wiki patch groups of a card, newest first, with the Manacost article when one matched. */
export function cardPatchEntries(groups: unknown): CardPatchEntry[] {
  const list = Array.isArray(groups) ? groups : [];
  return list.flatMap(group => {
    const entries = record(group).entries;
    return Array.isArray(entries) ? entries.map(entry => record(entry) as WikiPatchEntry) : [];
  })
    .map((entry): CardPatchEntry => ({
      version: version(entry.patch),
      date: text(entry.manacost_published_at) ?? text(entry.date),
      changes: (Array.isArray(entry.items) ? entry.items : []).map(item => cardPatchChange(String(item))),
      articleUrl: text(entry.manacost_url),
      articleTitle: text(entry.manacost_title),
      wikiUrl: text(entry.patch_url),
    }))
    .sort((left, right) => Date.parse(right.date ?? '') - Date.parse(left.date ?? ''));
}
