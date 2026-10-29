import { decodeDeckDefinition } from './deckBuilderResolve.js';
import { funDeckWhy } from './funDeckWhy.js';

export type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  /** Russian name of `nearestArchetype`; only the public selection carries it. */
  nearestArchetypeLabel: string | null;
  winRate: number | null;
  /** 95% interval of `winRate`, in percent; `null` for a dataset that predates concept-v7. */
  winRateCiLow: number | null;
  winRateCiHigh: number | null;
  /** Near-identical lists this deck absorbed. */
  variants: number | null;
  sourceTitle: string | null;
  games: number | null;
  reasons: string[];
  /** Russian reasons the deck is fun, most interesting first, and the filter tags it carries (see `funDeckWhy`). */
  why: string[];
  tags: string[];
  url: string | null;
  candidateSourceId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  render?: {
    imageUrl: string;
    previewImageUrl: string;
  };
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A percentage between 0 and 100, or `null`. */
function percentOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function countOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** The interval is kept whole or not at all: one bound alone, or bounds out of order, say nothing. */
function winRateInterval(low: unknown, high: unknown): { low: number | null; high: number | null } {
  const ci = { low: percentOrNull(low), high: percentOrNull(high) };
  return ci.low !== null && ci.high !== null && ci.low <= ci.high ? ci : { low: null, high: null };
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

/** One row of the `hsguru_fun_decks` dataset as the page's deck. */
export function normalizeFunDeckRow(row: unknown): FunDeckRow {
  const item = asRecord(row);
  const deckCode = text(item.deck_code);
  const recordStats = statsFromRecord(item.record);
  const interval = winRateInterval(item.win_rate_ci_low, item.win_rate_ci_high);
  const reasons = stringList(item.reasons);
  return {
    title: text(item.title) || 'Без названия',
    deckCode,
    format: text(item.format) || '—',
    className: text(item.class) || classFromDeckCode(deckCode) || '—',
    streamer: text(item.streamer) || null,
    funScore: numberOrNull(item.fun_score),
    maxMetaSimilarity: numberOrNull(item.max_meta_similarity),
    nearestArchetype: text(item.nearest_archetype) || null,
    nearestArchetypeLabel: null,
    winRate: numberOrNull(item.win_rate) ?? recordStats?.winRate ?? null,
    winRateCiLow: interval.low,
    winRateCiHigh: interval.high,
    variants: countOrNull(item.variants),
    sourceTitle: text(item.source_title) || null,
    games: numberOrNull(item.games) ?? recordStats?.games ?? null,
    reasons,
    ...funDeckWhy(reasons),
    url: text(item.url) || null,
    candidateSourceId: text(item.candidate_source_id) || null,
    firstSeenAt: text(item.first_seen_at) || null,
    lastSeenAt: text(item.last_seen_at) || null,
  };
}
