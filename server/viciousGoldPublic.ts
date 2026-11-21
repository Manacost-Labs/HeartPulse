import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from 'express';
import {
  parsePublicViciousGold, type PublicViciousGold, type PublicViciousGoldArchetype, type PublicViciousGoldClass,
} from '../shared/viciousGoldPublicContract.js';

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

const COPY_DIRECTORY = 'vicious-gold-last-good-v1';
const COPY_FILE = 'public.json';
const COPY_FORMAT = 1;
/** A frame older than this is not served: a week-old list of archetypes is a wrong one, not a late one. */
const COPY_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** An unchanged frame is written again at most this often, so its age on disk follows the last good answer. */
const COPY_REWRITE_MS = 60 * 60_000;

type KeptFrame = { frame: PublicViciousGold; savedAt: number };

/**
 * The last good open frame in `<stateDirectory>/vicious-gold-last-good-v1/public.json` (#677), so a restarted Express
 * whose source is down still answers a guest. Only the projection is written, never the source's answer, and a read
 * frame passes the contract's parser again (the file is only data). Writes are atomic (a temporary file and a
 * rename); a failing disk costs the copy across restarts, never an answer, and is logged once. Writes run one at a
 * time, in the order the frames came, and a frame that waits is replaced by a newer one: an older frame whose write
 * finishes late can never land over a newer one. `files` is the disk boundary, replaceable in tests.
 */
export function createViciousGoldFrameCopy(stateDirectory: string | undefined, now: () => number,
  files: { writeFile: typeof writeFile } = { writeFile }) {
  const directory = stateDirectory ? join(stateDirectory, COPY_DIRECTORY) : null;
  let written = { serialized: '', at: -Infinity };
  let warned = false;
  /** The newest frame not written yet; the running write takes it when it is its turn. */
  let waiting: { frame: PublicViciousGold; serialized: string; savedAt: number } | null = null;
  let queue = Promise.resolve();

  const write = async (target: string) => {
    const next = waiting;
    waiting = null;
    if (!next || (next.serialized === written.serialized && next.savedAt - written.at < COPY_REWRITE_MS)) return;
    const file = join(target, COPY_FILE);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(target, { recursive: true });
      await files.writeFile(temporary, JSON.stringify({ format: COPY_FORMAT, savedAt: next.savedAt, frame: next.frame }), { mode: 0o640, flag: 'wx' });
      await rename(temporary, file);
      written = { serialized: next.serialized, at: next.savedAt };
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (!warned) {
        warned = true;
        console.warn(`[vicious-gold] cannot keep the open frame in ${target}: ${error instanceof Error ? error.message : String(error)}; it is kept in memory only`);
      }
    }
  };

  return {
    /** Resolves once this frame, or a newer one that replaced it, is on disk (or its write failed); never rejects. */
    save(frame: PublicViciousGold): Promise<void> {
      if (!directory) return Promise.resolve();
      waiting = { frame, serialized: JSON.stringify(frame), savedAt: now() };
      queue = queue.then(() => write(directory));
      return queue;
    },
    async load(): Promise<KeptFrame | null> {
      if (!directory) return null;
      try {
        const stored = JSON.parse(await readFile(join(directory, COPY_FILE), 'utf8')) as { format?: unknown; savedAt?: unknown; frame?: unknown } | null;
        if (stored?.format !== COPY_FORMAT || typeof stored.savedAt !== 'number' || !Number.isFinite(stored.savedAt)) return null;
        const frame = parsePublicViciousGold(stored.frame);
        return frame ? { frame, savedAt: stored.savedAt } : null;
      } catch {
        // No copy yet, or a damaged one: without a frame in memory the route answers 503 as before.
        return null;
      }
    },
  };
}

/**
 * `GET /api/vicious-syndicate-gold/public`: the open frame of the report, one answer for every viewer (no cookie is
 * read), so it may sit in a shared cache. The path ends in a `public` segment, so the scrape guard of open `/api/`
 * data budgets it. A source failure answers the last good frame (not to a prerender, which keeps its earlier page)
 * that no shared cache keeps; without one, a 503 that no cache keeps. Every answer varies on `X-Hearthpulse-Prerender`.
 * With `stateDirectory` (`SERVER_DATA_DIR`) the last good frame is also kept on disk and read back at the start, so
 * it outlives a restart; a frame older than a week is not served.
 */
export function createPublicViciousGoldHandler(dependencies: {
  loadViciousGold: () => Promise<unknown>;
  onError?: (scope: 'vicious-gold', error: unknown) => void;
  stateDirectory?: string;
  now?: () => number;
}): RequestHandler {
  const now = dependencies.now ?? Date.now;
  const copy = createViciousGoldFrameCopy(dependencies.stateDirectory, now);
  let lastGood: KeptFrame | null = null;
  // Read once at the start; only used while no answer of this process has replaced it.
  const restored = copy.load();
  return async (request, response) => {
    response.set('X-Content-Type-Options', 'nosniff');
    // The failure answer depends on this header (a prerender gets no stale copy): a cache keys on it.
    response.vary('X-Hearthpulse-Prerender');
    try {
      const body = projectPublicViciousGold(await dependencies.loadViciousGold());
      if (!body.archetypes.length) throw new Error('Vicious Syndicate Gold has no archetypes');
      lastGood = { frame: body, savedAt: now() };
      void copy.save(body);
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      return response.json(body);
    } catch (error) {
      dependencies.onError?.('vicious-gold', error);
      const kept = request.get('X-Hearthpulse-Prerender') ? null : lastGood ?? await restored;
      if (kept && now() - kept.savedAt <= COPY_MAX_AGE_MS) {
        // Not fresh data: never kept by a shared cache, so no later request (a prerender included) gets it from there.
        response.set('Cache-Control', 'private, no-store');
        response.set('X-Vicious-Gold-Source', 'stale');
        return response.json(kept.frame);
      }
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', '60');
      return response.status(503).json({ error: 'Данные Vicious Syndicate временно недоступны' });
    }
  };
}
