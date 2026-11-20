import type { RequestHandler } from 'express';
import type { PublicViciousGold, PublicViciousGoldArchetype, PublicViciousGoldClass } from '../shared/viciousGoldPublicContract.js';

export type { PublicViciousGold };

type JsonRecord = Record<string, unknown>;

const SOURCE_URL = 'https://www.vicioussyndicate.com/data-reaper-live/';
const SOURCE_HOSTS = new Set(['www.vicioussyndicate.com', 'vicioussyndicate.com']);

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const rows = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.map(record) : []);

function text(value: unknown, maximum = 120): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
}

/** A vS window key (`lastDay`, `lastWeek`, …) or null. */
function windowKey(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,24}$/.test(value) ? value : null;
}

function sourceUrl(value: unknown): string {
  if (typeof value !== 'string') return SOURCE_URL;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && SOURCE_HOSTS.has(url.hostname) ? url.href : SOURCE_URL;
  } catch {
    return SOURCE_URL;
  }
}

function updatedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value.slice(0, 40) : null;
}

/** Code-point order: total and the same on every runtime, the last word when the Russian collation calls two names equal. */
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (a: string, b: string) => a.localeCompare(b, 'ru') || byCode(a, b);

/** vS rank brackets from the widest to the narrowest (hs-data-api `tier_list`); an unknown one goes last. */
const RANK_ORDER = ['All ranks', 'Legend', 'Diamond 1-4', 'Diamond 5-10', 'Platinum', 'Gold Silver Bronze'];
const rankPosition = (rankBracket: string) => {
  const index = RANK_ORDER.indexOf(rankBracket);
  return index === -1 ? RANK_ORDER.length : index;
};

const compareClass = (a: PublicViciousGoldClass, b: PublicViciousGoldClass) =>
  byName(a.classLabel, b.classLabel) || byCode(a.class, b.class) || byCode(a.classIcon, b.classIcon);

function projectClass(row: JsonRecord): PublicViciousGoldClass | null {
  const className = text(row.class, 40);
  const classLabel = text(row.classLabel, 60);
  const classIcon = text(row.classIcon, 40);
  return className && classLabel && /^[a-z-]+$/.test(classIcon) ? { class: className, classLabel, classIcon } : null;
}

/** The smallest candidate of each key: which duplicate wins depends on the values, never on the order they came in. */
function smallestByKey<T>(items: T[], key: (item: T) => string, compare: (a: T, b: T) => number): Map<string, T> {
  const kept = new Map<string, T>();
  for (const item of items) {
    const current = kept.get(key(item));
    if (!current || compare(item, current) < 0) kept.set(key(item), item);
  }
  return kept;
}

/**
 * Field-by-field allowlist of the report the paid route answers (`loadViciousGold`). Anything the report adds later
 * stays out of the guest's answer until it is named here. The order is a function of the open fields alone, total
 * and independent of the source's order (which is by share or by Power Tier): classes by name, then key; archetypes
 * by class, name, slug and deck; rank brackets from the widest to the narrowest. Duplicates resolve the same way.
 */
export function projectPublicViciousGold(payload: unknown): PublicViciousGold {
  const data = record(payload);
  const timeRanges = record(data.timeRanges);
  const deckRows = rows(data.deckDistribution).flatMap(row => {
    const owner = projectClass(row);
    const deck = text(row.deck);
    const slug = text(row.archetypeSlug, 160);
    return owner && deck ? [{ owner, deck, deckLabel: text(row.deckLabel) || deck, archetypeSlug: /^[a-z0-9-]+$/.test(slug) ? slug : null }] : [];
  });
  // A class the class list lacks is taken from its archetypes' rows.
  const listed = smallestByKey(rows(data.classDistribution).flatMap(row => projectClass(row) ?? []), item => item.class, compareClass);
  const fromDecks = smallestByKey(deckRows.map(row => row.owner), item => item.class, compareClass);
  const classes = [...listed.values(), ...[...fromDecks.values()].filter(item => !listed.has(item.class))].sort(compareClass);
  const classOf = new Map(classes.map((item, index) => [item.class, { item, index }]));
  const decks = smallestByKey(deckRows, row => row.deck, (a, b) => byName(a.deckLabel, b.deckLabel)
    || byCode(a.archetypeSlug ?? '', b.archetypeSlug ?? '') || compareClass(a.owner, b.owner));
  const archetypes = [...decks.values()].map((row): PublicViciousGoldArchetype & { position: number } => {
    const owner = classOf.get(row.owner.class) as { item: PublicViciousGoldClass; index: number };
    return { class: owner.item.class, classLabel: owner.item.classLabel, classIcon: owner.item.classIcon,
      deck: row.deck, deckLabel: row.deckLabel, archetypeSlug: row.archetypeSlug, position: owner.index };
  }).sort((a, b) => a.position - b.position || byName(a.deckLabel, b.deckLabel)
    || byCode(a.archetypeSlug ?? '', b.archetypeSlug ?? '') || byCode(a.deck, b.deck));
  const brackets = smallestByKey(rows(data.tierList).flatMap(section => {
    const rankBracket = text(section.rankBracket, 60);
    return rankBracket ? [{ rankBracket, rankLabel: text(section.rankLabel, 60) || rankBracket }] : [];
  }), item => item.rankBracket, (a, b) => byCode(a.rankLabel, b.rankLabel));
  return {
    title: 'Vicious Syndicate Gold',
    format: text(data.format, 40) || 'Standard',
    source: text(data.source, 80) || 'Vicious Syndicate Live',
    sourceUrl: sourceUrl(data.sourceUrl),
    updatedAt: updatedAt(data.updatedAt),
    timeRanges: {
      distribution: windowKey(timeRanges.distribution),
      tierLadder: windowKey(timeRanges.tierLadder),
      tierMatchups: windowKey(timeRanges.tierMatchups),
    },
    classes: classes.map(item => ({ class: item.class, classLabel: item.classLabel, classIcon: item.classIcon })),
    archetypes: archetypes.map(item => ({ class: item.class, classLabel: item.classLabel, classIcon: item.classIcon,
      deck: item.deck, deckLabel: item.deckLabel, archetypeSlug: item.archetypeSlug })),
    rankBrackets: [...brackets.values()]
      .sort((a, b) => rankPosition(a.rankBracket) - rankPosition(b.rankBracket) || byCode(a.rankBracket, b.rankBracket))
      .map(item => ({ rankBracket: item.rankBracket, rankLabel: item.rankLabel })),
  };
}

/**
 * `GET /api/vicious-syndicate-gold/public`: the open frame of the report, one answer for every viewer (no cookie is
 * read), so it may sit in a shared cache. The path ends in a `public` segment, so the scrape guard of open `/api/`
 * data budgets it. A source failure answers the last good frame (not to a prerender, which keeps its earlier page)
 * that no shared cache keeps; without one, a 503 that no cache keeps. Every answer varies on `X-Hearthpulse-Prerender`.
 */
export function createPublicViciousGoldHandler(dependencies: {
  loadViciousGold: () => Promise<unknown>;
  onError?: (scope: 'vicious-gold', error: unknown) => void;
}): RequestHandler {
  let lastGood: PublicViciousGold | null = null;
  return async (request, response) => {
    response.set('X-Content-Type-Options', 'nosniff');
    // The failure answer depends on this header (a prerender gets no stale copy): a cache keys on it.
    response.vary('X-Hearthpulse-Prerender');
    try {
      const body = projectPublicViciousGold(await dependencies.loadViciousGold());
      if (!body.archetypes.length) throw new Error('Vicious Syndicate Gold has no archetypes');
      lastGood = body;
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      return response.json(body);
    } catch (error) {
      dependencies.onError?.('vicious-gold', error);
      const stale = request.get('X-Hearthpulse-Prerender') ? null : lastGood;
      if (stale) {
        // Not fresh data: never kept by a shared cache, so no later request (a prerender included) gets it from there.
        response.set('Cache-Control', 'private, no-store');
        response.set('X-Vicious-Gold-Source', 'stale');
        return response.json(stale);
      }
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', '60');
      return response.status(503).json({ error: 'Данные Vicious Syndicate временно недоступны' });
    }
  };
}
