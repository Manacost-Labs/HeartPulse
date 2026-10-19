import type { BattlegroundLibraryLookup } from './catalogCache.js';

type Kind = 'minion' | 'spell';
type Identity = { dbfId: number; inPool: boolean };

/** Bounded positive identities; missing cards are never retained as negative snapshots. */
export function createBattlegroundLibraryIdentityReader<Card extends Identity>({
  read, ttlMs, staleMs = 15 * 60_000, retryMs = 30_000, maxEntries = 512, now = Date.now,
}: { read: (kind: Kind, dbfId: number) => Promise<Card | undefined>; ttlMs: number;
  staleMs?: number; retryMs?: number; maxEntries?: number; now?: () => number }) {
  type Slot = { card?: Card; freshUntil?: number; staleUntil?: number;
    job?: Promise<Card | undefined>; failure?: { retryAt: number; error: unknown } };
  const slots = new Map<string, Slot>();
  function refresh(kind: Kind, dbfId: number, slot: Slot): Promise<Card | undefined> {
    if (slot.job) return slot.job;
    const job = Promise.resolve().then(() => read(kind, dbfId)).then(card => {
      if (card && card.dbfId !== dbfId) throw new Error('Battleground identity mismatch');
      slot.card = card;
      slot.freshUntil = now() + ttlMs;
      slot.staleUntil = slot.freshUntil + staleMs;
      slot.failure = undefined;
      return card;
    }).catch(error => {
      slot.failure = { retryAt: now() + retryMs, error };
      throw error;
    }).finally(() => { slot.job = undefined; });
    slot.job = job;
    return job;
  }
  return async (kind: Kind, identity: BattlegroundLibraryLookup): Promise<Card[]> => {
    const key = `${kind}:${identity.dbfId}`;
    let slot = slots.get(key);
    if (!slot) {
      if (slots.size >= maxEntries) {
        const evictable = [...slots].find(([, candidate]) => !candidate.job);
        if (!evictable) throw new Error('Battleground identity reader is busy');
        slots.delete(evictable[0]);
      }
      slot = {}; slots.set(key, slot);
    } else { slots.delete(key); slots.set(key, slot); }
    const time = now();
    const result = (card: Card | undefined) => card && (!identity.archive || !card.inPool) ? [card] : [];
    if (slot.card && (slot.freshUntil ?? 0) > time) return result(slot.card);
    // Active cards cannot prove archive absence after their snapshot expires.
    if (slot.card && (slot.staleUntil ?? 0) > time && (!identity.archive || !slot.card.inPool)) {
      if (!slot.failure || slot.failure.retryAt <= time) void refresh(kind, identity.dbfId, slot).catch(() => undefined);
      return [slot.card];
    }
    if (slot.failure && slot.failure.retryAt > time) throw slot.failure.error;
    return result(await refresh(kind, identity.dbfId, slot));
  };
}
