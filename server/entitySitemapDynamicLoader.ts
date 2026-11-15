import { DeadlineExceededError, withDeadline } from './modules/constructedCards/public.js';
import {
  SemanticSitemapStore,
  type SemanticSitemapDocument,
  type SitemapSegment,
  type SitemapSemanticEntry,
} from './entitySitemapStore.js';

/** The source answered, but only from its own last known good version: usable, not a fresh build. */
export class StaleSitemapSourceError extends Error {
  constructor(readonly rows: unknown[]) {
    super('Sitemap source is serving a stale version');
    this.name = 'StaleSitemapSourceError';
  }
}

type Source = 'catalog' | 'last-known-good';
const FALLBACK_TTL_MS = 30_000;

type Options<Document> = {
  definition: {
    segment: SitemapSegment;
    filename?: string;
    load: () => Promise<unknown[]>;
    project: (rows: unknown[], origin: string) => SitemapSemanticEntry[];
    minimumEntryCount: number;
  };
  stateDirectory: string;
  origin: string;
  now: () => number;
  cacheTtlMs: number;
  responseDeadlineMs?: number;
  loadDeadlineMs?: number;
  onError?: (error: unknown) => void;
  toDocument: (state: SemanticSitemapDocument, source: Source, expiresAt: number) => Document & { expiresAt: number };
};

/**
 * One cached, deduplicated sitemap document per segment. A rebuild that fails,
 * hangs past `loadDeadlineMs` or comes from a stale source is answered from the
 * last published version and cached only briefly, so the next request after
 * the source recovers rebuilds instead of repeating the old document. A caller
 * waits at most `responseDeadlineMs` for a running rebuild.
 */
export function createDynamicDocumentLoader<Document>(options: Options<Document>) {
  const { definition, origin, now, cacheTtlMs } = options;
  const responseMs = Math.max(1, options.responseDeadlineMs ?? 2_000);
  const loadMs = Math.max(1, options.loadDeadlineMs ?? 25_000);
  const operation = `entity-sitemap:${definition.segment}`;
  const store = new SemanticSitemapStore({
    directory: options.stateDirectory,
    filename: definition.filename,
    segment: definition.segment,
    canonicalOrigin: origin,
    now,
    minimumEntryCount: definition.minimumEntryCount,
  });
  type Cached = Document & { expiresAt: number };
  let cache: Cached | null = null;
  let inflight: Promise<Cached> | null = null;
  const fallback = (ttlMs: number): Cached | null => {
    const lastKnownGood = store.readLastKnownGood();
    return lastKnownGood ? options.toDocument(lastKnownGood, 'last-known-good', now() + ttlMs) : null;
  };
  const wait = async (running: Promise<Cached>): Promise<Cached> => {
    try {
      return await withDeadline(running, responseMs, `${operation}:response`);
    } catch (error) {
      const last = error instanceof DeadlineExceededError ? fallback(Math.min(cacheTtlMs, FALLBACK_TTL_MS)) : null;
      if (!last) throw error;
      cache = last; // the rebuild goes on; its result replaces this short-lived copy
      return last;
    }
  };
  return async (): Promise<Cached> => {
    if (cache && cache.expiresAt > now()) return cache;
    if (inflight) return wait(inflight);
    const job = (async () => {
      try {
        cache = options.toDocument(store.publish(
          definition.project(await withDeadline(definition.load(), loadMs, operation), origin),
        ), 'catalog', now() + cacheTtlMs);
        return cache;
      } catch (error) {
        try {
          options.onError?.(new Error(`${definition.segment} sitemap refresh failed`, { cause: error }));
        } catch {
          // Diagnostics must never alter the public contract.
        }
        const brief = error instanceof DeadlineExceededError || error instanceof StaleSitemapSourceError;
        const last = fallback(brief ? Math.min(cacheTtlMs, FALLBACK_TTL_MS) : cacheTtlMs);
        if (last) return cache = last;
        if (error instanceof StaleSitemapSourceError) {
          return cache = options.toDocument(store.publish(definition.project(error.rows, origin)),
            'last-known-good', now() + Math.min(cacheTtlMs, FALLBACK_TTL_MS));
        }
        throw error;
      }
    })().finally(() => {
      if (inflight === job) inflight = null;
    });
    inflight = job;
    return wait(job);
  };
}
