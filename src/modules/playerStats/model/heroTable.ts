import type { HeroStats } from './stats';

export const HERO_MIN_GAMES = [1, 3, 5, 10] as const;

/** Personal pick rate: picked when offered, only over games whose client reported the hero choice. */
export function heroPickRate(hero: HeroStats): number | null {
  return hero.offered > 0 ? Math.round((hero.picked / hero.offered) * 1000) / 10 : null;
}

/** Heroes with at least `minGames` games, most played first, as HSReplay's default order. */
export function visibleHeroes(heroes: readonly HeroStats[], minGames: number): HeroStats[] {
  return heroes
    .filter(hero => hero.games >= minGames)
    .sort((left, right) => right.games - left.games || left.averagePlacement - right.averagePlacement);
}
