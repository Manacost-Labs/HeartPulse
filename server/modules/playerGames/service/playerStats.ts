import type { ArenaRunRecord, PlayerGame, PlayerGameMode } from '../model/game.js';
import type { CountStatisticsEventsByField, GameEventType, LoadStatisticsEvents } from '../model/events.js';
import type { GlobalBattlegroundsHero, GlobalStatisticsSources } from '../model/globalSources.js';
import {
  MAX_STATS_GAMES,
  periodStart,
  type AvailableModes,
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
  countEventsByField: CountStatisticsEventsByField;
  global: GlobalStatisticsSources;
  /** Localized names for card ids; missing names fall back to the id on the page. */
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  /** The account's web replays of these games (game event id → replay id); read on every answer, never cached. */
  replaysOfGames?: (userId: string, gameIds: string[]) => Record<string, string>;
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
 * The account's answers for a few minutes, so a page that reloads or switches
 * tabs does not parse or count thousands of events again. Keys start with
 * `<userId>|`, so `drop` forgets one account's answers.
 */
function createResultCache(now: () => number) {
  const entries = new Map<string, { expiresAt: number; value: PlayerStats | AvailableModes }>();
  const fresh = (key: string) => {
    const hit = entries.get(key);
    return hit && hit.expiresAt > now() ? hit.value : null;
  };
  return {
    stats: (key: string): PlayerStats | null => {
      const value = fresh(key);
      return value && 'mode' in value ? value : null;
    },
    modes: (key: string): AvailableModes | null => {
      const value = fresh(key);
      return value && 'modes' in value ? value : null;
    },
    set<T extends PlayerStats | AvailableModes>(key: string, value: T): T {
      entries.set(key, { expiresAt: now() + RESULT_TTL_MS, value });
      if (entries.size > MAX_RESULT_ENTRIES) entries.delete(entries.keys().next().value as string);
      return value;
    },
    drop(userId: string): void {
      for (const key of entries.keys()) if (key.startsWith(`${userId}|`)) entries.delete(key);
    },
  };
}

const total = (counts: Partial<Record<string, number>>): number =>
  Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);

/**
 * Readable version 2 games and runs per tab. Each counts by a field that every
 * readable payload has at its top level (the stored wire shape); a row stored
 * with a `statisticsError` has none of them, so it opens no tab.
 */
function countModes(countByField: CountStatisticsEventsByField, userId: string, until: number | null): AvailableModes {
  const bound = until === null ? undefined : new Date(until).toISOString();
  const count = (type: GameEventType, field: string) => countByField(userId, type, 2, field, bound);
  const queues = count('battlegrounds_match', 'duos');
  const formats = count('constructed_match', 'format');
  const solo = queues['0'] ?? 0;
  const duos = queues['1'] ?? 0;
  // Arena games and runs all carry `underground`, normal and Underground runs alike.
  const arena = total(count('arena_match', 'underground')) + total(count('arena_run', 'underground'));
  return {
    modes: { battlegrounds: solo + duos, standard: formats.standard ?? 0, wild: formats.wild ?? 0, arena },
    battlegroundsQueues: { solo, duos },
  };
}

function availability(allowed: boolean, loaded: boolean): GlobalAvailability {
  if (!allowed) return 'subscription';
  return loaded ? 'available' : 'unavailable';
}

/** Links «Последние игры» to the account's replays as they are now: an upload or a delete shows at once. */
function withReplays(replays: PlayerStatsDependencies['replaysOfGames'], userId: string, stats: PlayerStats): PlayerStats {
  if (!replays || stats.recentGames.length === 0) return stats;
  const byGame = replays(userId, stats.recentGames.map(game => game.id));
  const recentGames: Array<{ id: string; replayId: string | null }> = stats.recentGames;
  // Same mode, same game shapes: only `replayId` changes.
  return { ...stats, recentGames: recentGames.map(game => ({ ...game, replayId: byGame[game.id] ?? null })) } as PlayerStats;
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
    for (const game of stats.recentGames) ids.add(game.heroCardId);
    for (const point of stats.ratingSeries) {
      ids.add(point.heroCardId);
      if (point.anomalyCardId) ids.add(point.anomalyCardId);
      for (const minion of point.board) ids.add(minion.cardId);
    }
    return await attempt(() => resolveCardNames([...ids])) ?? {};
  }

  const results = createResultCache(now);

  return {
    /** Which tabs have data (`countModes`), cached like the statistics; `until` (exclusive) counts only earlier games. */
    availableModes(userId: string, until: number | null = null): AvailableModes {
      const key = `${userId}|modes:${until}`;
      return results.modes(key) ?? results.set(key, countModes(dependencies.countEventsByField, userId, until));
    },

    /** Drops the account's cached answers; the tracker ingestion calls it after storing new events. */
    invalidate(userId: string): void {
      results.drop(userId);
    },

    /**
     * Aggregates are cached per account and query for a few minutes.
     * `until` (exclusive) ends the games and the period windows there instead of now.
     */
    async load(userId: string, query: PlayerStatsQuery, globalAllowed: boolean, until: number | null = null): Promise<PlayerStats> {
      const key = `${userId}|${query.mode}:${query.period}:${query.duos}:${query.mmr}:${globalAllowed}:${until}`;
      const value = results.stats(key) ?? results.set(key, await compute(userId, query, globalAllowed, until));
      return withReplays(dependencies.replaysOfGames, userId, value);
    },

    /** The service's clock, so readers built on it agree with its cache. */
    now,
  };

  async function compute(userId: string, query: PlayerStatsQuery, globalAllowed: boolean, until: number | null = null): Promise<PlayerStats> {
      const since = periodStart(query.period, until ?? now());
      const games: PlayerGame[] = [];
      const runs: ArenaRunRecord[] = [];
      for (const event of dependencies.loadEvents(userId, { types: EVENT_TYPES[query.mode],
        since: since === null ? null : new Date(since).toISOString(), until: until === null ? null : new Date(until).toISOString(),
        limit: MAX_STATS_GAMES, minSchemaVersion: 2 })) {
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
