import type { RequestHandler, Response, Router } from 'express';
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

type ArenaSynergySourceCache = {
  expiresAt: number;
  winningDecks: unknown;
  cardStats: unknown;
  patches: unknown;
};

export type AdminArenaSynergyServiceDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  stateDirectory: string;
  fetchDataset: (datasetId: string, timeoutMs?: number) => Promise<unknown>;
  now?: () => Date;
  cacheTtlMs?: number;
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

export function createArenaSynergyAnalysisLoader(
  dependencies: ArenaSynergyAnalysisLoaderDependencies,
): ArenaSynergyAnalysisLoader {
  const now = dependencies.now ?? (() => new Date());
  const historyStore = dependencies.historyStore ?? createArenaSynergyHistoryStore({
    stateDirectory: dependencies.stateDirectory,
    now,
  });
  let sourceCache: ArenaSynergySourceCache | null = null;

  return async (className, options) => {
    try {
      const timestamp = now().getTime();
      if (options.forceRefresh || !sourceCache || sourceCache.expiresAt <= timestamp) {
        const timeoutMs = Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000);
        const [winningDecks, cardStats, patches] = await Promise.all([
          dependencies.fetchDataset('hsreplay_arena_winning_decks', timeoutMs),
          dependencies.fetchDataset('hsreplay_arena_cards_advanced', timeoutMs),
          dependencies.fetchDataset('api/patches?limit=20&include_content=false', timeoutMs),
        ]);
        sourceCache = {
          expiresAt: timestamp + (
            dependencies.cacheTtlMs
            ?? Number(process.env.ADMIN_ARENA_SYNERGY_CACHE_MS || 15 * 60_000)
          ),
          winningDecks,
          cardStats,
          patches,
        };
      }

      const payload = analyzeArenaSynergies({
        ...sourceCache,
        className,
        previousSnapshot: historyStore.latest(className),
        now: now(),
      });
      if (payload.dataQuality.status === 'blocked') {
        throw new Error('ARENA_SYNERGY_DATA_QUALITY_BLOCKED');
      }

      let history = historyStore.history(className);
      try {
        historyStore.save({
          savedAt: now().toISOString(),
          activeCardIds: cardIdsFromStats(sourceCache.cardStats),
          payload,
        });
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
}

export function createAdminArenaSynergyServiceRouter(
  dependencies: AdminArenaSynergyServiceDependencies,
): Router {
  const reportError = dependencies.onError ?? (error => console.error(
    '[admin arena synergies]',
    error instanceof Error ? error.message : error,
  ));
  const loadAnalysis = createArenaSynergyAnalysisLoader({
    ...dependencies,
    onError: reportError,
  });
  return createAdminArenaSynergyRouter({
    adminGuard: dependencies.adminGuard,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    loadAnalysis,
    onError: reportError,
  });
}
