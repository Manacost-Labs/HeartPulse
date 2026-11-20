import { createHash } from 'node:crypto';
import { Router } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import { BATTLEGROUND_LIBRARY_EXTRA_KINDS, canonicalBattlegroundCardSlug } from './modules/battlegroundLibrary/public.js';
import type { PublicBattlegroundLibraryCard } from './battlegroundLibraryCardTypes.js';
import { LIBRARY_STATS_MMR, type LibraryStatsStore, type PublicLibraryStatsSlice } from './battlegroundLibraryOpenStats.js';

/** The listings of the current pool, by the path segment of `/library/<kind>/`. */
export const LIBRARY_LISTING_KINDS = [
  'minions', 'spells', 'anomalies', 'dark-gifts', 'quests', 'rewards', 'darkmoon-prizes', 'trinkets', 'timewarped',
] as const;
export type LibraryListingKind = typeof LIBRARY_LISTING_KINDS[number];

/** One card of a listing: identity, tavern tier, type, tribe, attack/health, the facts of its tile and, for a minion, the open statistics. No picture URL: the tile builds it from `cardId`. */
export type PublicLibraryListingItem = {
  dbfId: number;
  name: string;
  path: string;
  tavernTier: number | null;
  typeName: string;
  /** Tribe of a minion, the group of a trinket; `null` for the other kinds. */
  group: string | null;
  attack: number | null;
  health: number | null;
  stats?: { avgPlacementWith: number; popularity: number | null; gamesWith: number };
  /** The tile facts, each only when known: catalog id (it names the pictures), English name, golden picture under the
   * catalog's `/uploads/`, a Darkmoon prize's rating, the Duos-only mark and the mechanics the card page names. */
  cardId?: string; nameEn?: string; golden?: string; tier?: string; duosOnly?: true; mechanics?: string[];
};

export type PublicLibraryListing = {
  kind: LibraryListingKind;
  total: number;
  /** The base statistics slice behind `stats` of the items; `null` for a kind without statistics. */
  slice: { mmr: typeof LIBRARY_STATS_MMR; source: 'HSReplay'; updatedAt: string | null } | null;
  items: PublicLibraryListingItem[];
  warning?: 'stale';
};

export type LibraryListingDependencies = {
  /** The cards of one base kind of both pools, as the card router reads them (the pool is judged here). */
  loadBaseCards: (kind: 'minion' | 'spell') => Promise<PublicBattlegroundLibraryCard[]>;
  stats: LibraryStatsStore;
  fetchImpl?: typeof fetch;
  apiBaseUrl: string;
  now?: () => number;
  onError?: (error: unknown) => void;
  retryAfterSeconds?: number;
};

const CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=600';
const CACHE_MS = 300_000;
/** A listing built on stale statistics is held briefly, so recovery is picked up quickly. */
const DEGRADED_CACHE_MS = 30_000;
const DEGRADED_CACHE_HEADER = 'public, max-age=60, stale-while-revalidate=60';
const PAGE_SIZE = 100;
const MAX_PAGES = 6;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const plain = (value: unknown, maximum: number): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\[x\]/gi, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maximum) : null;
};
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? value : null;

const CARD_ID = /^[A-Za-z0-9_]{1,60}$/;
const UPLOAD = /^https:\/\/api\.kolodahearthstone\.com\/uploads\/([A-Za-z0-9_./-]{1,200}\.(?:png|webp|jpg))(?:\?|$)/;
/** Mechanic names (strings or `{ name_ru }`), as the card page states them; the listing search reads them. */
const mechanicNames = (value: unknown): string[] => (Array.isArray(value) ? value : [])
  .flatMap(entry => plain(typeof entry === 'string' ? entry : record(entry).name_ru, 60) ?? []).slice(0, 12);
/** The tile facts of a card, without the keys it does not have. */
function tileFacts(cardId: unknown, nameEn: unknown, golden: unknown, tier: unknown, duosOnly: unknown, mechanics: string[]): Partial<PublicLibraryListingItem> {
  const english = plain(nameEn, 180);
  const picture = typeof golden === 'string' ? UPLOAD.exec(golden)?.[1] : undefined;
  const rating = typeof tier === 'number' || typeof tier === 'string' ? plain(String(tier), 12) : null;
  return {
    ...(typeof cardId === 'string' && CARD_ID.test(cardId) ? { cardId } : {}), ...(english ? { nameEn: english } : {}),
    ...(picture && !picture.includes('..') ? { golden: picture } : {}), ...(rating ? { tier: rating } : {}), ...(duosOnly === true ? { duosOnly } : {}),
    ...(mechanics.length ? { mechanics } : {}),
  };
}

const compare = (left: PublicLibraryListingItem, right: PublicLibraryListingItem) =>
  (left.tavernTier ?? 99) - (right.tavernTier ?? 99)
  || left.name.localeCompare(right.name, 'ru') || left.dbfId - right.dbfId;

function baseItem(card: PublicBattlegroundLibraryCard, slice: PublicLibraryStatsSlice | null): PublicLibraryListingItem {
  const stats = card.kind === 'minion' ? slice?.byDbf.get(card.dbfId) : undefined;
  return {
    dbfId: card.dbfId, name: card.nameRu, typeName: card.typeName,
    path: `/library/${card.kind === 'minion' ? 'minions' : 'spells'}/${canonicalBattlegroundCardSlug(card.nameRu)}-${card.dbfId}/`,
    tavernTier: card.tavernTier, group: card.tribe, attack: card.attack, health: card.health,
    ...(stats ? { stats: { avgPlacementWith: stats.avgPlacementWith, popularity: stats.popularity, gamesWith: stats.gamesWith } } : {}),
    ...tileFacts(card.cardId, card.nameEn, card.images.golden, null, card.duosOnly, mechanicNames(card.mechanics)),
  };
}

function extraItem(raw: unknown, kind: Exclude<LibraryListingKind, 'minions' | 'spells'>): PublicLibraryListingItem | null {
  const spec = BATTLEGROUND_LIBRARY_EXTRA_KINDS[kind];
  const card = record(raw);
  const dbfId = card.dbf;
  const name = plain(record(card.name).ru ?? card.name, 180);
  if (typeof dbfId !== 'number' || !Number.isSafeInteger(dbfId) || dbfId <= 0 || !name) return null;
  return {
    dbfId, name, typeName: spec.typeName,
    path: `/library/${kind}/${canonicalBattlegroundCardSlug(name)}-${dbfId}/`,
    tavernTier: integer(card.tavern_tier), group: plain(record(card.group).name_ru ?? card.minion_type, 120),
    attack: integer(card.attack), health: integer(card.health),
    ...tileFacts(card.card_id, record(card.name).en, record(card.images).golden, record(card.tier).value ?? null, card.duos_only,
      mechanicNames(card.mechanics ?? record(card.wiki).wiki_mechanics_localized)),
  };
}

async function readExtra(kind: Exclude<LibraryListingKind, 'minions' | 'spells'>, fetchImpl: typeof fetch, base: URL): Promise<PublicLibraryListingItem[]> {
  const spec = BATTLEGROUND_LIBRARY_EXTRA_KINDS[kind];
  const items: PublicLibraryListingItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`${base.pathname.replace(/\/$/, '')}/${spec.endpoint}`, base.origin);
    url.searchParams.set('per_page', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    if (spec.archive) url.searchParams.set('in_pool', '1');
    const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' } });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Battleground ${kind} listing HTTP ${response.status}`); }
    const payload = record(await response.json());
    if (!Array.isArray(payload.data)) throw new Error(`Battleground ${kind} listing is invalid`);
    for (const raw of payload.data) {
      const item = extraItem(raw, kind);
      if (item) items.push(item);
    }
    if (record(payload.pagination).has_next !== true) break;
  }
  return items;
}

/**
 * `GET /api/bg/library/public/listing/:kind` (one listing of the current pool) and `GET /api/bg/library/public/listing`
 * (the size of every listing). The open fields only: name, identity, tier, type, tribe, attack/health and, for a minion,
 * the base statistics (average place, popularity, sample). Every listing has a store of its own that also is the last
 * known good copy: a failing source answers it with `warning: "stale"`, and no copy at all is a 503 with
 * `Retry-After`, never an empty list.
 */
export function createBattlegroundLibraryListingRouter(dependencies: LibraryListingDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const base = new URL(dependencies.apiBaseUrl);
  type Entry = { body: PublicLibraryListing; etag: string; expiresAt: number };
  const store = new Map<LibraryListingKind, Entry>();
  const inFlight = new Map<LibraryListingKind, Promise<Entry>>();
  const etagOf = (body: object) => `"${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}"`;

  async function build(kind: LibraryListingKind): Promise<PublicLibraryListing> {
    let items: PublicLibraryListingItem[];
    let slice: PublicLibraryStatsSlice | null = null;
    let stale = false;
    if (kind === 'minions' || kind === 'spells') {
      const cardKind = kind === 'minions' ? 'minion' : 'spell';
      const [cards, read] = await Promise.all([
        dependencies.loadBaseCards(cardKind),
        kind === 'minions' ? dependencies.stats.get() : Promise.resolve(null),
      ]);
      slice = read?.slice ?? null;
      stale = read?.stale ?? false;
      items = cards.filter(card => card.inPool).map(card => baseItem(card, slice));
    } else {
      items = await readExtra(kind, fetchImpl, base);
    }
    if (items.length === 0) throw new Error(`Battleground ${kind} listing is empty`);
    const seen = new Set<number>();
    items = items.filter(item => !seen.has(item.dbfId) && seen.add(item.dbfId)).sort(compare);
    return {
      kind, total: items.length,
      slice: slice ? { mmr: slice.mmr, source: slice.source, updatedAt: slice.updatedAt } : null,
      items, ...(stale ? { warning: 'stale' as const } : {}),
    };
  }

  const refresh = (kind: LibraryListingKind): Promise<Entry> => {
    const running = inFlight.get(kind);
    if (running) return running;
    const request = (async (): Promise<Entry> => {
      const body = await build(kind);
      const entry = { body, etag: etagOf(body), expiresAt: now() + (body.warning ? DEGRADED_CACHE_MS : CACHE_MS) };
      store.set(kind, entry);
      return entry;
    })().finally(() => inFlight.delete(kind));
    inFlight.set(kind, request);
    return request;
  };

  /** The live copy, a fresh read, or the last known good copy marked stale; rejects with no copy at all. */
  async function snapshot(kind: LibraryListingKind): Promise<{ body: PublicLibraryListing; etag: string; stale: boolean; fromMemory: boolean }> {
    const cached = store.get(kind);
    if (cached && cached.expiresAt > now()) return { body: cached.body, etag: cached.etag, stale: Boolean(cached.body.warning), fromMemory: true };
    try {
      const entry = await refresh(kind);
      return { body: entry.body, etag: entry.etag, stale: Boolean(entry.body.warning), fromMemory: false };
    } catch (error) {
      try { dependencies.onError?.(error); } catch { /* diagnostics are best-effort */ }
      if (!cached) throw error;
      const body = { ...cached.body, warning: 'stale' as const };
      return { body, etag: etagOf(body), stale: true, fromMemory: true };
    }
  }

  const unavailable = (response: import('express').Response, message: string) => {
    response.set('Cache-Control', 'no-store');
    response.set('Retry-After', String(dependencies.retryAfterSeconds ?? 60));
    return response.status(503).json({ error: message });
  };

  router.get('/api/bg/library/public/listing', async (request, response) => {
    response.set('X-Robots-Tag', 'noindex, nofollow');
    const results = await Promise.allSettled(LIBRARY_LISTING_KINDS.map(kind => snapshot(kind)));
    const kinds = results.flatMap((result, index) => result.status === 'fulfilled'
      ? [{ kind: LIBRARY_LISTING_KINDS[index], total: result.value.body.total }] : []);
    if (kinds.length === 0) return unavailable(response, 'Library listings temporarily unavailable');
    const complete = kinds.length === LIBRARY_LISTING_KINDS.length
      && results.every(result => result.status === 'fulfilled' && !result.value.stale);
    const body = { kinds };
    return sendDatasetJsonCached(request, response, body, etagOf(body),
      complete ? CACHE_HEADER : DEGRADED_CACHE_HEADER, 'memory');
  });

  router.get('/api/bg/library/public/listing/:kind', async (request, response) => {
    response.set('X-Robots-Tag', 'noindex, nofollow');
    const kind = request.params.kind as LibraryListingKind;
    if (!(LIBRARY_LISTING_KINDS as readonly string[]).includes(kind)) {
      response.set('Cache-Control', 'no-store');
      return response.status(404).json({ error: 'Library listing not found' });
    }
    try {
      const read = await snapshot(kind);
      return sendDatasetJsonCached(request, response, read.body, read.etag,
        read.stale ? DEGRADED_CACHE_HEADER : CACHE_HEADER, read.stale ? 'memory-stale' : read.fromMemory ? 'memory' : 'origin');
    } catch {
      return unavailable(response, 'Library listing temporarily unavailable');
    }
  });

  return router;
}
