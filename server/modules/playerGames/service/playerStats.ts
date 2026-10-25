import type { ArenaRunRecord, PlayerGame, PlayerGameMode } from '../model/game.js';
import { GAME_EVENT_TYPES, type CountStatisticsEvents, type GameEventType, type LoadStatisticsEvents } from '../model/events.js';
import type { GlobalBattlegroundsHero, GlobalStatisticsSources } from '../model/globalSources.js';
import {
  MAX_STATS_GAMES,
  periodStart,
  type GlobalAvailability,
  type GlobalMmrFilter,
  type PlayerStats,
  type StatsPeriod,
} from '../model/stats.js';
import { statisticsFromEvent } from '../schema/gameSchema.js';
import { buildArenaStats } from './arenaStats.js';
import { buildBattlegroundsStats, type BattlegroundsGlobal } from './battlegroundsStats.js';
import { buildConstructedStats } from './constructedStats.js';

const GLOBAL_TTL_MS = 60 * 60_000;
const GLOBAL_COMBAT_HEROES = 8;
const MAX_CACHE_ENTRIES = 64;
const RESULT_TTL_MS = 5 * 60_000;
const MAX_RESULT_ENTRIES = 500;
const EVENT_TYPES: Record<PlayerGameMode, GameEventType[]> = {
  battlegrounds: ['battlegrounds_match'],
  standard: ['constructed_match'],
  wild: ['constructed_match'],
  arena: ['arena_match', 'arena_run'],
};

export type PlayerStatsQuery = { mode: PlayerGameMode; period: StatsPeriod; duos: boolean; mmr: GlobalMmrFilter };

export type PlayerStatsDependencies = {
  /** The account's tracker events, newest first (the tracker ingestion repository). */
  loadEvents: LoadStatisticsEvents;
  countEvents: CountStatisticsEvents;
  global: GlobalStatisticsSources;
  /** Localized names for card ids; missing names fall back to the id on the page. */
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  now?: () => number;
};

const isGame = (read: PlayerGame | ArenaRunRecord): read is PlayerGame => 'mode' in read;

/** Shared by all accounts: global data does not depend on the viewer, only on the query. */
function createTtlCache(now: () => number) {
  const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now()) return cached.value as Promise<T>;
    const value = load();
    entries.set(key, { expiresAt: now() + GLOBAL_TTL_MS, value });
    value.catch(() => entries.delete(key));
    if (entries.size > MAX_CACHE_ENTRIES) entries.delete(entries.keys().next().value as string);
    return value;
  };
}

/**
 * Reads the account's newest tracker events of one mode and period, as games,
 * and aggregates them. Events without the statistics fields are skipped.
 * Paid global comparisons are requested only when the route says the viewer
 * may see them; a failing global source hides comparisons and never fails the page.
 */
export function createPlayerStatsService(dependencies: PlayerStatsDependencies) {
  const now = dependencies.now ?? Date.now;
  const cached = createTtlCache(now);
  const { battlegroundsHeroes, battlegroundsHeroCombat, constructedArchetypes } = dependencies.global;
  const resolveCardNames = dependencies.resolveCardNames;

  async function attempt<T>(load: (() => Promise<T>) | undefined): Promise<T | null> {
    if (!load) return null;
    try {
      return await load();
    } catch {
      return null;
    }
  }

  async function battlegroundsGlobal(query: PlayerStatsQuery, heroCardIds: string[]): Promise<BattlegroundsGlobal | null> {
    const heroes = await attempt(battlegroundsHeroes && (() => cached(`bg:${query.duos}:${query.mmr}`,
      () => battlegroundsHeroes({ duos: query.duos, mmr: query.mmr }))));
    if (!heroes?.length) return null;
    const byCard = new Map<string, GlobalBattlegroundsHero>(heroes.map(hero => [hero.cardId, hero]));
    const combat = new Map<string, Array<{ turn: number; winrate: number }>>();
    await Promise.all(heroCardIds.slice(0, GLOBAL_COMBAT_HEROES).map(async cardId => {
      const hero = byCard.get(cardId);
      if (!hero || !battlegroundsHeroCombat) return;
      const rounds = await attempt(() => cached(`bg-combat:${hero.heroId}:${query.duos}:${query.mmr}`,
        () => battlegroundsHeroCombat(hero.heroId, { duos: query.duos, mmr: query.mmr })));
      if (rounds?.length) combat.set(cardId, rounds);
    }));
    return { heroes: byCard, combat };
  }

  async function names(stats: PlayerStats): Promise<Record<string, string>> {
    if (stats.mode !== 'battlegrounds' || !resolveCardNames) return {};
    const ids = new Set<string>();
    for (const hero of stats.heroes) ids.add(hero.heroCardId);
    for (const point of stats.ratingSeries) {
      ids.add(point.heroCardId);
      if (point.anomalyCardId) ids.add(point.anomalyCardId);
      for (const minion of point.board) ids.add(minion.cardId);
    }
    return await attempt(() => resolveCardNames([...ids])) ?? {};
  }

  function availability(allowed: boolean, loaded: boolean): GlobalAvailability {
    if (!allowed) return 'subscription';
    return loaded ? 'available' : 'unavailable';
  }

  const results = new Map<string, { expiresAt: number; value: PlayerStats }>();
  // Loads still computing per account; an invalidation marks them stale so a
  // result read before it is answered once but never cached.
  const computing = new Map<string, Set<{ stale: boolean }>>();

  return {
    /** Which tabs have data: version 2 game and run events per mode, counted without reading payloads. */
    availableModes(userId: string): Record<PlayerGameMode, number> {
      const counts = dependencies.countEvents(userId, GAME_EVENT_TYPES, 2);
      const constructed = counts.constructed_match ?? 0;
      return { battlegrounds: counts.battlegrounds_match ?? 0, standard: constructed, wild: constructed,
        arena: (counts.arena_match ?? 0) + (counts.arena_run ?? 0) };
    },

    /** Drops the account's cached answers; the tracker ingestion calls it after storing new events. */
    invalidate(userId: string): void {
      for (const run of computing.get(userId) ?? []) run.stale = true;
      for (const key of results.keys()) if (key.startsWith(`${userId}|`)) results.delete(key);
    },

    /**
     * Aggregates are cached per account and query for a few minutes, so a page
     * that reloads or switches tabs does not parse thousands of events again.
     */
    async load(userId: string, query: PlayerStatsQuery, globalAllowed: boolean): Promise<PlayerStats> {
      const key = `${userId}|${query.mode}:${query.period}:${query.duos}:${query.mmr}:${globalAllowed}`;
      const hit = results.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      const run = { stale: false };
      const runs = computing.get(userId) ?? new Set<{ stale: boolean }>();
      computing.set(userId, runs.add(run));
      let value: PlayerStats;
      try {
        value = await compute(userId, query, globalAllowed);
      } finally {
        runs.delete(run);
        if (!runs.size) computing.delete(userId);
      }
      if (run.stale) return value;
      results.set(key, { expiresAt: now() + RESULT_TTL_MS, value });
      if (results.size > MAX_RESULT_ENTRIES) results.delete(results.keys().next().value as string);
      return value;
    },
  };

  async function compute(userId: string, query: PlayerStatsQuery, globalAllowed: boolean): Promise<PlayerStats> {
      const since = periodStart(query.period, now());
      const games: PlayerGame[] = [];
      const runs: ArenaRunRecord[] = [];
      for (const event of dependencies.loadEvents(userId, { types: EVENT_TYPES[query.mode],
        since: since === null ? null : new Date(since).toISOString(), limit: MAX_STATS_GAMES, minSchemaVersion: 2 })) {
        const read = statisticsFromEvent(event, now());
        if (!read) continue;
        if (isGame(read)) games.push(read);
        else runs.push(read);
      }
      if (query.mode === 'battlegrounds') {
        const bgGames = games.filter((game): game is Extract<PlayerGame, { mode: 'battlegrounds' }> =>
          game.mode === 'battlegrounds' && game.battlegrounds.duos === query.duos);
        const counts = new Map<string, number>();
        for (const game of bgGames) counts.set(game.battlegrounds.heroCardId, (counts.get(game.battlegrounds.heroCardId) ?? 0) + 1);
        const heroOrder = [...counts.keys()].sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0));
        const globalData = globalAllowed && bgGames.length ? await battlegroundsGlobal(query, heroOrder) : null;
        const stats = buildBattlegroundsStats(bgGames, { period: query.period, duos: query.duos,
          global: { availability: availability(globalAllowed, Boolean(globalData)), mmr: query.mmr } }, globalData);
        return { ...stats, cards: await names({ ...stats, cards: {} }) };
      }
      if (query.mode === 'arena') {
        const arenaGames = games.filter((game): game is Extract<PlayerGame, { mode: 'arena' }> => game.mode === 'arena');
        return buildArenaStats(arenaGames, runs, { period: query.period, global: { availability: 'none' } });
      }
      const format = query.mode;
      const constructedGames = games.filter((game): game is Extract<PlayerGame, { mode: 'standard' | 'wild' }> =>
        game.mode === format);
      const globalData = globalAllowed && constructedGames.length
        ? await attempt(constructedArchetypes && (() => cached(`meta:${format}`, () => constructedArchetypes(format))))
        : null;
      return buildConstructedStats(constructedGames, { mode: format, period: query.period,
        global: { availability: availability(globalAllowed, Boolean(globalData?.length)) } }, globalData);
  }
}

export type PlayerStatsService = ReturnType<typeof createPlayerStatsService>;
