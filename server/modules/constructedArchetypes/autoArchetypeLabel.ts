import { ARCHETYPE_TERMS } from './archetypeTerms.js';

// Class words at the end of an HSGuru name; all Russian class names are masculine.
const CLASS_WORDS: ReadonlyArray<[string, string]> = [
  ['demon hunter', 'Охотник на демонов'], ['death knight', 'Рыцарь смерти'], ['deathknight', 'Рыцарь смерти'],
  ['demonhunter', 'Охотник на демонов'], ['dh', 'Охотник на демонов'], ['dk', 'Рыцарь смерти'],
  ['priest', 'Жрец'], ['warlock', 'Чернокнижник'], ['shaman', 'Шаман'], ['rogue', 'Разбойник'],
  ['warrior', 'Воин'], ['druid', 'Друид'], ['hunter', 'Охотник'], ['mage', 'Маг'], ['paladin', 'Паладин'],
];
// One-word names with the class fused in: Zoolock, Egglock, J-Lock, End of Turnadin.
const FUSED_CLASS: ReadonlyArray<[RegExp, string]> = [[/^(.+?)-?lock$/, 'Чернокнижник'], [/^(.+?)adin$/, 'Паладин']];
// Fused names the community already writes as one Russian word.
const FUSED_NAMES: Readonly<Record<string, string>> = { zoolock: 'Зоолок' };
const MAX_PHRASE = 3;

export type AutoArchetypeLabel = {
  label: string;
  /** English words no term covers; a label with any is incomplete and the admin should name it. */
  unknown: string[];
};

function words(name: string): string[] {
  return name.trim().replace(/[’`]/g, "'").replace(/\s+/g, ' ').toLocaleLowerCase('en-US').split(' ').filter(Boolean);
}

function splitClass(tokens: string[]): { rest: string[]; className: string | null; fusedStem: boolean } {
  for (const [english, russian] of CLASS_WORDS) {
    const size = english.split(' ').length;
    if (tokens.length >= size && tokens.slice(-size).join(' ') === english) {
      return { rest: tokens.slice(0, -size), className: russian, fusedStem: false };
    }
  }
  const last = tokens.at(-1) ?? '';
  if (FUSED_NAMES[last]) return { rest: tokens.slice(0, -1), className: FUSED_NAMES[last], fusedStem: false };
  for (const [pattern, russian] of FUSED_CLASS) {
    const match = last.match(pattern);
    if (match) return { rest: [...tokens.slice(0, -1), match[1].replace(/-$/, '')], className: russian, fusedStem: true };
  }
  return { rest: tokens, className: null, fusedStem: false };
}

/**
 * Genitives right after the class («Охотник на демонов Бездны»), then «на …»
 * phrases joined («на драконах и пиратах»), then «с …» phrases.
 */
function joinSuffixes(suffixes: string[]): string {
  const on = suffixes.filter(value => value.startsWith('на ')).map(value => value.slice(3));
  const genitive = suffixes.filter(value => !/^(на|с|со|без) /.test(value));
  const withPhrases = suffixes.filter(value => /^(с|со|без) /.test(value));
  const joined = on.length ? `на ${on.length > 1 ? `${on.slice(0, -1).join(', ')} и ${on.at(-1)}` : on[0]}` : '';
  return [...genitive, joined, ...withPhrases].filter(Boolean).join(' ');
}

/**
 * «<Ключевая карта или механика> <Класс>» for an HSGuru archetype name no
 * translation covers: card and mechanic words from `ARCHETYPE_TERMS` stand
 * before the class, tribe and keyword phrases after it, expansion tags in
 * brackets. Words without a term stay in English and are reported, so the
 * admin sees which labels are incomplete.
 */
export function autoArchetypeLabel(name: string): AutoArchetypeLabel | null {
  const tokens = words(name);
  if (!tokens.length) return null;
  const { rest, className, fusedStem } = splitClass(tokens);
  if (!className) return null;
  const originals = name.trim().split(/\s+/);
  const prefix: string[] = [];
  const suffix: string[] = [];
  const qualifier: string[] = [];
  const unknown: string[] = [];
  for (let index = 0; index < rest.length;) {
    let size = Math.min(MAX_PHRASE, rest.length - index);
    for (; size > 0; size -= 1) {
      const term = ARCHETYPE_TERMS[rest.slice(index, index + size).join(' ')];
      if (!term) continue;
      const bucket = 'p' in term ? prefix : 's' in term ? suffix : qualifier;
      const value = 'p' in term ? term.p : 's' in term ? term.s : term.q;
      // HSGuru repeats a plan under two names ("Mug Zee"): one Russian word is enough.
      if (!bucket.includes(value)) bucket.push(value);
      break;
    }
    if (size === 0) {
      // The stem of a fused name ("Shreds" of Shredslock) has no original word of its own.
      const original = fusedStem && index === rest.length - 1
        ? (originals[index] ?? rest[index]).slice(0, rest[index].length)
        : originals[index] ?? rest[index];
      unknown.push(original);
      prefix.push(original);
      size = 1;
    }
    index += size;
  }
  // «Охотник на демонов на демонах» reads as a stutter: the tribe becomes an adjective.
  const demons = className === 'Охотник на демонов' ? suffix.indexOf('на демонах') : -1;
  if (demons >= 0) { suffix.splice(demons, 1); prefix.unshift('Демонический'); }
  const head = [...prefix, className, joinSuffixes(suffix)].filter(Boolean).join(' ');
  return { label: qualifier.length ? `${head} (${qualifier.join(', ')})` : head, unknown };
}

/** The admin queue's view of a name without a translation: what the site shows meanwhile (source «auto»). */
export function autoLabelFields(name: string): { autoLabel?: string; autoComplete?: boolean } {
  const auto = autoArchetypeLabel(name);
  return auto ? { autoLabel: auto.label, autoComplete: !auto.unknown.length } : {};
}
