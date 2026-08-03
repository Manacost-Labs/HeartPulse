import { Router, type RequestHandler, type Response } from 'express';
import { decodeDeckDefinition } from './deckBuilderResolve.js';

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
  render?: {
    imageUrl: string;
    previewImageUrl: string;
  };
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
  methodology: {
    detectorVersion: string | null;
    minFunScore: number;
    maxMetaSimilarity: number;
  };
  decks: FunDeckRow[];
};

export type PublicFunDecksDependencies = {
  loadFunDecks: () => Promise<unknown>;
  getPreview?: (deck: FunDeckRow) => FunDeckRow['render'] | null;
  schedulePreviews?: (decks: FunDeckRow[]) => void;
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

const HERO_CLASS_BY_DBF: Record<number, string> = {
  7: 'Warrior',
  31: 'Hunter',
  274: 'Druid',
  637: 'Mage',
  671: 'Paladin',
  813: 'Priest',
  893: 'Warlock',
  930: 'Rogue',
  1066: 'Shaman',
  56550: 'DemonHunter',
  78065: 'DeathKnight',
};

function classFromDeckCode(deckCode: string): string {
  const definition = decodeDeckDefinition(deckCode);
  const heroDbfId = Number(definition?.heroes?.[0]);
  return HERO_CLASS_BY_DBF[heroDbfId] || '';
}

function statsFromRecord(value: unknown): { games: number; winRate: number } | null {
  const match = text(value).match(/^(\d+)\s*[-–—:]\s*(\d+)$/);
  if (!match) return null;
  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const games = wins + losses;
  if (!Number.isSafeInteger(games) || games <= 0) return null;
  return {
    games,
    winRate: Math.round((wins / games) * 1_000) / 10,
  };
}

export function normalizeFunDecksPayload(raw: unknown): FunDecksPayload {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const structured = asRecord(data.structured);
  const rows = Array.isArray(structured.rows) ? structured.rows : [];
  const decks = rows.map((row): FunDeckRow => {
    const item = asRecord(row);
    const deckCode = text(item.deck_code);
    const recordStats = statsFromRecord(item.record);
    return {
      title: text(item.title) || 'Без названия',
      deckCode,
      format: text(item.format) || '—',
      className: text(item.class) || classFromDeckCode(deckCode) || '—',
      streamer: text(item.streamer) || null,
      funScore: numberOrNull(item.fun_score),
      maxMetaSimilarity: numberOrNull(item.max_meta_similarity),
      nearestArchetype: text(item.nearest_archetype) || null,
      winRate: numberOrNull(item.win_rate) ?? recordStats?.winRate ?? null,
      games: numberOrNull(item.games) ?? recordStats?.games ?? null,
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
