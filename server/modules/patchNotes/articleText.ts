import type { PatchNotesChange, PatchNotesMode } from './contract.js';

/* Line grammar of the stored hs-manacost.ru patch articles: patterns, cleanup and stated values. */

export const BEFORE = /^До\s+изменени[яй]\s*:\s*(.*)$/i;
export const AFTER = /^После\s*:\s*(.*)$/i;
export const COMMENT = /^Комментарий\s+разработчиков\s*:\s*(.*)$/i;
export const COST_LINE = /^(.{2,80}?)\s*:\s*(\d{1,2})\s*→\s*(\d{1,2})$/;
export const NEW_COST = /^Новая\s+стоимость\s*:\s*(\d{1,2})$/i;
/** "(Бранн Бронзобород)" under a hero power names whose power it is. */
export const QUALIFIER = /^\(([^()]{1,80})\)$/;
export const ARMOR_TABLE = /^Герой\s+Обычная\s+игра\s+Дуэты\s+(.+)$/i;
export const ARMOR_ROW = /([^\d→]+?)\s+(\d{1,2})\s*→\s*(\d{1,2})\s+(\d{1,2})\s*→\s*(\d{1,2})/g;
export const CHANGE_HEADING = /^изменени/i;
export const GENERAL_HEADING = /^(?:общие|другие)\s+изменени/i;
/** The article footer: community links after the last change. */
export const FOOTER = /^(?:Наша группа|Также ждем|vk\.com\/|t\.me\/)/i;
export const COLLAPSE_HINT = /^Нажмите,\s+чтобы\s+открыть$/i;

/**
 * The article puts spaces before punctuation around its highlighted words
 * ("меньше .", "После :", "« Предсмертным"). Both sides of a change are cleaned
 * the same way, so the word diff marks only the real edit.
 */
export function cleanArticleText(value: string): string {
  return value
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;!?»)])/g, '$1')
    .replace(/([«(])\s+/g, '$1')
    .trim();
}

const MODE_RULES: [RegExp, PatchNotesMode, string | null][] = [
  [/пол(?:ей|я|ях|ям)\s+сражени/i, 'battlegrounds', null],
  [/арен/i, 'arena', null],
  [/дуэл/i, 'other', 'Дуэли'],
  [/твист/i, 'other', 'Твист'],
  [/на[её]мник/i, 'other', 'Наемники'],
  [/hearthstone|стандарт|вольн|карт/i, 'constructed', null],
];

/** The mode a heading opens; headings like "Исправления ошибок" keep the current one. */
export function modeOf(heading: string, current: { mode: PatchNotesMode; label: string | null }) {
  const rule = MODE_RULES.find(([pattern]) => pattern.test(heading));
  return rule ? { mode: rule[1], label: rule[2] } : current;
}

type Stated = { cost?: number; tier?: number; attack?: number; health?: number; text: string };

/** Splits "[Стоимость 9] [5-й уровень] 9 атаки, 9 здоровья. Текст" into stats and the rule text. */
export function splitStatedCard(value: string): Stated {
  let rest = cleanArticleText(value);
  const stated: Stated = { text: '' };
  for (let bracket = rest.match(/^\[([^\]]{1,40})\]\s*/); bracket; bracket = rest.match(/^\[([^\]]{1,40})\]\s*/)) {
    const cost = bracket[1].match(/^Стоимость\s+(\d{1,2})$/i);
    const tier = bracket[1].match(/^(\d)-й\s+уровень$/i);
    if (cost) stated.cost = Number(cost[1]);
    else if (tier) stated.tier = Number(tier[1]);
    else break;
    rest = rest.slice(bracket[0].length);
  }
  const stats = rest.match(/^(\d{1,3})\s+атаки\s*,\s*(\d{1,3})\s+здоровья\s*(?:[.,]\s*|$)/i);
  if (stats) {
    stated.attack = Number(stats[1]);
    stated.health = Number(stats[2]);
    rest = rest.slice(stats[0].length);
  }
  stated.text = rest.trim();
  return stated;
}

export function numberChange(label: string, before: number | undefined, after: number | undefined, better?: 'higher' | 'lower'): PatchNotesChange[] {
  if (before === undefined && after === undefined) return [];
  if (before !== undefined && after !== undefined && before === after) return [];
  return [{ label, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}), ...(better ? { better } : {}) }];
}

/** Value changes between two statements of one card; unchanged values are left out. */
export function statedChanges(beforeText: string | null, afterText: string): PatchNotesChange[] {
  const before = beforeText === null ? null : splitStatedCard(beforeText);
  const after = splitStatedCard(afterText);
  const changes: PatchNotesChange[] = [
    ...numberChange('Стоимость', before?.cost, after.cost, 'lower'),
    // A tavern tier moves both power and availability, so it carries no direction.
    ...(before?.tier !== after.tier && (before?.tier !== undefined || after.tier !== undefined)
      ? [{ label: 'Уровень таверны', ...(before?.tier !== undefined ? { before: `${before.tier}` } : {}),
        ...(after.tier !== undefined ? { after: `${after.tier}` } : {}) }]
      : []),
    ...numberChange('Атака', before?.attack, after.attack, 'higher'),
    ...numberChange('Здоровье', before?.health, after.health, 'higher'),
  ];
  if (before === null) {
    if (after.text) changes.push({ label: 'Текст', after: after.text });
  } else if (before.text !== after.text) {
    changes.push({ label: 'Текст', ...(before.text ? { before: before.text } : {}), ...(after.text ? { after: after.text } : {}) });
  }
  return changes;
}

export const sameName = (left: string, right: string) => {
  const key = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
  return key(left) === key(right);
};

export function entryId(mode: PatchNotesMode, subtitle: string | null, name: string, used: Set<string>): string {
  const base = `${mode}-${subtitle ?? ''}-${name}`.toLocaleLowerCase('ru-RU')
    .replace(/[^a-zа-яё0-9]+/giu, '-').replace(/^-+|-+$/g, '').slice(0, 90) || mode;
  let id = base;
  for (let index = 2; used.has(id); index += 1) id = `${base}-${index}`;
  used.add(id);
  return id;
}
