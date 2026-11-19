/**
 * Warms the deck art of the published fun decks: the `row` tile and the
 * `portrait` of every card, so a visitor never waits for a cold generation.
 *
 * One card at a time and a pause between cards keep it to a single slot of
 * the shared card-image queue. A complete deck stays warm for `warmTtlMs`; a
 * deck with a failed card is tried again after `retryMs`, by the next cycle,
 * so a card the source lacks does not cost a deck resolve on every request.
 */
export type FunDeckArtCandidate = {
  deckCode: string;
  format: string;
  nearestArchetype?: string | null;
};

type ArtVariant = 'row' | 'portrait';
const VARIANTS: readonly ArtVariant[] = ['row', 'portrait'];

export type FunDeckArtPrewarmerOptions = {
  /** Ids of every card of the deck: main deck, sideboards and their key cards. */
  resolveCardIds: (deck: FunDeckArtCandidate) => Promise<readonly string[]>;
  isCached: (cardId: string, variant: ArtVariant) => boolean;
  ensure: (cardId: string, variant: ArtVariant) => Promise<unknown>;
  /** Published decks for the timer; without it only `schedule` warms. */
  loadDecks?: () => Promise<readonly FunDeckArtCandidate[]>;
  /** Pause after each generated image. */
  delayMs?: number;
  warmTtlMs?: number;
  retryMs?: number;
  intervalMs?: number;
  startDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onError?: (error: unknown, subject: string) => void;
};

export type FunDeckArtPrewarmer = {
  schedule: (decks: readonly FunDeckArtCandidate[]) => void;
  /** Starts the periodic warm-up; the first run follows after `startDelayMs`. */
  start: () => void;
  stop: () => void;
  snapshot: () => { queued: number; running: boolean; warmed: number };
  whenIdle: () => Promise<void>;
};

const clamp = (value: number | undefined, fallback: number, min: number, max: number) => (
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value as number))) : fallback
);

function candidateKey(deck: FunDeckArtCandidate): string {
  return `${deck.format.toLowerCase()}\u0000${deck.deckCode.replace(/\s+/g, '')}`;
}

export function createFunDeckArtPrewarmer(options: FunDeckArtPrewarmerOptions): FunDeckArtPrewarmer {
  const delayMs = clamp(options.delayMs, 250, 0, 30_000);
  const warmTtlMs = clamp(options.warmTtlMs, 6 * 60 * 60_000, 1_000, 24 * 60 * 60_000);
  const retryMs = clamp(options.retryMs, 10 * 60_000, 1_000, warmTtlMs);
  const intervalMs = clamp(options.intervalMs, 30 * 60_000, 1_000, 24 * 60 * 60_000);
  const startDelayMs = clamp(options.startDelayMs, 60_000, 0, 60 * 60_000);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => { setTimeout(resolve, ms); }));
  const queue: FunDeckArtCandidate[] = [];
  const queued = new Set<string>();
  const warmed = new Map<string, number>();
  const idleWaiters = new Set<() => void>();
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const warnOnce = (error: unknown, subject: string) => options.onError?.(error, subject);

  /** Returns true when every image of the deck is in the cache. */
  const warmDeck = async (deck: FunDeckArtCandidate): Promise<boolean> => {
    let ids: readonly string[];
    try {
      ids = await options.resolveCardIds(deck);
    } catch (error) {
      warnOnce(error, `deck ${deck.deckCode.slice(0, 12)}`);
      return false;
    }
    let complete = true;
    for (const id of new Set(ids)) {
      for (const variant of VARIANTS) {
        if (options.isCached(id, variant)) continue;
        try {
          await options.ensure(id, variant);
        } catch (error) {
          complete = false;
          warnOnce(error, `${id} ${variant}`);
        }
        await sleep(delayMs);
      }
    }
    return complete;
  };

  const drain = async () => {
    running = true;
    try {
      for (let deck = queue.shift(); deck; deck = queue.shift()) {
        const key = candidateKey(deck);
        try {
          warmed.set(key, now() + (await warmDeck(deck) ? warmTtlMs : retryMs));
          while (warmed.size > 2_048) warmed.delete(warmed.keys().next().value as string);
        } finally {
          queued.delete(key);
        }
      }
    } finally {
      running = false;
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  };

  const schedule: FunDeckArtPrewarmer['schedule'] = decks => {
    for (const deck of decks) {
      if (!deck.deckCode?.trim() || !deck.format) continue;
      const key = candidateKey(deck);
      if (queued.has(key)) continue;
      const warmUntil = warmed.get(key) ?? 0;
      if (warmUntil > now()) continue;
      warmed.delete(key);
      queued.add(key);
      queue.push({ deckCode: deck.deckCode.trim(), format: deck.format, nearestArchetype: deck.nearestArchetype });
    }
    if (queue.length && !running) void drain();
  };

  const tick = () => {
    timer = null;
    if (stopped) return;
    const next = () => {
      if (stopped) return;
      timer = setTimeout(tick, intervalMs);
      timer.unref?.();
    };
    if (!options.loadDecks) return next();
    options.loadDecks().then(schedule).catch(error => warnOnce(error, 'deck list')).finally(next);
  };

  return {
    schedule,
    start() {
      if (timer || stopped) return;
      timer = setTimeout(tick, startDelayMs);
      timer.unref?.();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    snapshot: () => ({ queued: queue.length, running, warmed: warmed.size }),
    whenIdle: () => (running || queue.length ? new Promise<void>(resolve => { idleWaiters.add(resolve); }) : Promise.resolve()),
  };
}
