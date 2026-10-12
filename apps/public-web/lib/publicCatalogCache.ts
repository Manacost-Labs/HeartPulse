import type { CardFormat } from '@/src/modules/constructedCards/public';

/** Two anonymous default seeds; pending reads coalesce, expired/failed reads never serve stale data. */
export function createDefaultCatalogCache<T>(read: (format: CardFormat) => Promise<T>, now = Date.now) {
  const entries = new Map<CardFormat, { expiresAt: number; value: Promise<T> }>();
  return (format: CardFormat): Promise<T> => {
    const existing = entries.get(format);
    if (existing && existing.expiresAt > now()) return existing.value;
    const entry = { expiresAt: Infinity, value: Promise.resolve().then(() => read(format)) };
    entries.set(format, entry);
    entry.value = entry.value.then(value => {
      entry.expiresAt = now() + 30_000;
      return value;
    }, error => {
      entries.delete(format);
      throw error;
    });
    return entry.value;
  };
}
