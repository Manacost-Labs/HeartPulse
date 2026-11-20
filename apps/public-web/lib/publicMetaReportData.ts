import { isMetaReportDate } from '@/shared/metaReportDate';

export { isMetaReportDate };

/*
 * The weekly meta report snapshot as the report page may print it
 * (docs/specs/meta-report-snapshots.md). Express answers the stored snapshot;
 * every field is copied here by name once more, so a field the answer gains
 * later never reaches the server HTML or the RSC payload.
 */

export type ReportSection<T> = {
  status: 'fresh' | 'stale' | 'missing';
  source: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  data: T | null;
};

export type ReportStandardItem = {
  slug: string; archetype: string; name: string; classKey: string | null;
  winrate: number | null; popularity: number | null; games: number | null;
};
export type ReportStandard = { rank: string; period: string | null; minGames: number | null; totalGames: number | null; items: ReportStandardItem[] };
export type ReportMatchupRow = {
  archetype: string; archetypeLabel: string; games: number | null;
  cells: { opponent: string; winrate: number | null; games: number | null }[];
};
export type ReportMatchups = { period: string | null; columns: { name: string; label: string }[]; rows: ReportMatchupRow[] };
export type ReportArena = { sampleUnit: string | null; classes: { id: string; name: string; winrate: number | null; sample: number | null }[] };
export type ReportHero = { dbfId: number; name: string; tier: string | null; avgPlacement: number | null; top4Rate: number | null };
export type ReportBattlegrounds = { mmr: string | null; heroes: ReportHero[] };
export type ReportPatch = { version: string; title: string | null; publishedAt: string };

export type MetaReportSnapshot = {
  date: string;
  /** When the snapshot was taken (Monday, 06:30 UTC or later). */
  recordedAt: string;
  sections: {
    standard: ReportSection<ReportStandard>;
    matchups: ReportSection<ReportMatchups>;
    arena: ReportSection<ReportArena>;
    battlegrounds: ReportSection<ReportBattlegrounds>;
    patch: ReportSection<ReportPatch>;
  };
};

type Raw = Record<string, unknown>;
const MAX_ROWS = 500;
const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {});
const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value.slice(0, MAX_ROWS) : []);
const text = (value: unknown, max = 200): string | null => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const instant = (value: unknown): string | null => {
  const raw = text(value, 64);
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(Date.parse(raw)).toISOString() : null;
};

function section<T>(value: unknown, project: (data: Raw) => T | null): ReportSection<T> {
  const raw = record(value);
  const status = raw.status === 'fresh' || raw.status === 'stale' ? raw.status : 'missing';
  const data = status === 'missing' ? null : project(record(raw.data));
  return {
    status: data ? status : 'missing', source: text(raw.source, 80), updatedAt: instant(raw.updatedAt),
    fetchedAt: instant(raw.fetchedAt) ?? '', data,
  };
}

const standard = (data: Raw): ReportStandard | null => {
  const items = rows(data.items).flatMap(entry => {
    const item = record(entry);
    const slug = text(item.slug, 90);
    const archetype = text(item.archetype);
    return slug && /^[a-z0-9-]+$/.test(slug) && archetype ? [{
      slug, archetype, name: text(item.name) ?? archetype, classKey: text(item.classKey, 40),
      winrate: finite(item.winrate), popularity: finite(item.popularity), games: finite(item.games),
    }] : [];
  });
  return items.length ? {
    rank: text(data.rank, 40) ?? '', period: text(data.period, 80), minGames: finite(data.minGames),
    totalGames: finite(data.totalGames), items,
  } : null;
};

const matchups = (data: Raw): ReportMatchups | null => {
  const columns = rows(data.columns).flatMap(entry => {
    const column = record(entry);
    const name = text(column.name);
    return name ? [{ name, label: text(column.label) ?? name }] : [];
  });
  const matrix = rows(data.rows).flatMap(entry => {
    const row = record(entry);
    const archetype = text(row.archetype);
    return archetype ? [{
      archetype, archetypeLabel: text(row.archetypeLabel) ?? archetype, games: finite(row.games),
      cells: rows(row.cells).flatMap(cell => {
        const pair = record(cell);
        const opponent = text(pair.opponent);
        return opponent ? [{ opponent, winrate: finite(pair.winrate), games: finite(pair.games) }] : [];
      }),
    }] : [];
  });
  return matrix.length ? { period: text(data.period, 80), columns, rows: matrix } : null;
};

const arena = (data: Raw): ReportArena | null => {
  const classes = rows(data.classes).flatMap(entry => {
    const item = record(entry);
    const id = text(item.id, 40);
    const name = text(item.name, 80);
    return id && name ? [{ id, name, winrate: finite(item.winrate), sample: finite(item.sample) }] : [];
  });
  return classes.length ? { sampleUnit: text(data.sampleUnit, 20), classes } : null;
};

const battlegrounds = (data: Raw): ReportBattlegrounds | null => {
  const heroes = rows(data.heroes).flatMap(entry => {
    const hero = record(entry);
    const dbfId = finite(hero.dbfId);
    const name = text(hero.name, 80);
    return dbfId !== null && Number.isSafeInteger(dbfId) && dbfId > 0 && name ? [{
      dbfId, name, tier: text(hero.tier, 4), avgPlacement: finite(hero.avgPlacement), top4Rate: finite(hero.top4Rate),
    }] : [];
  });
  return heroes.length ? { mmr: text(data.mmr, 40), heroes } : null;
};

const patch = (data: Raw): ReportPatch | null => {
  const version = text(data.version, 20);
  const publishedAt = instant(data.publishedAt);
  return version && /^\d+\.\d+\.\d+$/.test(version) && publishedAt ? { version, title: text(data.title), publishedAt } : null;
};

/** Whitelists `GET /api/meta-reports/:date`, or `null` for an answer that is not a snapshot of that date. */
export function readMetaReportSnapshot(value: unknown, date: string): MetaReportSnapshot | null {
  const raw = record(value);
  const recordedAt = instant(raw.recordedAt);
  if (raw.schemaVersion !== 1 || raw.date !== date || !recordedAt) return null;
  const sections = record(raw.sections);
  const snapshot = {
    date, recordedAt,
    sections: {
      standard: section(sections.standard, standard),
      matchups: section(sections.matchups, matchups),
      arena: section(sections.arena, arena),
      battlegrounds: section(sections.battlegrounds, battlegrounds),
      patch: section(sections.patch, patch),
    },
  };
  // A report exists only with its Standard section (the snapshot job never records one without it).
  return snapshot.sections.standard.data ? snapshot : null;
}

/** Whitelists `GET /api/meta-reports`: valid dates, newest first, without repeats. */
export function readMetaReportDates(value: unknown): string[] | null {
  const dates = record(value).dates;
  if (!Array.isArray(dates)) return null;
  return [...new Set(dates.filter((date): date is string => typeof date === 'string' && isMetaReportDate(date)))]
    .sort((left, right) => right.localeCompare(left));
}
