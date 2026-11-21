import { withDeadline } from './publicArchetypeDetail.js';

type Dictionary = Record<string, unknown>;

export type ArchetypeCardDictionariesOptions = {
  /** The local `cards_ru.json`: read on every call (the server keeps the parsed file until it changes). */
  local: () => Dictionary | null;
  /** All of HearthstoneJSON: a network read, kept for `ttlMs`. */
  remote: () => Promise<Dictionary>;
  /** How long a call waits for a first HearthstoneJSON answer before answering with the local dictionary alone. */
  deadlineMs: number;
  /** After a failed read, HearthstoneJSON is not asked again for this long. */
  retryMs?: number;
  ttlMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

/**
 * The card dictionaries that name the open builds' cards the format's catalog
 * lacks (companions of Fabled legendaries, tokens), the deck builder's two
 * sources taken independently: the local file always answers whatever
 * HearthstoneJSON does, and HearthstoneJSON is read once and kept, with one
 * request in flight and a pause after a failure, never a request per render.
 */
export function createArchetypeCardDictionaries(options: ArchetypeCardDictionariesOptions): () => Promise<Dictionary[]> {
  const now = options.now ?? Date.now;
  const retryMs = options.retryMs ?? 5 * 60_000;
  const ttlMs = options.ttlMs ?? 6 * 60 * 60_000;
  let remote: { value: Dictionary; at: number } | null = null;
  let failedAt: number | null = null;
  let pending: Promise<void> | null = null;
  const refresh = (): Promise<void> | null => {
    if (pending) return pending;
    if (remote && now() - remote.at < ttlMs) return null;
    if (failedAt !== null && now() - failedAt < retryMs) return null;
    pending = options.remote().then(value => {
      remote = { value, at: now() };
      failedAt = null;
    }, error => {
      failedAt = now();
      options.onError?.(error);
    }).finally(() => { pending = null; });
    return pending;
  };
  return async () => {
    let local: Dictionary | null = null;
    try {
      local = options.local();
    } catch (error) {
      options.onError?.(error);
    }
    const loading = refresh();
    // A kept copy answers at once while it is renewed; only the first read is waited for, and not past the deadline.
    if (loading && !remote) await withDeadline(() => loading, options.deadlineMs, () => undefined);
    return [remote?.value ?? null, local].filter((dictionary): dictionary is Dictionary => dictionary !== null);
  };
}
