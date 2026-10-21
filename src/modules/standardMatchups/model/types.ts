export type StandardMatchupsFormat = 'standard' | 'wild';

/** Hero class inferred from the archetype name; null when the name names none. */
export type StandardMatchupsClassKey = 'deathknight' | 'demonhunter' | 'druid' | 'hunter' | 'mage' | 'paladin'
  | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';

export interface StandardMatchupsColumn {
  name: string;
  label?: string;
  classKey?: StandardMatchupsClassKey | null;
  /** Share of the source's games, as published: "9.6%". */
  popularity: string | null;
}

export interface StandardMatchupsCell {
  opponent: string;
  opponentLabel?: string;
  /** Percent; null when the pair is below the source's minimum sample. */
  winrate: number | null;
}

export interface StandardMatchupsRow {
  archetype: string;
  archetypeLabel?: string;
  classKey?: StandardMatchupsClassKey | null;
  winrate: number | null;
  cells: StandardMatchupsCell[];
}

export interface StandardMatchupsData {
  format: StandardMatchupsFormat;
  formatLabel: string;
  rank: 'legend';
  rankLabel: string;
  source: string;
  sourceId?: string;
  sourceUrl?: string;
  updatedAt: string | null;
  columns: StandardMatchupsColumn[];
  rows: StandardMatchupsRow[];
  warning?: string;
}
