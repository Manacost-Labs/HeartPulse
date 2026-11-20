/*
 * The weekly meta report snapshot (docs/specs/meta-report-snapshots.md): what the
 * open layer showed a guest on a Monday, kept as it was. Every field below is
 * one a guest already reads without a subscription; nothing else is stored.
 */

/** `fresh`: read and no older than 48 h; `stale`: read, but older or undated; `missing`: not read. */
export type MetaReportSectionStatus = 'fresh' | 'stale' | 'missing';

export type MetaReportSection<T> = {
  status: MetaReportSectionStatus;
  /** Who publishes the figures (`hsguru`, `HSReplay`, `api.kolodahearthstone.com`). */
  source: string | null;
  /** When the source last refreshed the data, as it says. */
  updatedAt: string | null;
  /** When the site read it for this snapshot. */
  fetchedAt: string;
  data: T | null;
};

export type MetaReportStandard = {
  format: string;
  rank: string;
  /** The HSGuru period of the figures: weeks are compared only within one period. */
  period: string | null;
  currentPatchPeriod: string | null;
  minGames: number | null;
  totalGames: number | null;
  items: {
    slug: string;
    archetype: string;
    name: string;
    classKey: string | null;
    winrate: number | null;
    popularity: number | null;
    games: number | null;
  }[];
};

export type MetaReportMatchups = {
  format: string;
  rank: string;
  period: string | null;
  minGames: number | null;
  totalGames: number | null;
  columns: { name: string; label: string; classKey: string | null; popularity: string | null; games: number | null }[];
  rows: {
    archetype: string;
    archetypeLabel: string;
    classKey: string | null;
    winrate: number | null;
    games: number | null;
    cells: { opponent: string; winrate: number | null; games: number | null }[];
  }[];
};

export type MetaReportArena = {
  sampleUnit: string | null;
  classes: { place: number | null; id: string; name: string; winrate: number | null; sample: number | null }[];
};

export type MetaReportBattlegrounds = {
  mode: 'solo';
  mmr: string | null;
  heroes: {
    dbfId: number;
    cardId: string | null;
    name: string;
    tier: string | null;
    avgPlacement: number | null;
    top4Rate: number | null;
    pickRate: number | null;
  }[];
};

export type MetaReportPatch = {
  /** Short version, `37.0.2`. */
  version: string;
  build: string;
  title: string | null;
  publishedAt: string;
};

export type MetaReportSnapshot = {
  schemaVersion: 1;
  /** The Monday of the snapshot, UTC, `YYYY-MM-DD`. */
  date: string;
  recordedAt: string;
  sections: {
    standard: MetaReportSection<MetaReportStandard>;
    matchups: MetaReportSection<MetaReportMatchups>;
    arena: MetaReportSection<MetaReportArena>;
    battlegrounds: MetaReportSection<MetaReportBattlegrounds>;
    patch: MetaReportSection<MetaReportPatch>;
  };
};

/** Reads of the open projections the site already answers to guests (composition supplies them). */
export type MetaReportSources = {
  standard: () => Promise<unknown>;
  matchups: () => Promise<unknown>;
  arena: () => Promise<unknown>;
  battlegrounds: () => Promise<unknown>;
  /** The hs-data-api patch list, `{ patches: [...] }`. */
  patches: () => Promise<unknown>;
};

/**
 * `recorded`: written now. `exists`: the day already has its snapshot. `not-due`: not
 * a Monday, or before 06:30 UTC. `standard-unavailable`: the Standard section is stale,
 * missing or has fewer than 20 archetypes, so there is no report for the day (yet: the
 * next hourly check of the same Monday tries again). `failed`: the write itself failed.
 */
export type MetaReportRunResult = 'recorded' | 'exists' | 'not-due' | 'standard-unavailable' | 'failed';
