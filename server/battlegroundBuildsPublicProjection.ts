import { createHash } from 'node:crypto';
import { publicResourceUrl } from '../shared/publicResourceUrl.js';

/**
 * The open slice of the Battlegrounds builds (compositions and strategies) for
 * anonymous visitors: tier, name, conditions, key minions and the base-range
 * average place and popularity. Every field is copied by name (an allowlist):
 * sample sizes, first-place and top-four shares, confidence intervals, other
 * rating ranges, trinkets and the fork analysis never reach the guest, nor does
 * any field the source adds later.
 */
export const PUBLIC_BUILD_LISTS = ['compositions', 'strategies'] as const;
export type PublicBuildList = typeof PUBLIC_BUILD_LISTS[number];
/** The source of each open list is named here and nowhere else; the caller cannot pick one. */
export const PUBLIC_BUILD_SOURCES: Record<PublicBuildList, 'hsreplay' | 'firestone'> = {
  compositions: 'hsreplay',
  strategies: 'firestone',
};
export const PUBLIC_BUILD_TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type PublicBuildTier = typeof PUBLIC_BUILD_TIERS[number];
const MAX_BUILDS = 60;
const MAX_CORE_CARDS = 6;
const MAX_ADDITIONAL_CARDS = 8;

export type PublicBuildCard = {
  dbfId: number;
  cardId: string;
  name: string;
  /** Same-origin `/api/public-resource/...` path, or null. */
  image: string | null;
};

export type PublicBuild = {
  key: string;
  tier: PublicBuildTier;
  title: string;
  /** The conditions for going into the build, as the source words them. */
  description: string | null;
  difficulty: string | null;
  archetype: string | null;
  /** Base rating range only; null when the source has none. */
  avgPlacement: number | null;
  popularity: number | null;
  coreCards: PublicBuildCard[];
  additionalCards: PublicBuildCard[];
};

export type PublicBattlegroundBuilds = {
  list: PublicBuildList;
  updatedAt: string | null;
  source: string;
  warning?: 'stale' | 'fallback';
  builds: PublicBuild[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function plain(value: unknown, maximum = 400): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

/** `"3.60"`, `3.6` and `"12,5%"` all read as numbers; anything else (an empty string too) is null. */
function figure(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*%?$/);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function projectCard(value: unknown): PublicBuildCard | null {
  const card = record(value);
  const cardId = plain(card.id, 100);
  const dbfId = Number(card.dbfId);
  const name = plain(card.ruName ?? card.localizedName ?? card.name, 120);
  if (!cardId || !/^[A-Za-z0-9_#-]+$/.test(cardId) || !Number.isSafeInteger(dbfId) || dbfId <= 0 || !name) return null;
  const image = [card.card, card.image256, card.fallback].map(publicResourceUrl).find(url => url.startsWith('/api/public-resource/'));
  return { dbfId, cardId, name, image: image ?? null };
}

function projectCards(value: unknown, maximum: number): PublicBuildCard[] {
  const seen = new Set<number>();
  const cards: PublicBuildCard[] = [];
  for (const item of list(value)) {
    const card = projectCard(item);
    if (!card || seen.has(card.dbfId)) continue;
    seen.add(card.dbfId);
    cards.push(card);
    if (cards.length === maximum) break;
  }
  return cards;
}

function projectBuild(value: unknown, tier: PublicBuildTier): PublicBuild | null {
  const build = record(value);
  const key = plain(build.key, 100);
  const title = plain(build.title, 160);
  const coreCards = projectCards(build.coreCards, MAX_CORE_CARDS);
  // A build with no name or no key minion has nothing to show.
  if (!key || !/^[A-Za-z0-9_.#-]+$/.test(key) || !title || !coreCards.length) return null;
  const avg = figure(build.avgPlacement);
  const popularity = figure(build.popularity);
  return {
    key,
    tier,
    title,
    description: plain(build.description),
    difficulty: plain(build.difficulty, 40),
    archetype: plain(build.archetype, 80),
    avgPlacement: avg !== null && avg >= 1 && avg <= 8 ? Number(avg.toFixed(2)) : null,
    popularity: popularity !== null && popularity >= 0 && popularity <= 100 ? Number(popularity.toFixed(1)) : null,
    coreCards,
    additionalCards: projectCards(build.additionalCards, MAX_ADDITIONAL_CARDS)
      .filter(card => !coreCards.some(core => core.dbfId === card.dbfId)),
  };
}

/** `null` when the source has no usable build: the caller must not answer 200 then. */
export function projectBattlegroundBuildsPublic(
  payload: unknown,
  buildList: PublicBuildList,
  warning?: 'stale' | 'fallback',
): PublicBattlegroundBuilds | null {
  const root = record(payload);
  if (root.error !== undefined || root.list !== 'strategies' || String(root.source).toLowerCase() !== PUBLIC_BUILD_SOURCES[buildList]) return null;
  const tiers = record(root.tiers);
  const seen = new Set<string>();
  const builds: PublicBuild[] = [];
  for (const tier of PUBLIC_BUILD_TIERS) {
    for (const row of list(tiers[tier])) {
      const build = projectBuild(row, tier);
      if (!build || seen.has(build.key)) continue;
      seen.add(build.key);
      builds.push(build);
    }
  }
  if (!builds.length) return null;
  const fetchedAt = typeof root.fetchedAt === 'string' ? root.fetchedAt : '';
  return {
    list: buildList,
    updatedAt: fetchedAt && Number.isFinite(Date.parse(fetchedAt)) ? new Date(fetchedAt).toISOString() : null,
    source: buildList === 'compositions' ? 'HSReplay' : 'Firestone',
    ...(warning ? { warning } : {}),
    builds: builds.slice(0, MAX_BUILDS),
  };
}

export function battlegroundBuildsPublicEtag(body: PublicBattlegroundBuilds): string {
  return `"bg-builds-public-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24)}"`;
}
