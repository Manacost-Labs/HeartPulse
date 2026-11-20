import { createMetaReportSnapshots, type MetaReportSnapshots } from './modules/metaReport/public.js';
import { createBattlegroundHeroCatalogLoader } from './battlegroundHeroRankingSource.js';
import { projectBattlegroundHeroRanking } from './battlegroundHeroRankingProjection.js';
import { loadPublicStandardMatchups } from './standardMatchupPublicSlice.js';
import { standardMatchupSliceDependencies } from './standardMatchupSlices.js';
import { loadPublicStandardMeta } from './standardMetaPublicSlice.js';
import { projectWinratesPublicTeaser } from './winrateRoutes.js';

/**
 * Wires the weekly meta report snapshots (docs/specs/meta-report-snapshots.md) to
 * the same open projections Express answers guests: `/api/standard-meta/public`,
 * `/api/standard/matchups/public`, `/api/winrates/public-teaser`,
 * `/api/bg/heroes/public?mode=solo` and the hs-data-api patch list. Each source is
 * called directly (no HTTP to the site itself) and only for Standard and Solo.
 */
export function startMetaReportSnapshots(dependencies: {
  stateDirectory: string;
  hourly: boolean;
  now?: () => number;
  loadMeta: Parameters<typeof loadPublicStandardMeta>[0];
  matchups: Parameters<typeof standardMatchupSliceDependencies>[0];
  getTranslations: (now: number) => Promise<unknown>;
  /** The HSReplay class winrate dataset, as `/api/winrates` reads it from its origin. */
  loadArenaWinrates: () => Promise<unknown>;
  /**
   * The local class winrate snapshot (`winrates.json`) the guest teaser falls back to: used when it is
   * fresher than the origin's answer or the origin fails, as `/api/winrates/public-teaser` does.
   */
  loadArenaSnapshot?: () => { data: unknown } | null;
  loadHeroCatalog?: ReturnType<typeof createBattlegroundHeroCatalogLoader>;
  fetchJson: (url: string) => Promise<unknown>;
  patchesUrl: string;
  onError?: (error: unknown) => void;
}): MetaReportSnapshots {
  const now = dependencies.now ?? Date.now;
  const matchups = { ...standardMatchupSliceDependencies(dependencies.matchups), getTranslations: dependencies.getTranslations };
  const loadHeroCatalog = dependencies.loadHeroCatalog ?? createBattlegroundHeroCatalogLoader();
  return createMetaReportSnapshots({
    stateDirectory: dependencies.stateDirectory,
    hourly: dependencies.hourly,
    now,
    onError: dependencies.onError ?? (error => console.error('[meta-report-snapshots]', error instanceof Error ? error.message : error)),
    sources: {
      standard: () => loadPublicStandardMeta(dependencies.loadMeta, 'standard'),
      matchups: () => loadPublicStandardMatchups(matchups, 'standard', now()),
      arena: async () => projectWinratesPublicTeaser(await freshestArena(dependencies)),
      battlegrounds: async () => projectBattlegroundHeroRanking(await loadHeroCatalog('solo'), 'solo'),
      patches: () => dependencies.fetchJson(dependencies.patchesUrl),
    },
  });
}

const arenaClasses = (data: unknown) => Array.isArray((data as { classes?: unknown } | null)?.classes)
  && ((data as { classes: unknown[] }).classes.length > 0);
const arenaUpdated = (data: unknown) => {
  const parsed = Date.parse(String((data as { updatedAt?: unknown } | null)?.updatedAt ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The dataset the guest teaser would show: the origin's, unless the local snapshot is fresher or the origin fails. */
async function freshestArena(dependencies: {
  loadArenaWinrates: () => Promise<unknown>; loadArenaSnapshot?: () => { data: unknown } | null;
}): Promise<unknown> {
  const local = dependencies.loadArenaSnapshot?.()?.data;
  const snapshot = arenaClasses(local) ? local : null;
  try {
    const origin = await dependencies.loadArenaWinrates();
    if (!arenaClasses(origin)) throw new Error('Empty class winrate dataset');
    return snapshot && arenaUpdated(snapshot) > arenaUpdated(origin) ? snapshot : origin;
  } catch (error) {
    if (snapshot) return snapshot;
    throw error;
  }
}
