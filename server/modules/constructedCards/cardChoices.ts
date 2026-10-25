import { Router } from 'express';

/**
 * "What players pick" for cards with a choice (Discover, Adapt, Dredge, Choose One,
 * Excavate): HSReplay pick statistics and the full option pool from hs-data-api
 * `/v1/hsreplay/card-choices`. The upstream body is untrusted; only the fields the
 * card page renders are projected.
 */
export type CardChoiceFormat = 'standard' | 'wild';
export type CardChoiceRank = 'legend' | 'bronze_gold';
export type CardChoiceKind = 'discover' | 'adapt' | 'dredge' | 'choose_one' | 'excavate';

export const CARD_CHOICE_RANKS: readonly CardChoiceRank[] = ['legend', 'bronze_gold'];
const KINDS: readonly CardChoiceKind[] = ['discover', 'adapt', 'dredge', 'choose_one', 'excavate'];
const CARD_ID = /^[A-Za-z0-9_]{2,80}$/;
const MAX_POOL_CARDS = 600;

export type CardChoiceCard = {
  cardId: string;
  dbfId: number | null;
  name: string;
  cost: number | null;
  cardClass: string | null;
  rarity: string | null;
};
export type CardChoiceOption = CardChoiceCard & {
  popularity: number | null;
  winrate: number | null;
  lowSample: boolean;
  undervalued: boolean;
};
export type CardChoicePoolCard = CardChoiceCard & {
  hasStats: boolean;
  popularity: number | null;
  winrate: number | null;
};
export type CardChoicesPayload = {
  cardId: string;
  kind: CardChoiceKind;
  format: CardChoiceFormat;
  rank: CardChoiceRank;
  /** `ok`, `no_data`, `not_collected`, `not_tracked` or a pending/failed collection state. */
  state: string;
  tracked: boolean;
  checkedAt: string | null;
  asOf: string | null;
  stale: boolean;
  sourceUrl: string | null;
  options: CardChoiceOption[];
  pool: {
    resolved: boolean;
    /** `game_state` (the pool comes from the game) or `unparsed`. */
    reason: string | null;
    classDependent: boolean;
    total: number;
    cards: CardChoicePoolCard[];
    tiers: { tier: number; cards: CardChoiceCard[] }[];
  };
  available: { format: CardChoiceFormat; rank: CardChoiceRank }[];
};

type Record_ = Record<string, unknown>;

function record(value: unknown): Record_ {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record_ : {};
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readCard(value: unknown): CardChoiceCard | null {
  const row = record(value);
  const cardId = text(row.card_id);
  if (!cardId || !CARD_ID.test(cardId)) return null;
  const dbfId = finite(row.dbf_id);
  return {
    cardId,
    dbfId: dbfId !== null && Number.isSafeInteger(dbfId) ? dbfId : null,
    name: text(row.name_ru) ?? text(row.name) ?? cardId,
    cost: finite(row.cost),
    cardClass: text(row.card_class),
    rarity: text(row.rarity),
  };
}

function cards<T>(value: unknown, read: (item: unknown) => T | null, limit = MAX_POOL_CARDS): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value.slice(0, limit)) {
    const parsed = read(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function isFormat(value: unknown): value is CardChoiceFormat {
  return value === 'standard' || value === 'wild';
}

function isRank(value: unknown): value is CardChoiceRank {
  return typeof value === 'string' && (CARD_CHOICE_RANKS as readonly string[]).includes(value);
}

/** Projects one hs-data-api answer; `null` when it is not a card choice answer. */
export function projectCardChoices(body: unknown): CardChoicesPayload | null {
  const data = record(record(body).data);
  const card = record(data.card);
  const stats = record(data.stats);
  const pool = record(data.pool);
  const cardId = text(card.card_id);
  const kind = card.kind;
  if (!cardId || !CARD_ID.test(cardId) || !(KINDS as readonly unknown[]).includes(kind)) return null;
  if (!isFormat(data.format) || !isRank(data.rank)) return null;
  const sourceUrl = text(stats.source_url);
  return {
    cardId,
    kind: kind as CardChoiceKind,
    format: data.format,
    rank: data.rank,
    state: text(stats.state) ?? 'not_collected',
    tracked: stats.tracked === true,
    checkedAt: text(stats.checked_at),
    asOf: text(stats.as_of),
    stale: stats.stale === true,
    sourceUrl: sourceUrl && /^https:\/\/hsreplay\.net\//.test(sourceUrl) ? sourceUrl : null,
    options: cards(data.options, item => {
      const base = readCard(item);
      if (!base) return null;
      const row = record(item);
      return {
        ...base,
        popularity: finite(row.popularity),
        winrate: finite(row.win_rate),
        lowSample: row.low_sample === true,
        undervalued: row.undervalued === true,
      };
    }, 150),
    pool: {
      resolved: pool.resolved === true,
      reason: text(pool.reason),
      classDependent: pool.class_dependent === true,
      total: finite(pool.total) ?? 0,
      cards: cards(pool.cards, item => {
        const base = readCard(item);
        if (!base) return null;
        const row = record(item);
        return { ...base, hasStats: row.has_stats === true, popularity: finite(row.popularity), winrate: finite(row.win_rate) };
      }),
      tiers: Array.isArray(pool.tiers)
        ? pool.tiers.slice(0, 8).flatMap(item => {
          const tier = finite(record(item).tier);
          return tier === null ? [] : [{ tier, cards: cards(record(item).cards, readCard, 60) }];
        })
        : [],
    },
    available: Array.isArray(data.available)
      ? data.available.flatMap(item => {
        const row = record(item);
        return isFormat(row.format) && isRank(row.rank) ? [{ format: row.format, rank: row.rank }] : [];
      })
      : [],
  };
}

type CacheEntry = { at: number; status: number; body: CardChoicesPayload | null };

export type CardChoicesRouterDependencies = {
  /** GET a hs-data-api path such as `/v1/hsreplay/card-choices?...`. */
  request: (path: string) => Promise<globalThis.Response>;
  cacheMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const MAX_CACHE_ENTRIES = 2_000;

/** `GET /api/card-choices/:format/:cardId?rank=` — public, cached for ten minutes. */
export function createCardChoicesRouter(dependencies: CardChoicesRouterDependencies): Router {
  const cache = new Map<string, CacheEntry>();
  const cacheMs = dependencies.cacheMs ?? 10 * 60_000;
  const now = dependencies.now ?? Date.now;
  const router = Router({ caseSensitive: true });
  router.get('/card-choices/:format/:cardId', async (request, response) => {
    const { format, cardId } = request.params;
    const rank = request.query.rank ?? 'legend';
    if (!isFormat(format) || !CARD_ID.test(cardId) || !isRank(rank)) {
      response.set('Cache-Control', 'no-store');
      return response.status(404).json({ error: 'Card choices not found' });
    }
    const key = `${format}:${cardId}:${rank}`;
    const cached = cache.get(key);
    let entry = cached && now() - cached.at < cacheMs ? cached : null;
    if (!entry) {
      try {
        const query = new URLSearchParams({ card: cardId, format, rank });
        const upstream = await dependencies.request(`/v1/hsreplay/card-choices?${query}`);
        if (upstream.status === 404) entry = { at: now(), status: 404, body: null };
        else if (!upstream.ok) throw new Error(`hs-data-api answered ${upstream.status}`);
        else {
          const body = projectCardChoices(await upstream.json());
          if (!body) throw new Error('hs-data-api card choices contract mismatch');
          entry = { at: now(), status: 200, body };
        }
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(key, entry);
      } catch (error) {
        dependencies.onError?.(error);
        if (!cached) {
          response.set('Cache-Control', 'no-store');
          response.set('Retry-After', '30');
          return response.status(503).json({ error: 'Card choices temporarily unavailable' });
        }
        // A failed refresh keeps serving the last answer.
        entry = cached;
      }
    }
    response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    if (entry.status === 404 || !entry.body) return response.status(404).json({ error: 'Card choices not found' });
    return response.json(entry.body);
  });
  return router;
}
