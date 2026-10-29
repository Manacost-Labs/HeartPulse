import { Router, type RequestHandler, type Response } from 'express';
import { asRecord, normalizeFunDeckRow, numberOrNull, text, type FunDeckRow } from './funDeckRows.js';

export type { FunDeckRow };

export type FunDecksPayload = {
  sourceId: string;
  fetchedAt: string | null;
  detectorVersion: string | null;
  theory: string | null;
  stats: Record<string, unknown>;
  filters: Record<string, unknown>;
  cadence: {
    label: string;
    timers: string[];
    schedule: string;
  };
  decks: FunDeckRow[];
};

export type AdminFunDecksDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  loadFunDecks: () => Promise<unknown>;
  onError?: (error: unknown) => void;
};

export type PublicFunDecksPayload = {
  fetchedAt: string | null;
  stats: {
    total: number;
    standard: number;
    wild: number;
  };
  methodology: {
    detectorVersion: string | null;
    minFunScore: number;
    maxMetaSimilarity: number;
  };
  decks: FunDeckRow[];
};

export type PublicFunDecksDependencies = {
  loadFunDecks: () => Promise<unknown>;
  /** The site's Russian archetype names; a failure leaves the English ones. */
  loadArchetypeLabels?: () => Promise<(name: string) => string>;
  getPreview?: (deck: FunDeckRow) => FunDeckRow['render'] | null;
  schedulePreviews?: (decks: FunDeckRow[]) => void;
  onError?: (error: unknown) => void;
};

export function normalizeFunDecksPayload(raw: unknown): FunDecksPayload {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const structured = asRecord(data.structured);
  const rows = Array.isArray(structured.rows) ? structured.rows : [];
  const decks = rows.map(normalizeFunDeckRow).filter(deck => deck.deckCode.length >= 20);

  decks.sort((left, right) => {
    const formatComparison = left.format.localeCompare(right.format, 'ru');
    return formatComparison || (right.funScore ?? 0) - (left.funScore ?? 0);
  });

  return {
    sourceId: text(root.source_id) || text(data.source_id) || 'hsguru_fun_decks',
    fetchedAt: text(root.fetched_at) || null,
    detectorVersion: text(structured.detector_version) || null,
    theory: text(structured.theory) || null,
    stats: asRecord(structured.stats),
    filters: asRecord(structured.filters),
    cadence: {
      label: 'Стримерские колоды — раз в час, Standard — раз в 2 часа',
      timers: [
        'hs-data-api-docker-firecrawl-streamer.timer',
        'hs-data-api-docker-refresh-fun-decks-standard.timer',
      ],
      schedule: 'каждый час в :15 и каждые 2 часа в :45 (Europe/Warsaw)',
    },
    decks,
  };
}

export function normalizePublicFunDecksPayload(raw: unknown): PublicFunDecksPayload {
  const normalized = normalizeFunDecksPayload(raw);
  const formatCounts = normalized.decks.reduce((counts, deck) => {
    const format = deck.format.toLowerCase();
    if (format === 'wild') counts.wild += 1;
    else if (format === 'standard') counts.standard += 1;
    return counts;
  }, { standard: 0, wild: 0 });

  return {
    fetchedAt: normalized.fetchedAt,
    stats: {
      total: normalized.decks.length,
      ...formatCounts,
    },
    methodology: {
      detectorVersion: normalized.detectorVersion,
      minFunScore: numberOrNull(normalized.filters.min_fun_score) ?? 0.55,
      maxMetaSimilarity: numberOrNull(normalized.filters.max_meta_similarity) ?? 0.42,
    },
    decks: normalized.decks,
  };
}

export function createPublicFunDecksRouter(dependencies: PublicFunDecksDependencies): Router {
  const router = Router();

  router.get('/fun-decks', async (_request, response) => {
    try {
      const payload = normalizePublicFunDecksPayload(await dependencies.loadFunDecks());
      const archetypeLabel = await dependencies.loadArchetypeLabels?.().catch(error => {
        dependencies.onError?.(error);
        return null;
      });
      if (archetypeLabel) {
        payload.decks = payload.decks.map(deck => (
          deck.nearestArchetype ? { ...deck, nearestArchetypeLabel: archetypeLabel(deck.nearestArchetype) } : deck
        ));
      }
      if (dependencies.getPreview) {
        payload.decks = payload.decks.map(deck => {
          const render = dependencies.getPreview?.(deck);
          return render ? { ...deck, render } : deck;
        });
      }
      if (dependencies.schedulePreviews) {
        queueMicrotask(() => {
          try {
            dependencies.schedulePreviews?.(payload.decks);
          } catch (error) {
            dependencies.onError?.(error);
          }
        });
      }
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      return response.json(payload);
    } catch (error) {
      response.setHeader('Cache-Control', 'no-store');
      dependencies.onError?.(error);
      return response.status(502).json({
        code: 'FUN_DECKS_UNAVAILABLE',
        error: 'Не удалось загрузить фан-колоды',
      });
    }
  });

  return router;
}

export function createAdminFunDecksRouter(dependencies: AdminFunDecksDependencies): Router {
  const router = Router();
  router.use('/admin/fun-decks', dependencies.adminGuard, (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  });

  router.get('/admin/fun-decks', async (_request, response) => {
    try {
      return response.json(normalizeFunDecksPayload(await dependencies.loadFunDecks()));
    } catch (error) {
      dependencies.onError?.(error);
      return response.status(502).json({
        code: 'FUN_DECKS_UNAVAILABLE',
        error: 'Не удалось загрузить фановые колоды',
      });
    }
  });

  return router;
}
