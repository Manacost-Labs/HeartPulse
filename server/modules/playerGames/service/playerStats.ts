import type { PlayerGame, PlayerGameMode } from '../model/game.js';
import type { GlobalBattlegroundsHero, GlobalStatisticsSources } from '../model/globalSources.js';
import {
  MAX_STATS_GAMES,
  periodStart,
  type GlobalAvailability,
  type GlobalMmrFilter,
  type PlayerStats,
  type StatsPeriod,
} from '../model/stats.js';
import type { PlayerGameStore } from '../repository/gameStore.js';
import { buildArenaStats } from './arenaStats.js';
import { buildBattlegroundsStats, type BattlegroundsGlobal } from './battlegroundsStats.js';
import { buildConstructedStats } from './constructedStats.js';

const GLOBAL_TTL_MS = 60 * 60_000;
const GLOBAL_COMBAT_HEROES = 8;
const MAX_CACHE_ENTRIES = 64;

export type PlayerStatsQuery = { mode: PlayerGameMode; period: StatsPeriod; duos: boolean; mmr: GlobalMmrFilter };

export type PlayerStatsDependencies = {
  store: PlayerGameStore;
  global: GlobalStatisticsSources;
  /** Localized names for card ids; missing names fall back to the id on the page. */
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  now?: () => number;
};

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
 * Reads the account's newest games of one mode and period and aggregates them.
 * Paid global comparisons are requested only when the route says the viewer
 * may see them; a failing global source hides comparisons and never fails the page.
 */
export function createPlayerStatsService(dependencies: PlayerStatsDependencies) {
  const now = dependencies.now ?? Date.now;
  const cached = createTtlCache(now);
  const global = dependencies.global;

  async function attempt<T>(load: (() => Promise<T>) | undefined): Promise<T | null> {
    if (!load) return null;
    try {
      return await load();
    } catch {
      return null;
    }
  }

  async function battlegroundsGlobal(query: PlayerStatsQuery, heroCardIds: string[]): Promise<BattlegroundsGlobal | null> {
    const heroes = await attempt(global.battlegroundsHeroes && (() => cached(`bg:${query.duos}:${query.mmr}`,
      () => global.battlegroundsHeroes!({ duos: query.duos, mmr: query.mmr }))));
    if (!heroes?.length) return null;
    const byCard = new Map<string, GlobalBattlegroundsHero>(heroes.map(hero => [hero.cardId, hero]));
    const combat = new Map<string, Array<{ turn: number; winrate: number }>>();
    await Promise.all(heroCardIds.slice(0, GLOBAL_COMBAT_HEROES).map(async cardId => {
      const hero = byCard.get(cardId);
      if (!hero || !global.battlegroundsHeroCombat) return;
      const rounds = await attempt(() => cached(`bg-combat:${hero.heroId}:${query.duos}:${query.mmr}`,
        () => global.battlegroundsHeroCombat!(hero.heroId, { duos: query.duos, mmr: query.mmr })));
      if (rounds?.length) combat.set(cardId, rounds);
    }));
    return { heroes: byCard, combat };
  }

  async function names(stats: PlayerStats): Promise<Record<string, string>> {
    if (stats.mode !== 'battlegrounds' || !dependencies.resolveCardNames) return {};
    const ids = new Set<string>();
    for (const hero of stats.heroes) ids.add(hero.heroCardId);
    for (const point of stats.ratingSeries) {
      ids.add(point.heroCardId);
      if (point.anomalyCardId) ids.add(point.anomalyCardId);
      for (const minion of point.board) ids.add(minion.cardId);
    }
    return await attempt(() => dependencies.resolveCardNames!([...ids])) ?? {};
  }

  function availability(allowed: boolean, loaded: boolean): GlobalAvailability {
    if (!allowed) return 'subscription';
    return loaded ? 'available' : 'unavailable';
  }

  return {
    async load(userId: string, query: PlayerStatsQuery, globalAllowed: boolean): Promise<PlayerStats> {
      const games: PlayerGame[] = dependencies.store.loadGames(userId, {
        mode: query.mode,
        since: periodStart(query.period, now()),
        limit: MAX_STATS_GAMES,
      });
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
        const globalData = globalAllowed && arenaGames.length
          ? await attempt(global.arenaClasses && (() => cached('arena', () => global.arenaClasses!())))
          : null;
        return buildArenaStats(arenaGames, { period: query.period,
          global: { availability: availability(globalAllowed, Boolean(globalData?.length)) } }, globalData);
      }
      const format = query.mode;
      const constructedGames = games.filter((game): game is Extract<PlayerGame, { mode: 'standard' | 'wild' }> =>
        game.mode === format);
      const globalData = globalAllowed && constructedGames.length
        ? await attempt(global.constructedArchetypes && (() => cached(`meta:${format}`, () => global.constructedArchetypes!(format))))
        : null;
      return buildConstructedStats(constructedGames, { mode: format, period: query.period,
        global: { availability: availability(globalAllowed, Boolean(globalData?.length)) } }, globalData);
    },
  };
}

export type PlayerStatsService = ReturnType<typeof createPlayerStatsService>;
