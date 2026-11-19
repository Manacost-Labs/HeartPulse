import type { PatchNotesChange } from './contract.js';

/**
 * What changed in a card, read from two versions of the card history instead
 * of the article's prose. A history version carries a `snapshot`: Constructed
 * cards state mana, attack, health, durability, armor and the rule text,
 * Battlegrounds cards their tavern tier, attack and health (no rule text).
 */

export type CardFacts = {
  cost?: number; tier?: number; attack?: number; health?: number; durability?: number; armor?: number;
  /** Rule text without markup; `undefined` when the snapshot states none. */
  text?: string;
};

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Rule text compares without markup (`<b>`, `[x]`), line breaks and spacing. */
export const plainRuleText = (value: unknown) => (typeof value === 'string'
  ? value.replace(/<[^>]*>/g, '').replace(/\[x\]/gi, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU')
  : undefined);

/** The comparable facts of a history snapshot; `null` for anything that is not one. */
export function cardFacts(snapshot: unknown, battlegrounds: boolean): CardFacts | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const row = snapshot as Record<string, unknown>;
  return battlegrounds
    ? { tier: number(row.tavern_tier), attack: number(row.attack), health: number(row.health) }
    : {
      cost: number(row.mana_cost), attack: number(row.attack), health: number(row.health), durability: number(row.durability),
      armor: number(row.armor), text: plainRuleText(row.text_ru),
    };
}

/** Value changes between two versions; `text` is `null` when a side states no rule text (Battlegrounds). */
export type VersionDiff = { changes: PatchNotesChange[]; text: boolean | null };

const NUMBERS: { key: Exclude<keyof CardFacts, 'text'>; label: string; better?: 'higher' | 'lower' }[] = [
  { key: 'cost', label: 'Стоимость', better: 'lower' },
  // A tavern tier moves both power and availability, so it carries no direction.
  { key: 'tier', label: 'Уровень таверны' },
  { key: 'attack', label: 'Атака', better: 'higher' },
  { key: 'health', label: 'Здоровье', better: 'higher' },
  { key: 'durability', label: 'Прочность', better: 'higher' },
  { key: 'armor', label: 'Броня', better: 'higher' },
];

export function diffFacts(before: CardFacts, after: CardFacts): VersionDiff {
  const changes: PatchNotesChange[] = [];
  for (const { key, label, better } of NUMBERS) {
    const [left, right] = [before[key], after[key]];
    if (left === undefined || right === undefined || left === right) continue;
    const show = (value: number) => (key === 'tier' ? String(value) : value);
    changes.push({ label, before: show(left), after: show(right), ...(better ? { better } : {}) });
  }
  return { changes, text: before.text === undefined || after.text === undefined ? null : before.text !== after.text };
}

/** Labels a snapshot speaks for; the article's other changes (a Battlegrounds trinket's gold, hero armor) stay. */
const COVERED = {
  constructed: new Set(['Стоимость', 'Атака', 'Здоровье', 'Прочность', 'Броня', 'Текст']),
  battlegrounds: new Set(['Уровень таверны', 'Атака', 'Здоровье']),
};

/**
 * The plates of a card with a pair of versions: the versions' own number
 * changes, "Текст" only where the text really changed (for Battlegrounds,
 * where the history has no text, the article's own text change is kept), and
 * whatever the article says that a snapshot cannot. A pair whose versions differ
 * in nothing a plate can show keeps the article's changes.
 */
export function reconcileChanges(article: PatchNotesChange[], diff: VersionDiff, battlegrounds: boolean): PatchNotesChange[] {
  const covered = COVERED[battlegrounds ? 'battlegrounds' : 'constructed'];
  const stated = article.find(change => change.label === 'Текст');
  const text = diff.text === true ? [stated ?? { label: 'Текст' }] : [];
  const kept = article.filter(change => !covered.has(change.label));
  const result = [...diff.changes, ...text, ...kept];
  return result.length ? result : article;
}
