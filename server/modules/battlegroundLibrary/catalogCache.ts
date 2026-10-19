type Kind = 'minion' | 'spell';
type CardIdentity = { dbfId: number; inPool: boolean };
export type BattlegroundLibraryLookup = { dbfId: number; archive?: boolean };

/** Stale snapshots confirm known identities only; absence always waits for fresh data. The injected read must have a deadline. */
export function createBattlegroundLibraryCatalogCache<Card extends CardIdentity>({
  read, ttlMs, staleMs = 15 * 60_000, retryMs = 30_000, now = Date.now, onRefreshError,
}: { read: (kind: Kind) => Promise<Card[]>; ttlMs: number; staleMs?: number; retryMs?: number;
  now?: () => number; onRefreshError?: (error: unknown) => void }) {
  const entries = new Map<Kind, { cards: Card[]; freshUntil: number; staleUntil: number }>();
  const jobs = new Map<Kind, Promise<Card[]>>();
  const failures = new Map<Kind, { retryAt: number; error: unknown }>();
  function refresh(kind: Kind): Promise<Card[]> {
    const running = jobs.get(kind);
    if (running) return running;
    const promise = Promise.resolve().then(() => read(kind)).then(cards => {
      const ids = new Set(cards.map(card => card.dbfId));
      if (!cards.length || ids.size !== cards.length || cards.some(card => !Number.isSafeInteger(card.dbfId) || card.dbfId <= 0)) {
        throw new Error('Invalid Battleground library identities');
      }
      const freshUntil = now() + ttlMs;
      entries.set(kind, { cards, freshUntil, staleUntil: freshUntil + staleMs }); failures.delete(kind);
      return cards;
    }).catch(error => {
      failures.set(kind, { retryAt: now() + retryMs, error });
      try { onRefreshError?.(error); } catch { /* Diagnostics cannot replace the source error. */ }
      throw error;
    }).finally(() => { if (jobs.get(kind) === promise) jobs.delete(kind); });
    jobs.set(kind, promise); return promise;
  }
  return {
    async load(kind: Kind, identity?: BattlegroundLibraryLookup): Promise<Card[]> {
      const cached = entries.get(kind), time = now();
      if (cached && cached.freshUntil > time) return cached.cards;
      const failure = failures.get(kind);
      const known = identity && cached?.cards.some(card => card.dbfId === identity.dbfId && (!identity.archive || !card.inPool));
      if (cached && cached.staleUntil > time && known) {
        if (!failure || failure.retryAt <= time) void refresh(kind).catch(() => undefined);
        return cached.cards;
      }
      if (failure && failure.retryAt > time) throw failure.error;
      return refresh(kind);
    },
  };
}
