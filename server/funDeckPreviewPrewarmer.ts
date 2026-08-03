import { cachedDeckviewPreview } from './deckviewPreview.js';
import type { StandardMetaPreview } from './standardMetaRoutes.js';

export type FunDeckPreviewCandidate = {
  deckCode: string;
  title: string;
};

export type FunDeckPreviewPrewarmer = {
  schedule: (decks: FunDeckPreviewCandidate[]) => void;
  snapshot: () => { active: number; queued: number; warmed: number };
  whenIdle: () => Promise<void>;
};

export type FunDeckPreviewCoordinator = {
  getPreview: (deck: FunDeckPreviewCandidate) => { imageUrl: string; previewImageUrl: string } | null;
  schedule: FunDeckPreviewPrewarmer['schedule'];
  snapshot: FunDeckPreviewPrewarmer['snapshot'];
};

type Options = {
  concurrency?: number;
  delayMs?: number;
  warmTtlMs?: number;
  render: (deck: FunDeckPreviewCandidate) => Promise<unknown>;
  onError?: (error: unknown, deck: FunDeckPreviewCandidate) => void;
};

function candidateKey(deck: FunDeckPreviewCandidate): string {
  return `${deck.deckCode.replace(/\s+/g, '')}\u0000${deck.title.trim()}`;
}

export function createFunDeckPreviewPrewarmer(options: Options): FunDeckPreviewPrewarmer {
  const concurrency = Math.max(1, Math.min(4, Math.trunc(options.concurrency ?? 2)));
  const delayMs = Math.max(0, Math.min(30_000, Math.trunc(options.delayMs ?? 2_000)));
  const warmTtlMs = Math.max(60_000, Math.min(24 * 60 * 60_000, Math.trunc(
    options.warmTtlMs ?? 6 * 60 * 60_000,
  )));
  const queue: FunDeckPreviewCandidate[] = [];
  const scheduled = new Set<string>();
  const warmed = new Map<string, number>();
  const idleWaiters = new Set<() => void>();
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resolveIdle = () => {
    if (active || queue.length || timer) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  };

  const pump = () => {
    timer = null;
    while (active < concurrency && queue.length) {
      const deck = queue.shift()!;
      const key = candidateKey(deck);
      active += 1;
      void options.render(deck).then(() => {
        warmed.set(key, Date.now() + warmTtlMs);
        while (warmed.size > 2_048) {
          const oldest = warmed.keys().next().value;
          if (typeof oldest !== 'string') break;
          warmed.delete(oldest);
        }
      }).catch(error => {
        options.onError?.(error, deck);
      }).finally(() => {
        active = Math.max(0, active - 1);
        scheduled.delete(key);
        pump();
      });
    }
    resolveIdle();
  };

  return {
    schedule(decks) {
      for (const deck of decks) {
        if (!deck.deckCode.trim()) continue;
        const normalized = { deckCode: deck.deckCode.trim(), title: deck.title.trim() || 'Колода' };
        const key = candidateKey(normalized);
        const warmedUntil = warmed.get(key) || 0;
        if (scheduled.has(key) || warmedUntil > Date.now()) continue;
        if (warmedUntil) warmed.delete(key);
        scheduled.add(key);
        queue.push(normalized);
      }
      if (!queue.length || active || timer) return;
      timer = setTimeout(pump, delayMs);
    },
    snapshot() {
      return { active, queued: queue.length, warmed: warmed.size };
    },
    whenIdle() {
      if (!active && !queue.length && !timer) return Promise.resolve();
      return new Promise(resolve => idleWaiters.add(resolve));
    },
  };
}

export function createFunDeckPreviewCoordinator(options: {
  cache: Map<string, { preview: StandardMetaPreview; expiresAt: number }>;
  revision: string;
  publicBaseUrl: string;
  render: Options['render'];
}): FunDeckPreviewCoordinator {
  const prewarmer = createFunDeckPreviewPrewarmer({
    concurrency: Number(process.env.FUN_DECK_PREWARM_CONCURRENCY || 2),
    delayMs: Number(process.env.FUN_DECK_PREWARM_DELAY_MS || 2_000),
    render: options.render,
    onError: (error, deck) => console.warn(
      `[fun-decks] preview prewarm failed for ${deck.title}:`,
      error instanceof Error ? error.message : error,
    ),
  });
  return {
    getPreview: deck => cachedDeckviewPreview(
      options.cache,
      options.revision,
      options.publicBaseUrl,
      deck,
    ),
    schedule: prewarmer.schedule,
    snapshot: prewarmer.snapshot,
  };
}
