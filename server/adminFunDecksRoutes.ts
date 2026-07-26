import { Router, type RequestHandler, type Response } from 'express';

export type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  winRate: number | null;
  games: number | null;
  reasons: string[];
  url: string | null;
  candidateSourceId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

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
  decks: FunDeckRow[];
};

export type PublicFunDecksDependencies = {
  loadFunDecks: () => Promise<unknown>;
  onError?: (error: unknown) => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item)).filter(Boolean);
}

export function normalizeFunDecksPayload(raw: unknown): FunDecksPayload {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const structured = asRecord(data.structured);
  const rows = Array.isArray(structured.rows) ? structured.rows : [];
  const decks = rows.map((row): FunDeckRow => {
    const item = asRecord(row);
    return {
      title: text(item.title) || 'Без названия',
      deckCode: text(item.deck_code),
      format: text(item.format) || '—',
      className: text(item.class) || '—',
      streamer: text(item.streamer) || null,
      funScore: numberOrNull(item.fun_score),
      maxMetaSimilarity: numberOrNull(item.max_meta_similarity),
      nearestArchetype: text(item.nearest_archetype) || null,
      winRate: numberOrNull(item.win_rate),
      games: numberOrNull(item.games),
      reasons: stringList(item.reasons),
      url: text(item.url) || null,
      candidateSourceId: text(item.candidate_source_id) || null,
      firstSeenAt: text(item.first_seen_at) || null,
      lastSeenAt: text(item.last_seen_at) || null,
    };
  }).filter(deck => deck.deckCode.length >= 20);

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
    decks: normalized.decks,
  };
}

export function createPublicFunDecksRouter(dependencies: PublicFunDecksDependencies): Router {
  const router = Router();

  router.get('/fun-decks', async (_request, response) => {
    try {
      response.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      return response.json(normalizePublicFunDecksPayload(await dependencies.loadFunDecks()));
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
