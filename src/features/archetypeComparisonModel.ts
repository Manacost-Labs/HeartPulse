/** Pure models of the archetype page's two comparisons: two builds of the archetype, and the archetype against another one. */

import { archetypeRadarProfile, deckManaCurve, wilsonInterval } from './archetypeInsightsModel';

export type ComparedDeckCard = { dbfId: number; id: string; name: string; cost: number | null; rarity?: string | null; count: number };

type CardChange = { card: ComparedDeckCard; left: number; right: number };

const byCostThenName = (left: ComparedDeckCard, right: ComparedDeckCard) =>
  (left.cost ?? 99) - (right.cost ?? 99) || left.name.localeCompare(right.name, 'ru');

/**
 * Cards of two lists by dbfId: only in the left one, only in the right one, and in both with a
 * different number of copies. Sideboard cards are not part of the main list and are left out.
 */
export function deckDifference(left: readonly ComparedDeckCard[], right: readonly ComparedDeckCard[]) {
  const rightById = new Map(right.map(card => [card.dbfId, card]));
  const leftById = new Map(left.map(card => [card.dbfId, card]));
  const changed: CardChange[] = [];
  let shared = 0;
  for (const card of left) {
    const other = rightById.get(card.dbfId);
    if (!other) continue;
    shared += Math.min(card.count, other.count);
    if (other.count !== card.count) changed.push({ card, left: card.count, right: other.count });
  }
  return {
    onlyLeft: left.filter(card => !rightById.has(card.dbfId)).sort(byCostThenName),
    onlyRight: right.filter(card => !leftById.has(card.dbfId)).sort(byCostThenName),
    changed: changed.sort((a, b) => byCostThenName(a.card, b.card)),
    /** Copies the two lists have in common. */
    shared,
  };
}

/** Mean mana cost per card copy; cards with an unknown cost are left out. */
export function averageCost(cards: readonly ComparedDeckCard[]): number | null {
  let total = 0;
  let count = 0;
  for (const card of cards) {
    if (card.cost === null || !Number.isFinite(card.cost)) continue;
    total += card.cost * card.count;
    count += card.count;
  }
  return count > 0 ? total / count : null;
}

export { deckManaCurve };

type Sample = { winrate: number | null; games: number | null };
type Side = 'left' | 'right';

/**
 * Two winrates with their 95% Wilson intervals. A gap counts only when the intervals do not
 * overlap: with a few hundred games two points apart are still the same deck's noise.
 */
export function winrateVerdict(left: Sample, right: Sample) {
  if (left.winrate === null || right.winrate === null || !left.games || !right.games) return null;
  const leftInterval = wilsonInterval(left.winrate, left.games);
  const rightInterval = wilsonInterval(right.winrate, right.games);
  const distinct = leftInterval[0] > rightInterval[1] || rightInterval[0] > leftInterval[1];
  const gap = left.winrate - right.winrate;
  return {
    left: leftInterval,
    right: rightInterval,
    /** Percentage points, left minus right. */
    gap,
    distinct,
    leader: distinct ? (gap > 0 ? 'left' : 'right') as Side : null,
  };
}

/** The side with clearly more games (a quarter more at least): its numbers are the more reliable ones. */
export function sampleVerdict(left: number | null, right: number | null) {
  if (!left || !right) return null;
  const ratio = Math.max(left, right) / Math.min(left, right);
  return { ratio, leader: ratio < 1.25 ? null : (left > right ? 'left' : 'right') as Side };
}

type ProfileItem = Parameters<typeof archetypeRadarProfile>[0] & { archetypeLabel: string };
type ProfileKey = 'winrate' | 'popularity' | 'durationMinutes' | 'turns' | 'climbingSpeed';

/**
 * `better` names the direction that helps a player; metrics without one only describe the
 * archetype. `more`/`less` are predicates of the archetype for the summary sentence.
 */
export const PROFILE_METRICS: ReadonlyArray<{
  key: ProfileKey; label: string; radarLabel?: string; unit: string; digits: number; better: 'higher' | 'lower' | null;
  more: string; less: string; threshold: (mine: number, theirs: number) => boolean;
}> = [
  { key: 'winrate', label: 'Винрейт', unit: '%', digits: 1, better: 'higher', more: 'выигрывает чаще', less: 'выигрывает реже',
    threshold: (mine, theirs) => Math.abs(mine - theirs) >= 1 },
  { key: 'climbingSpeed', label: 'Подъём по ладдеру', radarLabel: 'Подъём', unit: ' ★/ч', digits: 2, better: 'higher', more: 'быстрее поднимается по ладдеру',
    less: 'медленнее поднимается по ладдеру', threshold: (mine, theirs) => Math.abs(mine - theirs) >= 0.1 * Math.max(Math.abs(mine), Math.abs(theirs), 0.1) },
  { key: 'durationMinutes', label: 'Длина матча', unit: ' мин', digits: 1, better: 'lower', more: 'играет более долгие матчи',
    less: 'играет более короткие матчи', threshold: (mine, theirs) => Math.abs(mine - theirs) >= 0.3 },
  { key: 'turns', label: 'Средний ход', unit: '', digits: 1, better: null, more: 'доходит до более поздних ходов',
    less: 'решает партию раньше', threshold: (mine, theirs) => Math.abs(mine - theirs) >= 0.5 },
  { key: 'popularity', label: 'Популярность', unit: '%', digits: 1, better: null, more: 'встречается чаще', less: 'встречается реже',
    threshold: (mine, theirs) => Math.max(mine, theirs) >= 1.25 * Math.min(mine, theirs) },
];

export function formatProfileValue(key: ProfileKey, value: number | null) {
  const metric = PROFILE_METRICS.find(entry => entry.key === key);
  if (!metric || value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: metric.digits })}${metric.unit}`;
}

/**
 * One row per metric: both values, both percentiles among the format's archetypes (the radar's
 * axes) and which side is ahead. `leader` is null while the gap is under the metric's threshold.
 */
export function profileComparison(mine: ProfileItem, theirs: ProfileItem, items: readonly ProfileItem[]) {
  const minePercentiles = archetypeRadarProfile(mine, items);
  const theirPercentiles = archetypeRadarProfile(theirs, items);
  return PROFILE_METRICS.map(metric => {
    const mineValue = mine[metric.key];
    const theirValue = theirs[metric.key];
    const comparable = mineValue !== null && theirValue !== null && Number.isFinite(mineValue) && Number.isFinite(theirValue);
    const leader = comparable && mineValue !== theirValue && metric.threshold(mineValue, theirValue)
      ? (mineValue > theirValue ? 'mine' : 'theirs') as 'mine' | 'theirs' : null;
    return {
      ...metric,
      mine: mineValue,
      theirs: theirValue,
      minePercentile: minePercentiles.find(axis => axis.key === metric.key)?.score ?? null,
      theirPercentile: theirPercentiles.find(axis => axis.key === metric.key)?.score ?? null,
      /** The side with the larger value. */
      leader,
      /** True when the larger value is the better one for a player; null for descriptive metrics or a tie. */
      leaderIsBetter: leader && metric.better ? metric.better === 'higher' : null,
    };
  });
}

/**
 * «Биг Шаман выигрывает чаще и быстрее поднимается по ладдеру, но играет более долгие матчи.»
 * Strengths come first, weaknesses after «но», descriptive differences in a second sentence.
 */
export function profileSummary(mineLabel: string, theirLabel: string, rows: ReturnType<typeof profileComparison>) {
  const predicate = (row: (typeof rows)[number]) => row.leader === 'mine' ? row.more : row.less;
  const good = rows.filter(row => row.leader && row.better && row.leaderIsBetter === (row.leader === 'mine')).map(predicate);
  const bad = rows.filter(row => row.leader && row.better && row.leaderIsBetter !== (row.leader === 'mine')).map(predicate);
  const neutral = rows.filter(row => row.leader && !row.better).map(predicate);
  if (!good.length && !bad.length && !neutral.length) return `${mineLabel} и ${theirLabel} почти не различаются по статистике формата.`;
  const and = (parts: string[]) => parts.length > 1 ? `${parts.slice(0, -1).join(', ')} и ${parts.at(-1)}` : parts[0];
  const first = good.length && bad.length ? `${and(good)}, но ${and(bad)}` : and(good.length ? good : bad);
  const lead = first ? `${mineLabel} ${first}, чем ${theirLabel}.` : '';
  const tail = !neutral.length ? '' : first ? `Также ${and(neutral)}.` : `${mineLabel} ${and(neutral)}, чем ${theirLabel}.`;
  return [lead, tail].filter(Boolean).join(' ');
}

type MatchupRows = { rows: { archetype: string; cells: { opponent: string; winrate: number | null }[] }[] };

/**
 * The archetype's winrate against the other one in the HSGuru matchup table, and the reverse
 * pair. `missing` tells why there is no number: the archetype or the opponent is not in the
 * table at all, or HSGuru left the pair empty for a small sample.
 */
export function matchupBetween(data: MatchupRows | null, mine: string, theirs: string) {
  if (!data) return null;
  const key = (name: string) => name.trim().toLocaleLowerCase('en');
  const cell = (row: string, opponent: string) => data.rows.find(entry => key(entry.archetype) === key(row))
    ?.cells.find(entry => key(entry.opponent) === key(opponent));
  const forward = cell(mine, theirs);
  const reverse = cell(theirs, mine);
  const listed = (name: string) => data.rows.some(entry => key(entry.archetype) === key(name)
    || entry.cells.some(other => key(other.opponent) === key(name)));
  const missing = forward?.winrate != null ? null
    : !data.rows.some(entry => key(entry.archetype) === key(mine)) ? 'archetype' as const
    : !listed(theirs) ? 'opponent' as const : 'pair' as const;
  return { winrate: forward?.winrate ?? null, reverse: reverse?.winrate ?? null, missing };
}
