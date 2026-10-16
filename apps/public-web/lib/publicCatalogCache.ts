import type { CardFormat } from '@/src/modules/constructedCards/public';

/** Pending reads share a 10s lifetime; successful anonymous seeds remain valid for 30s. */
export function createDefaultCatalogCache<T>(read: (format: CardFormat, signal: AbortSignal) => Promise<T>, now = Date.now) {
  const entries = new Map<CardFormat, { expiresAt: number; value: Promise<T> }>();
  return (format: CardFormat): Promise<T> => {
    const existing = entries.get(format);
    if (existing && existing.expiresAt > now()) return existing.value;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error('Public catalog request timed out');
        reject(error);
        controller.abort(error);
      }, 10_000);
      timer.unref?.();
    });
    // A transport abort can itself stall; the shared promise needs its own settlement.
    const value = Promise.race([Promise.resolve().then(() => read(format, controller.signal)), deadline]);
    const entry = { expiresAt: now() + 10_000, value };
    entries.set(format, entry);
    entry.value = entry.value.then(value => {
      if (entries.get(format) === entry) entry.expiresAt = now() + 30_000;
      return value;
    }, error => {
      if (entries.get(format) === entry) entries.delete(format);
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      controller.abort();
    });
    return entry.value;
  };
}
