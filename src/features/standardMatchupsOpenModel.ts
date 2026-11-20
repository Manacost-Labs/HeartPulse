import type { PublicStandardMatchupsArchetype, PublicStandardMatchupsPair } from '../modules/standardMatchups/public';

/** Russian class names: the class icon already says them, so a column head may drop them from the archetype's name. */
const CLASS_NAMES: Record<string, string> = {
  deathknight: 'Рыцарь смерти', demonhunter: 'Охотник на демонов', druid: 'Друид', hunter: 'Охотник', mage: 'Маг',
  paladin: 'Паладин', priest: 'Жрец', rogue: 'Разбойник', shaman: 'Шаман', warlock: 'Чернокнижник', warrior: 'Воин',
};

/** «К'тун Охотник на демонов» → «К'тун»: the icon carries the class. The full name stays in the tooltip and the row. */
export function shortArchetypeLabel(label: string, classKey: string | null): string {
  const name = classKey ? CLASS_NAMES[classKey] : undefined;
  if (!name) return label;
  const short = label.replace(name, ' ').replace(/\s+/g, ' ').trim();
  return short.length >= 2 ? short : label;
}

export type MatchupBand = 'ss' | 's' | 'e' | 'w' | 'ww';

/** Heat of a pair: five steps, two of them strong; the table is printed hundreds of times over, so one or two letters. */
export function matchupBand(pair: PublicStandardMatchupsPair | null): MatchupBand | undefined {
  if (!pair || pair.winrate === null) return undefined;
  const rate = pair.winrate;
  if (rate >= 56) return 'ss';
  if (rate >= 52) return 's';
  if (rate > 48) return 'e';
  return rate > 44 ? 'w' : 'ww';
}

export type MatchupSortKey = 'popularity' | 'winrate' | 'name';
export const MATCHUP_SORTS: ReadonlyArray<readonly [MatchupSortKey, string]> = [
  ['popularity', 'Популярность'], ['winrate', 'Винрейт'], ['name', 'Название'],
];

/**
 * Indexes of the archetypes in the order a reader asked for: most played, highest winrate, or by name (А→Я);
 * `reverse` flips it. The server's order (most played first) is the popularity order. Archetypes without a
 * winrate sort after the rest either way.
 */
export function matchupOrder(
  archetypes: readonly PublicStandardMatchupsArchetype[], key: MatchupSortKey, reverse: boolean,
): number[] {
  const flip = reverse ? -1 : 1;
  return archetypes.map((_, index) => index).sort((a, b) => {
    const left = archetypes[a], right = archetypes[b];
    if (key === 'name') return flip * left.label.localeCompare(right.label, 'ru') || a - b;
    if (key === 'winrate') {
      if (left.winrate === null || right.winrate === null) return left.winrate === right.winrate ? a - b : left.winrate === null ? 1 : -1;
      return flip * (right.winrate - left.winrate) || a - b;
    }
    return flip * (a - b);
  });
}

/** An archetype matches when every word of the query is in its name, in any order, the case ignored. */
export function matchesArchetype(archetype: PublicStandardMatchupsArchetype, query: string): boolean {
  const words = query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = `${archetype.label} ${archetype.name}`.toLowerCase().replace(/ё/g, 'е');
  return words.every(word => haystack.includes(word));
}
