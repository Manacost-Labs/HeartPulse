import { Router } from 'express';

/**
 * «Сборка» (Assemble) statistics: bases, donors and the half of a donor players take,
 * from hs-data-api `/v1/hsreplay/assemble`. The upstream body is untrusted; only the
 * fields the card page renders are projected, in the shape the Russian site needs.
 */
export type CardAssembleFormat = 'standard' | 'wild';
export type AssembleHalf = 'effect' | 'trigger';

const CARD_ID = /^[A-Za-z0-9_]{2,80}$/;
const BASE_PARAM = /^(?:top|\d{1,12})$/;
const MAX_BASES = 300;
const MAX_DONORS = 200;
const MAX_TEXT = 400;

export type AssembleCard = {
  cardId: string;
  dbfId: number;
  name: string;
  cost: number | null;
  cardClass: string | null;
  rarity: string | null;
};
export type AssembleText = { trigger: string; effect: string; locale: 'ru' | 'en' };
export type AssembleOption = {
  /** The half of the DONOR; the other half comes from the base. */
  half: AssembleHalf;
  text: AssembleText | null;
  pickRate: number | null;
  winRate: number | null;
  picks: number | null;
  lowSample: boolean;
  undervalued: boolean;
};
export type AssembleDonor = {
  card: AssembleCard;
  offerRate: number | null;
  pickRate: number | null;
  winRate: number | null;
  picks: number | null;
  lowSample: boolean;
  options: AssembleOption[];
};
export type AssembleBase = {
  card: AssembleCard;
  offerRate: number | null;
  winRate: number | null;
  lowSample: boolean;
  donorsTotal: number;
  /** `null`: the donors of this base were not requested. */
  donors: AssembleDonor[] | null;
};
export type CardAssemblePayload = {
  cardId: string;
  format: CardAssembleFormat;
  /** `ok`, `no_data`, `not_collected` or `failed`. */
  state: string;
  checkedAt: string | null;
  asOf: string | null;
  stale: boolean;
  sourceUrl: string | null;
  timeRange: string;
  originalClassOnly: boolean;
  basesTotal: number;
  winRate: number | null;
  bases: AssembleBase[];
};

type Record_ = Record<string, unknown>;

function record(value: unknown): Record_ {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record_ : {};
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percent(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function shortText(value: unknown): string | null {
  const result = text(value);
  return result !== null && result.length <= MAX_TEXT ? result : null;
}

function isFormat(value: unknown): value is CardAssembleFormat {
  return value === 'standard' || value === 'wild';
}

function readCard(value: unknown): AssembleCard | null {
  const row = record(value);
  const cardId = text(row.card_id);
  const dbfId = finite(row.dbf_id);
  if (!cardId || !CARD_ID.test(cardId) || dbfId === null || !Number.isSafeInteger(dbfId)) return null;
  return {
    cardId,
    dbfId,
    name: text(row.name_ru) ?? text(row.name) ?? cardId,
    cost: finite(row.cost),
    cardClass: text(row.card_class),
    rarity: text(row.rarity),
  };
}

function readLocaleText(value: unknown, locale: 'ru' | 'en'): AssembleText | null {
  const row = record(value);
  const trigger = shortText(row.trigger);
  const effect = shortText(row.effect);
  return trigger && effect ? { trigger, effect, locale } : null;
}

function readOption(value: unknown): AssembleOption | null {
  const row = record(value);
  if (row.half !== 'effect' && row.half !== 'trigger') return null;
  const source = record(row.text);
  return {
    half: row.half,
    text: readLocaleText(source.ru, 'ru') ?? readLocaleText(source.en, 'en'),
    pickRate: percent(row.pick_rate),
    winRate: percent(row.win_rate),
    picks: count(row.picks),
    lowSample: row.low_sample === true,
    undervalued: row.undervalued === true,
  };
}

function readOptions(value: unknown): AssembleOption[] {
  const byHalf = new Map<AssembleHalf, AssembleOption>();
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 8)) {
      const option = readOption(item);
      if (option && !byHalf.has(option.half)) byHalf.set(option.half, option);
    }
  }
  return (['effect', 'trigger'] as const).flatMap(half => byHalf.get(half) ?? []);
}

function readDonor(value: unknown): AssembleDonor | null {
  const row = record(value);
  const card = readCard(row.card);
  if (!card) return null;
  return {
    card,
    offerRate: percent(row.offer_rate),
    pickRate: percent(row.pick_rate),
    winRate: percent(row.win_rate),
    picks: count(row.picks),
    lowSample: row.low_sample === true,
    options: readOptions(row.options),
  };
}

function readBase(value: unknown): AssembleBase | null {
  const row = record(value);
  const card = readCard(row.card);
  if (!card) return null;
  const donors = Array.isArray(row.donors)
    ? row.donors.slice(0, MAX_DONORS).flatMap(item => readDonor(item) ?? [])
    : null;
  return {
    card,
    offerRate: percent(row.offer_rate),
    winRate: percent(row.win_rate),
    lowSample: row.low_sample === true,
    donorsTotal: count(row.donors_total) ?? donors?.length ?? 0,
    donors,
  };
}

/** Projects one hs-data-api answer; `null` when it is not an Assemble answer. */
export function projectCardAssemble(body: unknown): CardAssemblePayload | null {
  const data = record(record(body).data);
  const card = readCard(data.card);
  if (!card || !isFormat(data.format) || !Array.isArray(data.bases)) return null;
  const stats = record(data.stats);
  const summary = record(data.summary);
  const sourceUrl = text(stats.source_url);
  const bases = data.bases.slice(0, MAX_BASES).flatMap(item => readBase(item) ?? []);
  return {
    cardId: card.cardId,
    format: data.format,
    state: text(stats.state) ?? 'not_collected',
    checkedAt: text(stats.checked_at),
    asOf: text(stats.as_of),
    stale: stats.stale === true,
    sourceUrl: sourceUrl && /^https:\/\/hsreplay\.net\//.test(sourceUrl) ? sourceUrl : null,
    timeRange: text(data.time_range) ?? 'LAST_7_DAYS',
    originalClassOnly: data.original_class_only === true,
    basesTotal: count(summary.bases_total) ?? bases.length,
    winRate: percent(summary.win_rate),
    bases,
  };
}

type CacheEntry = { at: number; status: number; body: CardAssemblePayload | null };

export type CardAssembleRouterDependencies = {
  /** GET a hs-data-api path such as `/v1/hsreplay/assemble?...`. */
  request: (path: string) => Promise<globalThis.Response>;
  cacheMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const MAX_CACHE_ENTRIES = 2_000;

/** `GET /api/card-assemble/:format/:cardId?base=<dbf|top>` — public, cached for ten minutes. */
export function createCardAssembleRouter(dependencies: CardAssembleRouterDependencies): Router {
  const cache = new Map<string, CacheEntry>();
  const cacheMs = dependencies.cacheMs ?? 10 * 60_000;
  const now = dependencies.now ?? Date.now;
  const router = Router({ caseSensitive: true });
  router.get('/card-assemble/:format/:cardId', async (request, response) => {
    const { format, cardId } = request.params;
    const base = request.query.base ?? 'top';
    if (!isFormat(format) || !CARD_ID.test(cardId) || typeof base !== 'string' || !BASE_PARAM.test(base)
      || (base !== 'top' && !Number.isSafeInteger(Number(base)))) {
      response.set('Cache-Control', 'no-store');
      return response.status(404).json({ error: 'Assemble statistics not found' });
    }
    const key = `${format}:${cardId}:${base}`;
    const cached = cache.get(key);
    let entry = cached && now() - cached.at < cacheMs ? cached : null;
    if (!entry) {
      try {
        const query = new URLSearchParams({ card: cardId, format, base });
        const upstream = await dependencies.request(`/v1/hsreplay/assemble?${query}`);
        if (upstream.status === 404) entry = { at: now(), status: 404, body: null };
        else if (!upstream.ok) throw new Error(`hs-data-api answered ${upstream.status}`);
        else {
          const body = projectCardAssemble(await upstream.json());
          if (!body) throw new Error('hs-data-api assemble contract mismatch');
          entry = { at: now(), status: 200, body };
        }
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(key, entry);
      } catch (error) {
        dependencies.onError?.(error);
        if (!cached) {
          response.set('Cache-Control', 'no-store');
          response.set('Retry-After', '30');
          return response.status(503).json({ error: 'Assemble statistics temporarily unavailable' });
        }
        // A failed refresh keeps serving the last answer.
        entry = cached;
      }
    }
    response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    if (entry.status === 404 || !entry.body) return response.status(404).json({ error: 'Assemble statistics not found' });
    return response.json(entry.body);
  });
  return router;
}
