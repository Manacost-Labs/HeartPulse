import { Router, type RequestHandler, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createAdminFunDeckModerationRouter, type AdminFunDeckModerationDependencies } from './adminFunDeckModerationRoutes.js';
import { applyFunDeckModeration, listFunDeckModeration, type FunDeckModerationRecord } from './adminFunDeckModerationStore.js';
import { createFunDeckOpenCards, type FunDeckOpenCardsDependencies } from './funDeckOpenCards.js';
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
  /** Admin selection only: the hidden decks, from their snapshots. */
  hidden?: Array<{ format: string; deckCode: string; deck: FunDeckRow | null; note: string | null; updatedBy: string | null; updatedAt: string }>;
};

export type AdminFunDecksDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  loadFunDecks: () => Promise<unknown>;
  /** The moderation table; without it the selection is the dataset as is and nothing can be moderated. */
  getDatabase?: () => DatabaseSync;
  adminAuth?: AdminFunDeckModerationDependencies['adminAuth'];
  recordAudit?: AdminFunDeckModerationDependencies['recordAudit'];
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
    /** From the dataset's `filters`; null when the detector version does not publish it. */
    minFunScore: number | null;
    /** Only the concept-v7 detector; null for v8. */
    maxMetaSimilarity: number | null;
    /** The share of common cards with a ladder list that rules a deck out (concept-v8). */
    ladderMemberSim: number | null;
  };
  decks: FunDeckRow[];
};

export type PublicFunDecksDependencies = {
  loadFunDecks: () => Promise<unknown>;
  /** The moderation table: the admin's hide/pin decisions. A failure to read it leaves the dataset unmoderated. */
  getDatabase?: () => DatabaseSync;
  /** The site's Russian archetype names; a failure leaves the English ones. */
  loadArchetypeLabels?: () => Promise<(name: string) => string>;
  /** The card catalog of a format: with it every deck of the answer carries its decoded card list. */
  loadCardCatalog?: FunDeckOpenCardsDependencies['loadCardCatalog'];
  loadCardDictionaries?: FunDeckOpenCardsDependencies['loadCardDictionaries'];
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

function countByFormat(decks: readonly FunDeckRow[]): PublicFunDecksPayload['stats'] {
  const counts = decks.reduce((sum, deck) => {
    const format = deck.format.toLowerCase();
    if (format === 'wild') sum.wild += 1;
    else if (format === 'standard') sum.standard += 1;
    return sum;
  }, { standard: 0, wild: 0 });
  return { total: decks.length, ...counts };
}

export function normalizePublicFunDecksPayload(raw: unknown): PublicFunDecksPayload {
  const normalized = normalizeFunDecksPayload(raw);
  return {
    fetchedAt: normalized.fetchedAt,
    stats: countByFormat(normalized.decks),
    methodology: {
      detectorVersion: normalized.detectorVersion,
      minFunScore: numberOrNull(normalized.filters.min_fun_score),
      maxMetaSimilarity: numberOrNull(normalized.filters.max_meta_similarity),
      ladderMemberSim: numberOrNull(normalized.filters.ladder_member_sim),
    },
    // `candidateSourceId` is an internal source id no page reads: it stays in the admin answer only.
    decks: normalized.decks.map(({ candidateSourceId: _internal, ...deck }) => deck),
  };
}

/** Hidden decks leave, pinned ones lead their format, and the counts follow. */
function moderatePublicPayload(payload: PublicFunDecksPayload, dependencies: PublicFunDecksDependencies): void {
  let records: FunDeckModerationRecord[];
  try {
    records = dependencies.getDatabase ? listFunDeckModeration(dependencies.getDatabase()) : [];
  } catch (error) {
    dependencies.onError?.(error);
    return;
  }
  if (!records.length) return;
  // A pinned deck outside the dataset comes from its admin snapshot, which still has the internal source id.
  payload.decks = applyFunDeckModeration(payload.decks, records)
    .map(({ candidateSourceId: _internal, ...deck }) => deck as FunDeckRow);
  payload.stats = countByFormat(payload.decks);
}

/** The decks the public page shows, moderated, for background jobs such as the art prewarm. */
export async function loadPublishedFunDecks(
  dependencies: Pick<PublicFunDecksDependencies, 'loadFunDecks' | 'getDatabase' | 'onError'>,
): Promise<FunDeckRow[]> {
  const payload = normalizePublicFunDecksPayload(await dependencies.loadFunDecks());
  moderatePublicPayload(payload, dependencies as PublicFunDecksDependencies);
  return payload.decks;
}

export function createPublicFunDecksRouter(dependencies: PublicFunDecksDependencies): Router {
  const router = Router();
  const withCards = dependencies.loadCardCatalog ? createFunDeckOpenCards({ loadCardCatalog: dependencies.loadCardCatalog,
    loadCardDictionaries: dependencies.loadCardDictionaries, onError: dependencies.onError }) : null;

  router.get('/fun-decks', async (_request, response) => {
    try {
      const payload = normalizePublicFunDecksPayload(await dependencies.loadFunDecks());
      moderatePublicPayload(payload, dependencies);
      const archetypeLabel = await dependencies.loadArchetypeLabels?.().catch(error => {
        dependencies.onError?.(error);
        return null;
      });
      if (archetypeLabel) {
        payload.decks = payload.decks.map(deck => (
          deck.nearestArchetype ? { ...deck, nearestArchetypeLabel: archetypeLabel(deck.nearestArchetype) } : deck
        ));
      }
      if (withCards) payload.decks = await withCards(payload.decks);
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

/** Every deck with its decision, and the hidden ones listed from their snapshots; unreadable moderation leaves the dataset as is. */
function moderateAdminPayload(payload: FunDecksPayload, dependencies: AdminFunDecksDependencies): FunDecksPayload {
  if (!dependencies.getDatabase) return payload;
  let records: FunDeckModerationRecord[];
  try {
    records = listFunDeckModeration(dependencies.getDatabase());
  } catch (error) {
    dependencies.onError?.(error);
    return payload;
  }
  return {
    ...payload,
    decks: applyFunDeckModeration(payload.decks, records, true),
    hidden: records.filter(record => record.action === 'hide').map(({ format, deckCode, snapshot, note, updatedBy, updatedAt }) => (
      { format, deckCode, deck: snapshot, note, updatedBy, updatedAt })),
  };
}

export function createAdminFunDecksRouter(dependencies: AdminFunDecksDependencies): Router {
  const router = Router();
  router.use('/admin/fun-decks', dependencies.adminGuard, (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  });

  if (dependencies.getDatabase && dependencies.adminAuth) {
    router.use(createAdminFunDeckModerationRouter({
      ...dependencies,
      getDatabase: dependencies.getDatabase,
      adminAuth: dependencies.adminAuth,
      loadDecks: async () => normalizeFunDecksPayload(await dependencies.loadFunDecks()).decks,
    }));
  }

  router.get('/admin/fun-decks', async (_request, response) => {
    try {
      const payload = normalizeFunDecksPayload(await dependencies.loadFunDecks());
      return response.json(moderateAdminPayload(payload, dependencies));
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
