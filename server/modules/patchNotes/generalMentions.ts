import type { BattlegroundCatalogCard } from './battlegroundCatalog.js';
import { nameKey } from './cardNames.js';
import type { PatchNotesDetail, PatchNotesMention } from './contract.js';

/**
 * Cards named in the general changes of a mode ("Анимации нескольких Живых
 * азеритов в игре…"). The article marks no tooltips there, so the sentence is
 * searched for card names, with the endings of Russian cases tolerated: a name
 * matches word by word when the words share their beginning ("Живых азеритов"
 * is "Живой азерит"). Nothing found stays plain text.
 */

export type NamedCard = { id: string; name: string; renderUrl: string | null };

const WORD = /[\p{L}\p{N}'’-]+/gu;
/** A single word is a card name only when it is long enough not to be a common word, and written like a name. */
const MIN_SINGLE_WORD = 6;
/** Words this short must agree exactly; longer ones may differ in their endings. */
const MIN_STEM_WORD = 4;
/** At most this many letters of either word may be an ending, and the shared beginning is most of the shorter word. */
const MAX_ENDING = 3;

type Token = { start: number; end: number; key: string; capital: boolean; quoted: boolean };

function tokens(line: string): Token[] {
  return [...line.matchAll(WORD)].map(match => {
    const start = match.index ?? 0;
    const word = match[0];
    return { start, end: start + word.length, key: nameKey(word), capital: /^\p{Lu}/u.test(word), quoted: line[start - 1] === '«' };
  });
}

/** Two spellings of one word in different cases: the same beginning, differing only in the last letters. */
export function sameWordStem(left: string, right: string): boolean {
  if (left === right) return true;
  const shortest = Math.min(left.length, right.length);
  if (shortest < MIN_STEM_WORD) return false;
  let common = 0;
  while (common < shortest && left[common] === right[common]) common += 1;
  return common >= Math.max(3, Math.ceil(shortest * 0.6)) && left.length - common <= MAX_ENDING && right.length - common <= MAX_ENDING;
}

type Candidate = { card: NamedCard; words: string[] };

/** A finder over card names, longest names first so "Живой азерит" wins over a card named "Азерит". */
export function createMentionFinder(cards: Iterable<NamedCard>): (line: string, lineIndex: number) => PatchNotesMention[] {
  const byStart = new Map<string, Candidate[]>();
  const seen = new Set<string>();
  for (const card of cards) {
    const words = tokens(card.name).map(token => token.key);
    const key = words.join(' ');
    if (!words.length || seen.has(key) || (words.length === 1 && words[0].length < MIN_SINGLE_WORD)) continue;
    seen.add(key);
    const list = byStart.get(words[0].slice(0, 3)) ?? [];
    list.push({ card, words });
    byStart.set(words[0].slice(0, 3), list);
  }
  for (const list of byStart.values()) list.sort((left, right) => right.words.length - left.words.length);

  return (line, lineIndex) => {
    const found: PatchNotesMention[] = [];
    const words = tokens(line);
    for (let index = 0; index < words.length;) {
      const candidate = (byStart.get(words[index].key.slice(0, 3)) ?? []).find(item => item.words.every(
        (word, offset) => words[index + offset] && sameWordStem(words[index + offset].key, word),
      ) && (item.words.length > 1 || words[index].capital || words[index].quoted));
      if (!candidate) {
        index += 1;
        continue;
      }
      const last = words[index + candidate.words.length - 1];
      found.push({ line: lineIndex, start: words[index].start, end: last.end, cardId: candidate.card.id, name: candidate.card.name, renderUrl: candidate.card.renderUrl });
      index += candidate.words.length;
    }
    return found;
  };
}

/** Collectible cards by name; of several prints one name keeps the original (not `CORE_`) id. */
export function collectibleNamed(cards: Record<string, { name?: unknown }>): NamedCard[] {
  const byName = new Map<string, NamedCard>();
  for (const [id, card] of Object.entries(cards)) {
    const name = typeof card?.name === 'string' ? card.name.trim() : '';
    const key = nameKey(name);
    if (key && (!byName.has(key) || (byName.get(key)?.id.startsWith('CORE_') && !id.startsWith('CORE_')))) byName.set(key, { id, name, renderUrl: null });
  }
  return [...byName.values()];
}

export function battlegroundNamed(cards: BattlegroundCatalogCard[]): NamedCard[] {
  return cards.filter(card => !card.timewarped).map(card => ({ id: card.id, name: card.ru, renderUrl: card.renderUrl }));
}

/** Adds the cards named in each general-changes line; the Battlegrounds modes look in their own catalog. */
export function withMentions(
  patches: PatchNotesDetail[], finders: { battlegrounds: ReturnType<typeof createMentionFinder>; collectible: ReturnType<typeof createMentionFinder> },
): PatchNotesDetail[] {
  return patches.map(patch => (patch.generalChanges.length
    ? {
      ...patch,
      generalChanges: patch.generalChanges.map(group => {
        const find = group.mode === 'battlegrounds' ? finders.battlegrounds : finders.collectible;
        const marks = group.lines.flatMap((line, index) => find(line, index));
        return marks.length ? { ...group, marks } : group;
      }),
    }
    : patch));
}
