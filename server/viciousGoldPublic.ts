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

const byName = (a: string, b: string) => a.localeCompare(b, 'ru');

function projectClass(row: JsonRecord): PublicViciousGoldClass | null {
  const className = text(row.class, 40);
  const classLabel = text(row.classLabel, 60);
  const classIcon = text(row.classIcon, 40);
  return className && classLabel && /^[a-z-]+$/.test(classIcon) ? { class: className, classLabel, classIcon } : null;
}

/**
 * Field-by-field allowlist of the report the paid route answers (`loadViciousGold`). Anything the report adds later
 * stays out of the guest's answer until it is named here. Lists are sorted by class name, then archetype name, so
 * the order says nothing about shares or tiers; the Power Tier keeps only the names of its rank brackets.
 */
export function projectPublicViciousGold(payload: unknown): PublicViciousGold {
  const data = record(payload);
  const timeRanges = record(data.timeRanges);
  const classes = new Map<string, PublicViciousGoldClass>();
  for (const row of rows(data.classDistribution)) {
    const item = projectClass(row);
    if (item && !classes.has(item.class)) classes.set(item.class, item);
  }
  const archetypes = new Map<string, PublicViciousGoldArchetype>();
  for (const row of rows(data.deckDistribution)) {
    const owner = projectClass(row);
    const deck = text(row.deck);
    const deckLabel = text(row.deckLabel) || deck;
    const slug = text(row.archetypeSlug, 160);
    if (!owner || !deck || archetypes.has(deck)) continue;
    if (!classes.has(owner.class)) classes.set(owner.class, owner);
    archetypes.set(deck, { ...owner, deck, deckLabel, archetypeSlug: /^[a-z0-9-]+$/.test(slug) ? slug : null });
  }
  const classOrder = [...classes.values()].sort((a, b) => byName(a.classLabel, b.classLabel));
  const position = new Map(classOrder.map((item, index) => [item.class, index]));
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
    classes: classOrder,
    archetypes: [...archetypes.values()].sort((a, b) =>
      (position.get(a.class) ?? 0) - (position.get(b.class) ?? 0) || byName(a.deckLabel, b.deckLabel) || byName(a.deck, b.deck)),
    rankBrackets: rows(data.tierList).flatMap(section => {
      const rankBracket = text(section.rankBracket, 60);
      return rankBracket ? [{ rankBracket, rankLabel: text(section.rankLabel, 60) || rankBracket }] : [];
    }),
  };
}

/**
 * `GET /api/vicious-syndicate-gold/public`: the open frame of the report, one answer for every viewer (no cookie is
 * read), so it may sit in a shared cache. The path ends in a `public` segment, so the scrape guard of open `/api/`
 * data budgets it. A source failure answers the last good frame (not to a prerender, which keeps its earlier page);
 * without one, a 503 that no cache keeps.
 */
export function createPublicViciousGoldHandler(dependencies: {
  loadViciousGold: () => Promise<unknown>;
  onError?: (scope: 'vicious-gold', error: unknown) => void;
}): RequestHandler {
  let lastGood: PublicViciousGold | null = null;
  return async (request, response) => {
    response.set('X-Content-Type-Options', 'nosniff');
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
        response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=60');
        response.set('X-Vicious-Gold-Source', 'stale');
        return response.json(stale);
      }
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', '60');
      return response.status(503).json({ error: 'Данные Vicious Syndicate временно недоступны' });
    }
  };
}
