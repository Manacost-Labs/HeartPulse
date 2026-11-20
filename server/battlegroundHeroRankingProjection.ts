import { createHash } from 'node:crypto';
import { publicResourceUrl } from '../shared/publicResourceUrl.js';
import { isPositiveDbfId } from './battlegroundHeroPublicRoutes.js';

/**
 * The open slice of the Battlegrounds hero ranking for anonymous visitors:
 * one rating range (`TOP_50_PERCENT`), the figures that answer "which hero is
 * good now". Every field is copied by name (an allowlist): the other ranges,
 * the full placement distribution, the anomaly-adjusted placement and any
 * field the source adds later never reach the guest.
 */
export const PUBLIC_HERO_RANKING_MODES = ['solo', 'duos'] as const;
export type PublicHeroRankingMode = typeof PUBLIC_HERO_RANKING_MODES[number];
export const PUBLIC_HERO_RANKING_MMR = 'TOP_50_PERCENT';
const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F']);

export type PublicBattlegroundHeroRankingEntry = {
  dbfId: number;
  cardId: string | null;
  name: string;
  /** Same-origin `/api/public-resource/...` path, or null. */
  image: string | null;
  tier: string;
  avgPlacement: number;
  /** Share of the first four places, percent to 0.1; null when the source gives no eight-place distribution (duos). */
  top4Rate: number | null;
  pickRate: number | null;
  /** Only when the source row itself carries a sample size. */
  games?: number;
  heroPowerName: string | null;
  /** Card text and same-origin image of the hero power: public card facts the ranking cards show. */
  heroPowerText: string | null;
  heroPowerImage: string | null;
  bestComposition: string | null;
  keyMinions: string[];
};

export type PublicBattlegroundHeroRanking = {
  mode: PublicHeroRankingMode;
  mmr: typeof PUBLIC_HERO_RANKING_MMR;
  updatedAt: string | null;
  source: string;
  warning?: 'stale';
  heroes: PublicBattlegroundHeroRankingEntry[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const round = (value: number, digits: number): number => Number(value.toFixed(digits));

function plain(value: unknown, maximum = 180): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

/** `"78.56%"`, `78.56` and `"4.66"` all read as numbers; anything else is null. */
function figure(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*%?$/);
  return match ? Number(match[1].replace(',', '.')) : null;
}

const cardName = (value: unknown): string | null => {
  const card = record(value);
  return plain(typeof value === 'string' ? value : card.name ?? record(card.card).name);
};

/** The card of a related card field (`{ dbf, card: {...} }` or the card itself). */
const relatedCard = (value: unknown): Record<string, unknown> => {
  const card = record(value);
  return Object.keys(record(card.card)).length ? record(card.card) : card;
};

function sameOriginImage(value: unknown): string | null {
  const image = publicResourceUrl(value);
  return image.startsWith('/api/public-resource/') ? image : null;
}

function projectEntry(value: unknown): PublicBattlegroundHeroRankingEntry | null {
  const hero = record(value);
  if (!isPositiveDbfId(hero.dbfId)) return null;
  const name = plain(hero.hero ?? hero.name);
  const tier = typeof hero.tier === 'string' ? hero.tier.trim().toUpperCase() : '';
  const avg = figure(hero.avg_placement);
  // A hero the source has not rated yet (no tier or place) has no rank to show.
  if (!name || !TIERS.has(tier) || avg === null || avg < 1 || avg > 8) return null;
  const distribution = list(hero.placement_distribution).map(figure);
  const eightPlaces = distribution.length === 8 && distribution.every((item): item is number => item !== null);
  const top4 = eightPlaces ? round((distribution as number[]).slice(0, 4).reduce((sum, item) => sum + item, 0), 1) : null;
  const pick = figure(hero.pick_rate ?? hero.pick_rate_value);
  const games = typeof hero.games === 'number' && Number.isInteger(hero.games) && hero.games > 0 ? hero.games : null;
  const image = publicResourceUrl(hero.image);
  const entry: PublicBattlegroundHeroRankingEntry = {
    dbfId: Number(hero.dbfId),
    cardId: plain(hero.id, 100),
    name,
    image: image.startsWith('/api/public-resource/') ? image : null,
    tier,
    avgPlacement: round(avg, 2),
    top4Rate: top4 !== null && top4 >= 0 && top4 <= 100.5 ? Math.min(top4, 100) : null,
    pickRate: pick !== null && pick >= 0 && pick <= 100 ? round(pick, 2) : null,
    heroPowerName: cardName(hero.hero_power),
    heroPowerText: plain(relatedCard(hero.hero_power).text, 400),
    heroPowerImage: sameOriginImage(relatedCard(hero.hero_power).image),
    bestComposition: cardName(hero.best_composition) ?? plain(record(hero.best_composition).composition),
    keyMinions: list(hero.key_minions_top3).map(cardName).filter((item): item is string => item !== null).slice(0, 3),
  };
  if (games !== null) entry.games = games;
  return entry;
}

/** `null` when the source has no ranked hero: the caller must not answer 200 then. */
export function projectBattlegroundHeroRanking(
  payload: unknown,
  mode: PublicHeroRankingMode,
  warning?: 'stale',
): PublicBattlegroundHeroRanking | null {
  const root = record(payload);
  if (root.ok === false) return null;
  const rows = Array.isArray(root.heroes) ? root.heroes : list(record(root.view).heroes);
  const seen = new Set<number>();
  const heroes: PublicBattlegroundHeroRankingEntry[] = [];
  for (const row of rows) {
    const entry = projectEntry(row);
    if (!entry || seen.has(entry.dbfId)) continue;
    seen.add(entry.dbfId);
    heroes.push(entry);
  }
  if (!heroes.length) return null;
  heroes.sort((a, b) => a.avgPlacement - b.avgPlacement || a.dbfId - b.dbfId);
  const fetchedAt = typeof root.fetched_at === 'string' ? root.fetched_at : '';
  return {
    mode,
    mmr: PUBLIC_HERO_RANKING_MMR,
    updatedAt: fetchedAt && Number.isFinite(Date.parse(fetchedAt)) ? new Date(fetchedAt).toISOString() : null,
    source: 'HSReplay',
    ...(warning ? { warning } : {}),
    heroes,
  };
}

export function battlegroundHeroRankingEtag(body: PublicBattlegroundHeroRanking): string {
  return `"bg-heroes-public-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24)}"`;
}
