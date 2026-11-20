import type {
  MetaReportArena, MetaReportBattlegrounds, MetaReportMatchups, MetaReportPatch, MetaReportSection,
  MetaReportSnapshot, MetaReportSources, MetaReportStandard,
} from './contract.js';

/*
 * Field-by-field allowlist of the snapshot. The sources are already the open
 * projections of the site; each field is named here once more, so a field one of
 * them gains later (or a paid one let through by mistake) never reaches the
 * stored, unchangeable snapshot.
 */

const STALE_AFTER_MS = 48 * 60 * 60_000;
/** Fewer archetypes from 100 games than this is not a meta worth a report. */
const MIN_STANDARD_ARCHETYPES = 20;

type Raw = Record<string, unknown>;
const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {});
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const date = (value: unknown): string | null => {
  const parsed = Date.parse(text(value) ?? '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

function standard(value: unknown): MetaReportStandard | null {
  const data = record(value);
  const items = list(data.items).flatMap(entry => {
    const item = record(entry);
    const slug = text(item.slug);
    const archetype = text(item.archetype);
    return slug && archetype ? [{
      slug, archetype, name: text(item.archetypeLabel) ?? archetype, classKey: text(item.classKey),
      winrate: finite(item.winrate), popularity: finite(item.popularity), games: finite(item.games),
    }] : [];
  });
  return items.length ? {
    format: text(data.format) ?? 'standard', rank: text(data.rank) ?? '', period: text(data.period),
    currentPatchPeriod: text(data.currentPatchPeriod), minGames: finite(data.minGames), totalGames: finite(data.totalGames), items,
  } : null;
}

function matchups(value: unknown): MetaReportMatchups | null {
  const data = record(value);
  const columns = list(data.columns).flatMap(entry => {
    const column = record(entry);
    const name = text(column.name);
    return name ? [{
      name, label: text(column.label) ?? name, classKey: text(column.classKey), popularity: text(column.popularity), games: finite(column.games),
    }] : [];
  });
  const rows = list(data.rows).flatMap(entry => {
    const row = record(entry);
    const archetype = text(row.archetype);
    return archetype ? [{
      archetype, archetypeLabel: text(row.archetypeLabel) ?? archetype, classKey: text(row.classKey),
      winrate: finite(row.winrate), games: finite(row.games),
      cells: list(row.cells).flatMap(cell => {
        const pair = record(cell);
        const opponent = text(pair.opponent);
        return opponent ? [{ opponent, winrate: finite(pair.winrate), games: finite(pair.games) }] : [];
      }),
    }] : [];
  });
  return rows.length && columns.length ? {
    format: text(data.format) ?? 'standard', rank: text(data.rank) ?? '', period: text(data.period),
    minGames: finite(data.minGames), totalGames: finite(data.totalGames), columns, rows,
  } : null;
}

function arena(value: unknown): MetaReportArena | null {
  const data = record(value);
  const classes = list(data.classes).flatMap(entry => {
    const item = record(entry);
    const id = text(item.id);
    const name = text(item.name);
    return id && name ? [{ place: finite(item.place), id, name, winrate: finite(item.winrate), sample: finite(item.sample) }] : [];
  });
  return classes.length ? { sampleUnit: text(data.sampleUnit), classes } : null;
}

function battlegrounds(value: unknown): MetaReportBattlegrounds | null {
  const data = record(value);
  const heroes = list(data.heroes).flatMap(entry => {
    const hero = record(entry);
    const dbfId = finite(hero.dbfId);
    const name = text(hero.name);
    return dbfId !== null && name ? [{
      dbfId, cardId: text(hero.cardId), name, tier: text(hero.tier),
      avgPlacement: finite(hero.avgPlacement), top4Rate: finite(hero.top4Rate), pickRate: finite(hero.pickRate),
    }] : [];
  });
  return heroes.length ? { mode: 'solo', mmr: text(data.mmr), heroes } : null;
}

const shortVersion = (value: string): string | null => {
  const match = value.match(/(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?/);
  return match ? `${match[1]}.${match[2]}.${match[3] ?? 0}` : null;
};

/** hs-data-api writes `published_at` of an article as Moscow time without an offset. */
const moscowTime = (value: unknown): string | null => {
  const raw = text(value);
  return raw && raw.includes('T') && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? `${raw}+03:00` : raw;
};

/** The newest patch of the hs-data-api list that has a version and a date. */
function patch(value: unknown): MetaReportPatch | null {
  const patches = list(record(value).patches).flatMap(entry => {
    const row = record(entry);
    const build = text(row.version);
    const version = build ? shortVersion(build) : null;
    const publishedAt = date(row.official_published_at) ?? date(moscowTime(row.published_at));
    return build && version && publishedAt ? [{ version, build, title: text(row.title), publishedAt }] : [];
  });
  return patches.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0] ?? null;
}

type Read = { value: unknown } | { error: unknown };

function section<T>(read: Read, project: (value: unknown) => T | null, now: number, ages: boolean): MetaReportSection<T> {
  const fetchedAt = new Date(now).toISOString();
  const data = 'value' in read ? project(read.value) : null;
  if (!data) return { status: 'missing', source: null, updatedAt: null, fetchedAt, data: null };
  const value = record((read as { value: unknown }).value);
  const updatedAt = date(value.updatedAt);
  const fresh = !ages || (updatedAt !== null && now - Date.parse(updatedAt) <= STALE_AFTER_MS);
  return { status: fresh ? 'fresh' : 'stale', source: text(value.source), updatedAt, fetchedAt, data };
}

const settle = async (load: () => Promise<unknown>): Promise<Read> => {
  try {
    return { value: await load() };
  } catch (error) {
    return { error };
  }
};

/** Reads every source once; a failing source is a `missing` section, never a failed snapshot. */
export async function readMetaReportSections(sources: MetaReportSources, now: number): Promise<MetaReportSnapshot['sections']> {
  const [standardRead, matchupsRead, arenaRead, battlegroundsRead, patchesRead] = await Promise.all(
    [sources.standard, sources.matchups, sources.arena, sources.battlegrounds, sources.patches].map(settle),
  );
  const patchSection = section(patchesRead, patch, now, false);
  return {
    standard: section(standardRead, standard, now, true),
    matchups: section(matchupsRead, matchups, now, true),
    arena: section(arenaRead, arena, now, true),
    battlegrounds: section(battlegroundsRead, battlegrounds, now, true),
    // The patch list has no date of its own; its source is the hs-data-api patch archive.
    patch: patchSection.data ? { ...patchSection, source: 'api.kolodahearthstone.com' } : patchSection,
  };
}

/** A report needs a fresh Standard section with enough archetypes; other sections may be stale or missing. */
export function hasReportableStandard(sections: MetaReportSnapshot['sections']): boolean {
  const { status, data } = sections.standard;
  return status === 'fresh' && (data?.items.length ?? 0) >= MIN_STANDARD_ARCHETYPES;
}
