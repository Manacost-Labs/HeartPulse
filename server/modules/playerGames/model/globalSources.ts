import type { HearthstoneClass } from './game.js';
import type { GlobalMmrFilter } from './stats.js';

export type GlobalBattlegroundsHero = {
  /** The provider's hero id (dbfId), needed for its per-hero detail. */
  heroId: string;
  cardId: string;
  averagePlacement: number | null;
  pickRatePercent: number | null;
  placementPercent: number[] | null;
};

export type GlobalArchetype = {
  archetype: string;
  /** The site's Russian name, which a tracker may report instead of the English one. */
  label: string | null;
  playerClass: HearthstoneClass | null;
  winrate: number | null;
  games: number;
};

/**
 * Global statistics the site already publishes. Every source is optional and
 * may throw; the statistics then mark comparisons `unavailable` instead of failing.
 */
export type GlobalStatisticsSources = {
  battlegroundsHeroes?: (query: { duos: boolean; mmr: GlobalMmrFilter }) => Promise<GlobalBattlegroundsHero[]>;
  battlegroundsHeroCombat?: (heroId: string, query: { duos: boolean; mmr: GlobalMmrFilter })
    => Promise<Array<{ turn: number; winrate: number }>>;
  constructedArchetypes?: (format: 'standard' | 'wild') => Promise<GlobalArchetype[]>;
};

/** Upper-case letters only, so `death-knight`, `deathknight` and `DEATHKNIGHT` compare equal. */
export function classKey(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

/** Archetype names from the tracker and the meta provider differ in case, spacing and punctuation. */
export function archetypeKey(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase('en-US').replace(/[^a-z0-9а-яё]/g, '');
}
