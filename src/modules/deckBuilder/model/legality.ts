import { BUILDER_CLASSES, type BuilderCard, type BuilderClass, type BuilderEntry } from './selection';

export type RuneCost = { blood: number; frost: number; unholy: number };
export type GameRules = { runes: Record<string, RuneCost>; tourists: Record<string, BuilderClass> };
const runeKeys = ['blood', 'frost', 'unholy'] as const;
const classes = new Set<string>(BUILDER_CLASSES.map(card => card.id));

/** Reads only game-defined rune costs and explicit Paradise Tourist keywords. */
export function gameRulesFromCards(value: unknown): GameRules {
  if (!Array.isArray(value) || !value.length) throw new Error('Некорректные требования к картам');
  const rules: GameRules = { runes: Object.create(null), tourists: Object.create(null) };
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[A-Za-z0-9_]{2,80}$/.test(raw.id)) continue;
    if (raw.runeCost && typeof raw.runeCost === 'object') {
      const runes = Object.fromEntries(runeKeys.map(key => [key, raw.runeCost[key] ?? 0])) as RuneCost;
      if (Object.values(runes).some(count => !Number.isInteger(count) || count < 0 || count > 3)
        || Object.values(runes).reduce((sum, count) => sum + count, 0) > 3) {
        throw new Error('Некорректные требования к рунам');
      }
      rules.runes[raw.id] = runes;
    }
    if (raw.set === 'ISLAND_VACATION' && typeof raw.text === 'string') {
      const destination = raw.text.match(/<b>([A-Za-z ]+) Tourist[.\s]*<\/b>/i)?.[1].replace(/\s/g, '').toUpperCase();
      if (destination && classes.has(destination)) rules.tourists[raw.id] = destination as BuilderClass;
    }
  }
  if (!Object.keys(rules.runes).length || !Object.keys(rules.tourists).length) throw new Error('Неполные требования к картам');
  return rules;
}

export function touristDestination(deck: BuilderEntry[], heroClass: BuilderClass, rules: GameRules): BuilderClass | null {
  const tourist = deck.find(card => rules.tourists[card.id] && card.classes.includes(heroClass));
  return tourist ? rules.tourists[tourist.id] : null;
}

export function isLegalDeckCard(card: BuilderCard, heroClass: BuilderClass, deck: BuilderEntry[], rules: GameRules, runes: RuneCost): boolean {
  const destination = touristDestination(deck, heroClass, rules);
  const ownClass = card.classes.includes(heroClass) || card.classes.includes('NEUTRAL');
  if (!ownClass && !(destination && card.classes.includes(destination) && card.set === 'ISLAND_VACATION' && !rules.tourists[card.id])) return false;
  if (rules.tourists[card.id] && deck.some(entry => entry.id !== card.id && rules.tourists[entry.id])) return false;
  const required = rules.runes[card.id];
  return !required || runeKeys.every(key => required[key] <= runes[key]);
}

export function rebalanceRunes(current: RuneCost, key: keyof RuneCost, count: number): RuneCost {
  const next = { ...current, [key]: Math.max(0, Math.min(3, count)) };
  let remaining = 3 - next[key];
  for (const other of runeKeys.filter(value => value !== key)) {
    next[other] = Math.min(next[other], remaining);
    remaining -= next[other];
  }
  return next;
}

export function legalityIssues(deck: BuilderEntry[], heroClass: BuilderClass, rules: GameRules, runes: RuneCost): string[] {
  const all = [...deck, ...deck.filter(card => card.id === 'ETC_080').flatMap(card => card.sideboard ?? [])];
  const issues = all.filter(card => !isLegalDeckCard(card, heroClass, deck, rules, runes))
    .map(card => `${card.name}: не подходит выбранному классу, туристу или рунам`);
  if ((heroClass === 'DEATHKNIGHT' || touristDestination(deck, heroClass, rules) === 'DEATHKNIGHT')
    && Object.values(runes).reduce((sum, count) => sum + count, 0) !== 3) issues.push('Выберите 3 руны Рыцаря смерти');
  return issues;
}
