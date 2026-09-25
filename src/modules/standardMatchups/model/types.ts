export type StandardMatchupsFormat = 'standard' | 'wild';

export interface StandardMatchupsColumn {
  name: string;
  label?: string;
  popularity: string | null;
}

export interface StandardMatchupsCell {
  opponent: string;
  opponentLabel?: string;
  winrate: number | null;
}

export interface StandardMatchupsRow {
  archetype: string;
  archetypeLabel?: string;
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
