import { createMetaSliceCache } from './metaSliceCache.js';

type Format = 'standard' | 'wild';

/** Card-stats ranks of HSGuru (`/v1/hsguru/mulligan`); `bronze_plat` has no planned pages. */
export const HSGURU_STAT_RANKS = ['all', 'diamond_4to1', 'diamond_to_legend', 'legend', 'top_5k', 'top_legend'] as const;
export const HSGURU_STAT_COINS = ['any_player', 'going_first', 'on_coin'] as const;
export const HSGURU_OPPONENT_CLASSES = ['any', 'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR'] as const;
/** HSGuru's own default threshold of the card-stats page: rows below it are cards outside the list. */
export const HSGURU_MIN_CARD_SAMPLE = 25;

export type HsguruStatRank = (typeof HSGURU_STAT_RANKS)[number];
export type HsguruStatCoin = (typeof HSGURU_STAT_COINS)[number];
export type HsguruOpponentClass = (typeof HSGURU_OPPONENT_CLASSES)[number];
export type HsguruStatSlice = { rank: HsguruStatRank; period: string; coin: HsguruStatCoin; opponentClass: HsguruOpponentClass };

export type HsguruCardRow = {
  cardId: string | null; dbfId: number | null; cardName: string;
  mulliganImpact: number | null; mulliganCount: number;
  drawnImpact: number | null; drawnCount: number | null;
  notDrawnImpact: number | null; notDrawnCount: number | null;
  keptImpact: number | null; keptCount: number | null;
};
export type HsguruClassMatchupRow = { classKey: string; winrate: number; games: number; share: number | null };
export type HsguruStatPage<Row> = HsguruStatSlice & {
  games: number | null; winrate: number | null; changedAt: string | null; checkedAt: string | null;
  stale: boolean; sourceUrl: string; rows: Row[];
};
/** One stored page of the archetype: what the slice filters can open. */
export type HsguruSliceEntry = HsguruStatSlice & { kind: 'cards' | 'matchups'; games: number | null; checkedAt: string | null };
export type HsguruCoverage = { collected: number; planned: number };
export type ArchetypeHsguruStats<Card = HsguruCardRow> = {
  slice: HsguruStatSlice;
  mulligan: HsguruStatPage<Card> | null;
  classMatchups: HsguruStatPage<HsguruClassMatchupRow> | null;
  slices: HsguruSliceEntry[];
  coverage: HsguruCoverage | null;
};

const PERIOD = /^(?:current|[a-z][a-z0-9_]{2,40}|patch_\d+(?:\.\d+){1,3})$/;
// Default slice: the freshest whole-window data first, Legend before wider ranks.
const RANK_PREFERENCE: readonly HsguruStatRank[] = ['legend', 'diamond_to_legend', 'all', 'top_5k', 'diamond_4to1', 'top_legend'];

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * The slice a request names, or `null` for a malformed one. Missing fields take
 * HSGuru's defaults; `period: current` is the source's current meta window.
 */
export function readHsguruStatSlice(query: Record<string, unknown>): HsguruStatSlice | null {
  const rank = query.rank ?? 'legend';
  const period = query.period ?? 'current';
  const coin = query.coin ?? 'any_player';
  const opponentClass = query.opponent ?? 'any';
  if (!includes(HSGURU_STAT_RANKS, rank) || !includes(HSGURU_STAT_COINS, coin)
    || !includes(HSGURU_OPPONENT_CLASSES, opponentClass) || typeof period !== 'string' || !PERIOD.test(period)) return null;
  return { rank, period, coin, opponentClass };
}

function periodScore(period: string): number {
  if (period.endsWith('_ban')) return 0;
  if (!period.startsWith('past_') && !period.startsWith('patch_')) return 1;
  return period === 'past_week' ? 2 : period.startsWith('past_') ? 3 : 4;
}

/** The collected card slice a page opens on when the request names none: Bans window, Legend, any coin and class. */
export function pickDefaultHsguruSlice(slices: readonly HsguruSliceEntry[]): HsguruStatSlice | null {
  const candidates = slices.filter(slice => slice.kind === 'cards' && slice.coin === 'any_player' && slice.opponentClass === 'any');
  candidates.sort((left, right) => periodScore(left.period) - periodScore(right.period)
    || RANK_PREFERENCE.indexOf(left.rank) - RANK_PREFERENCE.indexOf(right.rank));
  const best = candidates[0];
  return best ? { rank: best.rank, period: best.period, coin: best.coin, opponentClass: best.opponentClass } : null;
}

function readPage<Row>(data: Record<string, unknown>, rows: Row[]): HsguruStatPage<Row> | null {
  const rank = data.rank;
  const coin = data.coin;
  const opponentClass = data.opponent_class ?? 'any';
  const period = text(data.period);
  if (!includes(HSGURU_STAT_RANKS, rank) || !includes(HSGURU_STAT_COINS, coin)
    || !includes(HSGURU_OPPONENT_CLASSES, opponentClass) || !period) return null;
  return {
    rank, period, coin, opponentClass,
    games: finite(data.games), winrate: finite(data.winrate),
    changedAt: text(data.changed_at), checkedAt: text(data.checked_at),
    stale: data.stale === true, sourceUrl: text(data.source_url) ?? '', rows,
  };
}

/** Cards outside HSGuru's default sample (25 mulligans and 25 draws) are tech picks of other lists, not the archetype. */
export function normalizeHsguruCards(rows: unknown): HsguruCardRow[] {
  return (Array.isArray(rows) ? rows as Record<string, unknown>[] : []).flatMap(row => {
    const mulliganCount = finite(row.mulligan_count);
    const drawnCount = finite(row.drawn_count);
    const cardName = text(row.card_name)?.trim();
    if (!cardName || mulliganCount === null || mulliganCount < HSGURU_MIN_CARD_SAMPLE
      || (drawnCount ?? 0) < HSGURU_MIN_CARD_SAMPLE) return [];
    return [{
      cardId: text(row.card_id), dbfId: finite(row.dbf_id), cardName,
      mulliganImpact: finite(row.mulligan_impact), mulliganCount,
      drawnImpact: finite(row.drawn_impact), drawnCount,
      notDrawnImpact: finite(row.not_drawn_impact), notDrawnCount: finite(row.not_drawn_count),
      keptImpact: finite(row.kept_impact), keptCount: finite(row.kept_count),
    }];
  });
}

function normalizeMatchups(rows: unknown): HsguruClassMatchupRow[] {
  return (Array.isArray(rows) ? rows as Record<string, unknown>[] : []).flatMap(row => {
    const classKey = text(row.opponent_class)?.toLowerCase();
    const winrate = finite(row.winrate);
    const games = finite(row.games);
    return classKey && winrate !== null && games !== null ? [{ classKey, winrate, games, share: finite(row.share_pct) }] : [];
  });
}

function normalizeSlices(rows: unknown): HsguruSliceEntry[] {
  return (Array.isArray(rows) ? rows as Record<string, unknown>[] : []).flatMap(row => {
    const kind = row.kind;
    const page = readPage(row, []);
    // Pages that fell out of the plan stay readable but are not offered as filters.
    if ((kind !== 'cards' && kind !== 'matchups') || !page || row.state !== 'ok' || row.active === 0) return [];
    return [{ kind, rank: page.rank, period: page.period, coin: page.coin, opponentClass: page.opponentClass,
      games: finite(row.last_games), checkedAt: text(row.last_success_at) }];
  });
}

function readCoverage(payload: unknown): HsguruCoverage | null {
  const rows = (payload as { data?: { coverage?: unknown } } | null)?.data?.coverage;
  if (!Array.isArray(rows)) return null;
  return (rows as Record<string, unknown>[]).reduce<HsguruCoverage>((total, row) => {
    if (row.active === 0) return total;
    return { collected: total.collected + (finite(row.with_data) ?? 0), planned: total.planned + (finite(row.targets) ?? 0) };
  }, { collected: 0, planned: 0 });
}

export type HsguruStatsReaderOptions = {
  /** GET a hs-data-api path (`v1/hsguru/...`). */
  request: (path: string) => Promise<Response>;
  ttlMs?: number;
  now?: () => number;
};

const MAX_CACHE_ENTRIES = 4_000;

/**
 * Reads HSGuru mulligan, class matchups, stored slices and pipeline coverage
 * of one archetype (docs/specs/archetype-hsguru-stats.md). A slice the source
 * has not collected answers 404 there; it is `null` here and is cached like
 * data, so the empty state does not poll the source.
 */
export function createHsguruStatsReader({ request, ttlMs = 10 * 60_000, now = Date.now }: HsguruStatsReaderOptions) {
  const cache = createMetaSliceCache<unknown>({ ttlMs, staleMs: ttlMs, now, timeoutMs: 15_000 });

  async function getJson(path: string): Promise<unknown> {
    if (cache.stats().entries > MAX_CACHE_ENTRIES) cache.clear();
    return cache.load(path, async () => {
      const response = await request(path);
      if (response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Upstream HTTP ${response.status}`); }
      return response.json();
    });
  }

  function sliceQuery(subject: Record<string, string>, slice: HsguruStatSlice, withOpponent: boolean): string {
    const query = new URLSearchParams({ ...subject, rank: slice.rank, period: slice.period, coin: slice.coin });
    if (withOpponent) query.set('opponent_class', slice.opponentClass);
    return query.toString();
  }

  async function readCards(subject: Record<string, string>, slice: HsguruStatSlice) {
    const payload = await getJson(`v1/hsguru/mulligan?${sliceQuery(subject, slice, true)}`) as { data?: Record<string, unknown> } | null;
    return payload?.data ? readPage(payload.data, normalizeHsguruCards(payload.data.rows)) : null;
  }

  async function readMatchups(subject: Record<string, string>, slice: HsguruStatSlice) {
    const payload = await getJson(`v1/hsguru/class-matchups?${sliceQuery(subject, slice, false)}`) as { data?: Record<string, unknown> } | null;
    return payload?.data ? readPage(payload.data, normalizeMatchups(payload.data.rows)) : null;
  }

  return {
    /**
     * The slice's card stats and class matchups (matchups ignore the opponent
     * class), plus the stored slices and the global collection progress. With
     * `slice: null` it opens the best collected card slice. Only a failed card
     * read fails the whole answer.
     */
    async read(format: Format, archetype: string, requested: HsguruStatSlice | null): Promise<ArchetypeHsguruStats> {
      const subject = { archetype, format };
      const [slices, coverage] = await Promise.all([
        getJson(`v1/hsguru/mulligan/slices?${new URLSearchParams(subject)}`).then(payload => normalizeSlices((payload as { data?: unknown } | null)?.data)).catch(() => []),
        getJson('v1/hsguru/mulligan/coverage?runs=1').then(readCoverage).catch(() => null),
      ]);
      const slice = requested ?? pickDefaultHsguruSlice(slices)
        ?? { rank: 'legend', period: 'current', coin: 'any_player', opponentClass: 'any' };
      const [mulligan, classMatchups] = await Promise.all([
        readCards(subject, slice),
        readMatchups(subject, slice).catch(() => null),
      ]);
      return { slice, mulligan, classMatchups, slices, coverage };
    },
    clear: () => cache.clear(),
  };
}
