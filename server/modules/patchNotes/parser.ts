import type { PatchNotesChange, PatchNotesEntry, PatchNotesMode } from './contract.js';

type ArticleSection = { level?: unknown; title?: unknown };

/** Card lookup by its exact Russian name; `null` when the name is unknown or ambiguous. */
export type PatchCardResolver = (name: string) => { id: string; cardClass: string | null } | null;

const BEFORE = /^До\s+изменения\s*:\s*(.*)$/i;
const AFTER = /^После\s*:\s*(.*)$/i;
const COMMENT = /^Комментарий\s+разработчиков\s*:\s*(.*)$/i;
const COST_LINE = /^(.{2,80}?)\s*:\s*(\d{1,2})\s*→\s*(\d{1,2})$/;
const ARMOR_TABLE = /^Герой\s+Обычная\s+игра\s+Дуэты\s+(.+)$/i;
const ARMOR_ROW = /([^\d→]+?)\s+(\d{1,2})\s*→\s*(\d{1,2})\s+(\d{1,2})\s*→\s*(\d{1,2})/g;

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

function modeOf(heading: string, current: PatchNotesMode): PatchNotesMode {
  const text = heading.toLocaleLowerCase('ru-RU');
  if (text.includes('полей сражений')) return 'battlegrounds';
  if (text.includes('арены')) return 'arena';
  if (text.includes('hearthstone') || text.includes('стандарт') || text.includes('вольн')) return 'constructed';
  return current;
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

function numberChange(label: string, before: number | undefined, after: number | undefined, better?: 'higher' | 'lower'): PatchNotesChange[] {
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

function entryId(mode: PatchNotesMode, subtitle: string | null, name: string, used: Set<string>): string {
  const base = `${mode}-${subtitle ?? ''}-${name}`.toLocaleLowerCase('ru-RU')
    .replace(/[^a-zа-яё0-9]+/giu, '-').replace(/^-+|-+$/g, '').slice(0, 90) || mode;
  let id = base;
  for (let index = 2; used.has(id); index += 1) id = `${base}-${index}`;
  used.add(id);
  return id;
}

/**
 * Reads card changes from the article text. A change is either a card name
 * followed by "До изменения"/"После" lines, a "Name: a → b" cost line of a
 * Battlegrounds trinket list, or a row of the hero armor table. Lines that
 * fit none of these (introductions, card lists in images) are skipped.
 */
export function parsePatchArticle(contentText: string, sections: ArticleSection[], resolve: PatchCardResolver): {
  entries: PatchNotesEntry[]; missingBefore: number;
} {
  const modeHeadings = new Set(sections
    .filter(section => section?.level === 'h2' || section?.level === 'h3')
    .map(section => cleanArticleText(String(section?.title ?? ''))).filter(Boolean));
  const entries: PatchNotesEntry[] = [];
  const used = new Set<string>();
  let mode: PatchNotesMode = 'constructed';
  let costGroup: string | null = null;
  let name: string | null = null;
  let note: string[] = [];
  let pendingBefore: string | null = null;
  let pendingName: string | null = null;
  let pendingNote: string | null = null;
  let missingBefore = 0;

  const push = (entryName: string, subtitle: string | null, changes: PatchNotesChange[], entryNote: string | null) => {
    if (!changes.length) return;
    const card = mode === 'battlegrounds' ? null : resolve(entryName);
    entries.push({
      id: entryId(mode, subtitle, entryName, used), name: entryName, mode,
      cardId: card?.id ?? null, cardClass: card?.cardClass ?? null, subtitle, changes, note: entryNote,
    });
  };

  for (const raw of contentText.split('\n')) {
    const line = cleanArticleText(raw);
    if (!line) continue;
    const before = line.match(BEFORE);
    const after = line.match(AFTER);
    const comment = line.match(COMMENT);
    if (before) {
      pendingBefore = before[1];
      pendingName = name;
      pendingNote = note.join(' ') || null;
      continue;
    }
    if (after) {
      const entryName = pendingBefore !== null ? pendingName : name;
      if (entryName) {
        if (pendingBefore === null) missingBefore += 1;
        push(entryName, null, statedChanges(pendingBefore, after[1]), pendingBefore !== null ? pendingNote : note.join(' ') || null);
      }
      pendingBefore = null;
      pendingName = null;
      name = null;
      note = [];
      continue;
    }
    if (comment) {
      if (name) note.push(comment[1]);
      continue;
    }
    if (mode === 'battlegrounds') {
      const armor = line.match(ARMOR_TABLE);
      if (armor) {
        for (const row of armor[1].matchAll(ARMOR_ROW)) {
          push(cleanArticleText(row[1]), 'Броня героя', [
            ...numberChange('Броня, соло', Number(row[2]), Number(row[3]), 'higher'),
            ...numberChange('Броня, дуэты', Number(row[4]), Number(row[5]), 'higher'),
          ], null);
        }
        continue;
      }
      const cost = line.match(COST_LINE);
      if (cost && costGroup) {
        push(cost[1], costGroup, numberChange('Стоимость', Number(cost[2]), Number(cost[3]), 'lower'), null);
        continue;
      }
    }
    if (modeHeadings.has(line)) mode = modeOf(line, mode);
    const upper = line.toLocaleUpperCase('ru-RU');
    if (upper.includes('СТОИМОСТ') && upper.includes('АКСЕССУАР')) {
      costGroup = upper.includes('БОЛЬШ') ? 'Большой аксессуар' : upper.includes('МАЛ') ? 'Малый аксессуар' : 'Аксессуар';
    } else if (line === upper && /[А-ЯЁ]{4}/.test(line)) {
      costGroup = null;
    }
    name = line;
    note = [];
  }
  return { entries, missingBefore };
}
