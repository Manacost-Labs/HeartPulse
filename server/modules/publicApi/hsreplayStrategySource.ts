import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  hsReplayStrategyDataStatus,
  normalizeHsReplayStrategyMetadata,
} from './hsreplayStrategyFreshness.js';
export {
  hsReplayStrategyDataStatus,
  normalizeHsReplayStrategyMetadata,
  type HsReplayStrategyFreshnessStatus,
  type HsReplayStrategyMetadata,
  type HsReplayStrategyPublication,
  type HsReplayStrategyUpstreamFreshness,
} from './hsreplayStrategyFreshness.js';

const HSREPLAY_COMPS_DATASET_URL = 'https://api.kolodahearthstone.com/datasets/hsreplay_battlegrounds_comps';
const CACHE_TTL_MS = 5 * 60_000;
const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tier(value: unknown): typeof TIERS[number] | null {
  const normalized = text(value)?.toUpperCase();
  return TIERS.includes(normalized as typeof TIERS[number])
    ? normalized as typeof TIERS[number]
    : null;
}

function difficulty(value: unknown): string | null {
  const normalized = text(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === 'easy') return 'Легкая';
  if (normalized === 'medium' || normalized === 'moderate') return 'Средняя';
  if (normalized === 'hard' || normalized === 'difficult') return 'Сложная';
  return text(value);
}

function cardImage(cardId: string, kind: 'framed' | 'cards'): string {
  return `https://api.kolodahearthstone.com/uploads/${kind}/${encodeURIComponent(cardId)}.png`;
}

function normalizeCard(value: unknown, role: 'CORE' | 'ADDON'): JsonRecord | null {
  const source = record(value);
  const id = text(source.card_id ?? source.id);
  if (!id || !/^[A-Za-z0-9_#-]+$/.test(id)) return null;
  const image = text(source.image_url);
  return {
    id,
    dbfId: number(source.dbfId ?? source.dbf_id),
    name: text(source.name) ?? id,
    ruName: text(source.ruName ?? source.localizedName) ?? text(source.name) ?? id,
    role,
    frame: cardImage(id, 'framed'),
    card: cardImage(id, 'cards'),
    fallback: image,
    image256: image,
  };
}

function normalizeCards(value: unknown, role: 'CORE' | 'ADDON'): JsonRecord[] {
  return Array.isArray(value)
    ? value.map(item => normalizeCard(item, role)).filter((item): item is JsonRecord => Boolean(item))
    : [];
}

function normalizeStrategy(value: unknown): { tier: typeof TIERS[number]; row: JsonRecord } | null {
  const source = record(value);
  const strategyTier = tier(source.tier);
  const id = text(source.id) ?? (number(source.comp_id) !== null ? `hsreplay-${number(source.comp_id)}` : null);
  if (!strategyTier || !id) return null;
  const coreCards = normalizeCards(source.core_cards ?? source.main_cards, 'CORE');
  const additionalCards = normalizeCards(source.additional_cards ?? source.addon_cards, 'ADDON');
  const cards = [...coreCards, ...additionalCards];
  return {
    tier: strategyTier,
    row: {
      key: id,
      source: 'HSReplay',
      sourceKey: 'hsreplay',
      title: text(source.strategy_title ?? source.title ?? source.name) ?? id,
      description: text(source.description),
      difficulty: difficulty(source.difficulty),
      archetype: text(source.name),
      avgPlacement: number(source.avg_placement ?? source.avgPlacement),
      games: number(source.games ?? source.total_games),
      firstPlace: number(source.first_place ?? source.firstPlace),
      popularity: number(source.popularity ?? source.pick_rate ?? source.pickRate),
      url: text(source.url),
      lastUpdated: text(source.last_updated),
      coreCards,
      additionalCards,
      cards,
    },
  };
}

/** Converts the published parser dataset into the legacy strategy response consumed by HearthPulse. */
export function normalizeHsReplayStrategyPayload(payload: unknown): JsonRecord {
  const root = record(payload);
  const data = record(root.data);
  const structured = record(data.structured ?? root.structured);
  const metadata = normalizeHsReplayStrategyMetadata(root);
  const normalized = (Array.isArray(structured.comps) ? structured.comps : [])
    .map(normalizeStrategy)
    .filter((item): item is { tier: typeof TIERS[number]; row: JsonRecord } => Boolean(item));
  const tiers: Record<string, JsonRecord[]> = Object.fromEntries(TIERS.map(value => [value, []]));
  for (const item of normalized) tiers[item.tier].push(item.row);
  const fetchedAt = text(root.fetched_at ?? data.fetched_at)
    ?? normalized.map(item => text(item.row.lastUpdated)).filter(Boolean).sort().at(-1)
    ?? null;
  const tierCounts = Object.fromEntries(TIERS.map(value => [value, tiers[value].length]));
  const dataStatus = hsReplayStrategyDataStatus(fetchedAt, metadata);
  return {
    list: 'strategies',
    label: 'Тир-лист стратегий',
    source: 'hsreplay',
    upstreamSource: 'HSReplay comps через api.kolodahearthstone.com',
    fetchedAt,
    generatedAt: new Date().toISOString(),
    tier: null,
    availableTiers: TIERS.filter(value => tiers[value].length),
    count: normalized.length,
    tiers,
    tierCounts,
    dataStatus,
    cacheSource: dataStatus === 'fresh' ? 'fresh' : 'LKG',
    ...(metadata?.publication ? { publication: metadata.publication } : {}),
    ...(metadata?.upstreamFreshness ? { upstreamFreshness: metadata.upstreamFreshness } : {}),
  };
}

export async function fetchHsReplayStrategyPayload(): Promise<JsonRecord> {
  const response = await fetch(HSREPLAY_COMPS_DATASET_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'HeartPulse/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HSReplay comps dataset returned HTTP ${response.status}`);
  return normalizeHsReplayStrategyPayload(await response.json());
}

let cachedPayload: { value: JsonRecord; expiresAt: number } | null = null;

async function fetchCachedHsReplayStrategyPayload(): Promise<JsonRecord> {
  if (cachedPayload && cachedPayload.expiresAt > Date.now()) return cachedPayload.value;
  const value = await fetchHsReplayStrategyPayload();
  cachedPayload = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Serves the authenticated UI route without the stale legacy 3107 hop. */
export async function proxyHsReplayStrategyPayload(_request: Request, response: Response): Promise<void> {
  try {
    const payload = await fetchCachedHsReplayStrategyPayload();
    const etag = `"bg-hsreplay-${createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}"`;
    response.set('Cache-Control', response.locals.subscriptionGuarded ? 'private, no-store, max-age=0, must-revalidate' : `public, max-age=${CACHE_TTL_MS / 1000}`);
    response.set('ETag', etag);
    if (_request.headers['if-none-match'] === etag) {
      response.status(304).end();
      return;
    }
    response.json(payload);
  } catch (error) {
    console.error('[bg hsreplay strategy proxy] failed:', error instanceof Error ? error.message : error);
    response.status(502).json({ error: 'HSReplay strategy dataset unavailable' });
  }
}
