import type { Request, RequestHandler, Response, Router } from 'express';
import cron from 'node-cron';
import type {
  ArenaClassId,
  ArenaSynergyPayload,
} from '../shared/arenaSynergyContract.js';
import { createAdminArenaSynergyRouter } from './adminArenaSynergyRoutes.js';
import { analyzeArenaSynergies } from './arenaSynergyAnalysis.js';
import {
  createArenaSynergyHistoryStore,
  type ArenaSynergyHistoryStore,
  type ArenaSynergyStoredSnapshot,
} from './arenaSynergyHistoryStore.js';
import {
  createArenaDraftRefreshPipeline,
  type ArenaDraftRefreshMetric,
  type ArenaDraftRefreshPublication,
} from './arenaDraftRefreshPipeline.js';

const DEFAULT_REFRESH_SCHEDULE = '17 * * * *';

type ArenaSynergySourceCache = {
  expiresAt: number;
  winningDecks: unknown;
  cardStats: unknown;
  patches: unknown;
};

export type AdminArenaSynergyServiceDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  csrfAllowed: (request: Request) => boolean;
  stateDirectory: string;
  fetchDataset: (datasetId: string, timeoutMs?: number) => Promise<unknown>;
  now?: () => Date;
  cacheTtlMs?: number;
  enableRefreshPipeline?: boolean;
  refreshSchedule?: string;
  refreshOnStartup?: boolean;
  onRefreshMetric?: (metric: ArenaDraftRefreshMetric) => void;
  onError?: (error: unknown) => void;
};

export type ArenaSynergyAnalysisLoaderDependencies = Pick<
  AdminArenaSynergyServiceDependencies,
  'stateDirectory' | 'fetchDataset' | 'now' | 'cacheTtlMs' | 'onError'
> & {
  historyStore?: ArenaSynergyHistoryStore;
};

export type ArenaSynergyAnalysisLoader = (
  className: ArenaClassId,
  options: { forceRefresh: boolean },
) => Promise<ArenaSynergyPayload>;

export type ArenaSynergyAnalysisManager = {
  load: ArenaSynergyAnalysisLoader;
  refreshAll: () => Promise<ArenaDraftRefreshPublication>;
};

function cardIdsFromStats(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const structured = (data as Record<string, unknown>).structured;
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) return [];
  const cards = (structured as Record<string, unknown>).cards;
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, 5_000).map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    const record = item as Record<string, unknown>;
    return String(record.card_id ?? record.id ?? '').trim();
  }).filter(id => id.length > 0 && id.length <= 80);
}

function lastKnownGood(
  snapshot: ArenaSynergyStoredSnapshot,
  historyStore: ArenaSynergyHistoryStore,
): ArenaSynergyPayload {
  return {
    ...snapshot.payload,
    summary: {
      ...snapshot.payload.summary,
      warnings: [
        ...snapshot.payload.summary.warnings,
        'Новый источник недоступен или не прошёл проверки качества: показан последний надёжный расчёт.',
      ],
    },
    reliability: {
      ...snapshot.payload.reliability,
      sampleMode: 'last-known-good',
      servedFrom: 'last-known-good',
      currentWeight: 0,
      historicalWeight: 1,
      limitations: [
        ...snapshot.payload.reliability.limitations,
        'Ответ получен из сохранённого last-known-good snapshot.',
      ],
    },
    history: historyStore.history(snapshot.payload.selectedClass),
  };
}

export function createArenaSynergyAnalysisManager(
  dependencies: ArenaSynergyAnalysisLoaderDependencies,
): ArenaSynergyAnalysisManager {
  const now = dependencies.now ?? (() => new Date());
  const historyStore = dependencies.historyStore ?? createArenaSynergyHistoryStore({
    stateDirectory: dependencies.stateDirectory,
    now,
  });
  let sourceCache: ArenaSynergySourceCache | null = null;

  const fetchSources = async (timestamp: number): Promise<ArenaSynergySourceCache> => {
    const timeoutMs = Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000);
    const [winningDecks, cardStats, patches] = await Promise.all([
      dependencies.fetchDataset('hsreplay_arena_winning_decks', timeoutMs),
      dependencies.fetchDataset('hsreplay_arena_cards_advanced', timeoutMs),
      dependencies.fetchDataset('api/patches?limit=20&include_content=false', timeoutMs),
    ]);
    return {
      expiresAt: timestamp + (
        dependencies.cacheTtlMs
        ?? Number(process.env.ADMIN_ARENA_SYNERGY_CACHE_MS || 15 * 60_000)
      ),
      winningDecks,
      cardStats,
      patches,
    };
  };

  const analyze = (
    sources: ArenaSynergySourceCache,
    className: ArenaClassId,
    timestamp: Date,
  ) => analyzeArenaSynergies({
    ...sources,
    className,
    previousSnapshot: historyStore.latest(className),
    now: timestamp,
  });

  const snapshot = (
    payload: ArenaSynergyPayload,
    sources: ArenaSynergySourceCache,
    savedAt: string,
  ): ArenaSynergyStoredSnapshot => ({
    savedAt,
    activeCardIds: cardIdsFromStats(sources.cardStats),
    payload,
  });

  const load: ArenaSynergyAnalysisLoader = async (className, options) => {
    try {
      const timestamp = now();
      const sources = options.forceRefresh
        || !sourceCache
        || sourceCache.expiresAt <= timestamp.getTime()
        ? await fetchSources(timestamp.getTime())
        : sourceCache;
      const payload = analyze(sources, className, timestamp);
      if (payload.dataQuality.status === 'blocked') {
        throw new Error('ARENA_SYNERGY_DATA_QUALITY_BLOCKED');
      }
      sourceCache = sources;

      let history = historyStore.history(className);
      try {
        historyStore.save(snapshot(payload, sources, now().toISOString()));
        history = historyStore.history(className);
      } catch (persistenceError) {
        dependencies.onError?.(persistenceError);
        return {
          ...payload,
          summary: {
            ...payload.summary,
            warnings: [
              ...payload.summary.warnings,
              'Расчёт актуален, но сохранить историю этой версии не удалось.',
            ],
          },
          history,
        };
      }
      return {
        ...payload,
        history,
      };
    } catch (error) {
      dependencies.onError?.(error);
      const fallback = historyStore.latest(className);
      if (fallback) return lastKnownGood(fallback, historyStore);
      throw new Error('ARENA_SYNERGY_SOURCE_UNAVAILABLE');
    }
  };

  const refreshAll = async (): Promise<ArenaDraftRefreshPublication> => {
    const timestamp = now();
    let sources: ArenaSynergySourceCache;
    try {
      sources = await fetchSources(timestamp.getTime());
    } catch {
      throw new Error('ARENA_DRAFT_SOURCE_UNAVAILABLE');
    }
    const all = analyze(sources, 'ALL', timestamp);
    if (all.dataQuality.status !== 'healthy') {
      throw new Error('ARENA_SYNERGY_HEALTHY_DATA_REQUIRED');
    }
    const classes = all.availableClasses
      .filter(item => item.id !== 'ALL' && item.runs >= 20)
      .map(item => item.id);
    const payloads = [
      all,
      ...classes.map(className => analyze(sources, className, timestamp)),
    ];
    if (payloads.some(payload => (
      payload.dataQuality.status !== 'healthy'
      || payload.reliability.sampleMode === 'insufficient'
      || (payload.selectedClass !== 'ALL' && !payload.draftAdvisor)
    ))) {
      throw new Error('ARENA_SYNERGY_REFRESH_BATCH_REJECTED');
    }
    const savedAt = now().toISOString();
    try {
      historyStore.saveMany(payloads.map(payload => snapshot(payload, sources, savedAt)));
    } catch {
      throw new Error('ARENA_DRAFT_PUBLICATION_FAILED');
    }
    sourceCache = sources;
    return {
      cohortId: all.cohort.id,
      patchVersion: all.cohort.patchVersion,
      sourceRows: all.dataQuality.metrics.sourceRows,
      qualityScore: all.dataQuality.score,
      publishedClasses: payloads.map(payload => payload.selectedClass),
    };
  };

  return { load, refreshAll };
}

export function createArenaSynergyAnalysisLoader(
  dependencies: ArenaSynergyAnalysisLoaderDependencies,
): ArenaSynergyAnalysisLoader {
  return createArenaSynergyAnalysisManager(dependencies).load;
}

export function createAdminArenaSynergyServiceRouter(
  dependencies: AdminArenaSynergyServiceDependencies,
): Router {
  const reportError = dependencies.onError ?? (error => console.error(
    '[admin arena synergies]',
    error instanceof Error ? error.message : error,
  ));
  const manager = createArenaSynergyAnalysisManager({
    ...dependencies,
    onError: reportError,
  });
  const requestedSchedule = dependencies.refreshSchedule
    ?? process.env.ARENA_DRAFT_REFRESH_CRON
    ?? DEFAULT_REFRESH_SCHEDULE;
  const schedule = cron.validate(requestedSchedule)
    ? requestedSchedule
    : DEFAULT_REFRESH_SCHEDULE;
  if (schedule !== requestedSchedule) {
    reportError(new Error('ARENA_DRAFT_REFRESH_INVALID_SCHEDULE'));
  }
  const refreshPipeline = createArenaDraftRefreshPipeline({
    stateDirectory: dependencies.stateDirectory,
    schedule,
    refresh: manager.refreshAll,
    onMetric: dependencies.onRefreshMetric,
  });
  if (dependencies.enableRefreshPipeline) {
    cron.schedule(schedule, async () => {
      await refreshPipeline.run('scheduled');
    }, {
      name: 'arena-draft-refresh',
      timezone: 'UTC',
      noOverlap: true,
      maxRandomDelay: 120_000,
    });
    if (dependencies.refreshOnStartup !== false) {
      const configuredDelay = Number(process.env.ARENA_DRAFT_REFRESH_STARTUP_DELAY_MS ?? 15_000);
      const startupDelayMs = Number.isFinite(configuredDelay)
        ? Math.max(0, Math.min(300_000, configuredDelay))
        : 15_000;
      setTimeout(() => void refreshPipeline.run('startup'), startupDelayMs).unref();
    }
  }
  return createAdminArenaSynergyRouter({
    adminGuard: dependencies.adminGuard,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    csrfAllowed: dependencies.csrfAllowed,
    loadAnalysis: manager.load,
    refreshPipeline,
    onError: reportError,
  });
}
