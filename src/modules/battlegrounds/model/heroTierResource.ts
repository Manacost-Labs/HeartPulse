import type { BattlegroundHeroMmr, BattlegroundHeroMode, BattlegroundHeroTierSection } from './heroCatalog';

export type BattlegroundHeroTierData = {
  sections: BattlegroundHeroTierSection[];
  sourceLabel: string;
};
type Entry = BattlegroundHeroTierData & { source: 'live' | 'snapshot'; expiresAt: number };
type Dependencies = {
  loadLive: (mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr) => Promise<BattlegroundHeroTierData>;
  loadSnapshot: () => Promise<BattlegroundHeroTierData>;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
};
const LIVE_TTL_MS = 5 * 60_000;
const SNAPSHOT_RETRY_MS = 30_000;
const scheduleTimer = (callback: () => void, delayMs: number) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/** A fallback is a short-lived recovery state; it must never suppress future API requests. */
export function createBattlegroundHeroTierResource(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  const schedule = dependencies.schedule ?? scheduleTimer;
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<Entry>>();
  const key = (mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr) => `${mode}:${mmr}`;
  const peek = (mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr): Entry | null => {
    const entry = entries.get(key(mode, mmr));
    return entry && entry.expiresAt > now() ? entry : null;
  };
  const load = (mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr): Promise<Entry> => {
    const cacheKey = key(mode, mmr);
    const cached = peek(mode, mmr);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(cacheKey);
    if (inFlight) return inFlight;
    const request = (async (): Promise<Entry> => {
      let data: BattlegroundHeroTierData;
      let source: Entry['source'] = 'live';
      try {
        data = await dependencies.loadLive(mode, mmr);
        if (!data.sections.length) throw new Error('Empty hero tier data');
      } catch (error) {
        if (mode === 'duos') throw error;
        data = await dependencies.loadSnapshot();
        if (!data.sections.length) throw new Error('Empty hero snapshot');
        source = 'snapshot';
      }
      const entry: Entry = { ...data, source,
        expiresAt: now() + (source === 'live' ? LIVE_TTL_MS : SNAPSHOT_RETRY_MS),
      };
      entries.set(cacheKey, entry);
      return entry;
    })().finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, request);
    return request;
  };
  return {
    peek, load,
    /** Shared requests survive disposal; callbacks and future retries belong to this observer. */
    observe(mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr, observer: {
      onData: (entry: Entry) => void;
      onError: (error: unknown) => void;
    }): () => void {
      let active = true;
      let cancelTimer: (() => void) | undefined;
      const refresh = () => {
        void load(mode, mmr).then(entry => {
          if (!active) return;
          observer.onData(entry);
          cancelTimer = schedule(refresh, Math.max(1, entry.expiresAt - now()));
        }, error => {
          if (!active) return;
          observer.onError(error);
          cancelTimer = schedule(refresh, SNAPSHOT_RETRY_MS);
        });
      };
      refresh();
      return () => { active = false; cancelTimer?.(); };
    },
  };
}
