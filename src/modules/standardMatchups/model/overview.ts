import { pairConfidence, type StandardMatchupConfidence } from './matrix';
import type { StandardMatchupsClassKey, StandardMatchupsData } from './types';

/** Favoured from 52%, unfavoured below 48%; between them a pair is even. */
export const MATCHUP_GROUP_FLOORS = { strong: 52, even: 48 } as const;
export type StandardMatchupGroup = 'strong' | 'even' | 'weak';

export interface StandardMatchupArchetype {
  id: string;
  label: string;
  classKey: StandardMatchupsClassKey | null;
  /** Share of the source's games in percent; undefined when the source has none. */
  share?: number;
  /** Win rate against the field as the source publishes it. */
  winrate: number | null;
  /** Slug of the archetype page, derived from the English name as the server does. */
  slug: string | null;
}

export interface StandardMatchupOpponent extends StandardMatchupArchetype {
  /** Win rate of the picked archetype against this opponent, percent. */
  vs: number;
  confidence: StandardMatchupConfidence;
  group: StandardMatchupGroup;
}

export interface StandardMatchupClassAverage {
  classKey: StandardMatchupsClassKey;
  /** Win rate against the class's archetypes, weighted by their share of games. */
  winrate: number;
  opponents: number;
}

export interface StandardMatchupOverview {
  archetype: StandardMatchupArchetype;
  /** Opponents with a published win rate, best first. */
  opponents: StandardMatchupOpponent[];
  /** Best and worst pair, leaving out low-confidence pairs while any other remains; no worst when it ties the best. */
  best: StandardMatchupOpponent | null;
  worst: StandardMatchupOpponent | null;
  /** Opponent classes, best first. */
  classes: StandardMatchupClassAverage[];
}

/** The server's `constructedArchetypeSlug` for the ASCII names HSGuru publishes. */
export function matchupArchetypeSlug(name: string): string | null {
  const slug = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return slug || null;
}

export function matchupGroup(winrate: number): StandardMatchupGroup {
  return winrate >= MATCHUP_GROUP_FLOORS.strong ? 'strong' : winrate >= MATCHUP_GROUP_FLOORS.even ? 'even' : 'weak';
}

function share(value: string | null | undefined): number | undefined {
  const number = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

/** The source's rows as archetypes, in the source's order. */
export function standardMatchupArchetypes(
  data: Pick<StandardMatchupsData, 'columns' | 'rows'>,
  labelOf: (name: string, label?: string) => string,
): StandardMatchupArchetype[] {
  const columns = new Map(data.columns.map(column => [column.name, column]));
  return data.rows.map(row => ({
    id: row.archetype,
    label: labelOf(row.archetype, row.archetypeLabel),
    classKey: row.classKey ?? columns.get(row.archetype)?.classKey ?? null,
    share: share(columns.get(row.archetype)?.popularity),
    winrate: row.winrate,
    slug: matchupArchetypeSlug(row.archetype),
  }));
}

function extremes(opponents: StandardMatchupOpponent[]) {
  const trusted = opponents.filter(opponent => opponent.confidence !== 'low');
  const pool = trusted.length ? trusted : opponents;
  const last = pool[pool.length - 1];
  return { best: pool[0] ?? null, worst: pool.length > 1 && last.vs < pool[0].vs ? last : null };
}

function classAverages(opponents: StandardMatchupOpponent[]): StandardMatchupClassAverage[] {
  const byClass = new Map<StandardMatchupsClassKey, StandardMatchupOpponent[]>();
  for (const opponent of opponents) {
    if (!opponent.classKey) continue;
    byClass.set(opponent.classKey, [...(byClass.get(opponent.classKey) ?? []), opponent]);
  }
  return [...byClass].map(([classKey, members]) => {
    const weight = members.reduce((sum, member) => sum + (member.share ?? 0), 0);
    const winrate = weight > 0
      ? members.reduce((sum, member) => sum + member.vs * (member.share ?? 0), 0) / weight
      : members.reduce((sum, member) => sum + member.vs, 0) / members.length;
    return { classKey, winrate: Math.round(winrate * 10) / 10, opponents: members.length };
  }).sort((a, b) => b.winrate - a.winrate);
}

/**
 * One archetype against the field: its published pairs sorted by win rate, the
 * best and worst of them and the average per opponent class. Mirrors and pairs
 * below the source's minimum sample are left out.
 */
export function standardMatchupOverview(
  data: Pick<StandardMatchupsData, 'columns' | 'rows'>,
  archetypeId: string,
  labelOf: (name: string, label?: string) => string,
): StandardMatchupOverview | null {
  const archetypes = standardMatchupArchetypes(data, labelOf);
  const archetype = archetypes.find(item => item.id === archetypeId);
  const row = data.rows.find(item => item.archetype === archetypeId);
  if (!archetype || !row) return null;
  const known = new Map(archetypes.map(item => [item.id, item]));
  const columns = new Map(data.columns.map(column => [column.name, column]));
  const opponents: StandardMatchupOpponent[] = [];
  for (const cell of row.cells) {
    if (cell.winrate === null || cell.opponent === archetypeId) continue;
    const column = columns.get(cell.opponent);
    const base = known.get(cell.opponent) ?? {
      id: cell.opponent,
      label: labelOf(cell.opponent, cell.opponentLabel),
      classKey: column?.classKey ?? null,
      share: share(column?.popularity),
      winrate: null,
      slug: matchupArchetypeSlug(cell.opponent),
    };
    opponents.push({
      ...base,
      vs: cell.winrate,
      confidence: pairConfidence(archetype.share, base.share),
      group: matchupGroup(cell.winrate),
    });
  }
  opponents.sort((a, b) => b.vs - a.vs);
  return { archetype, opponents, ...extremes(opponents), classes: classAverages(opponents) };
}
