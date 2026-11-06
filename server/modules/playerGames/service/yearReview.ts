import { decode } from '@firestone-hs/deckstrings';
import type { HearthstoneClass, PlayerGame } from '../model/game.js';

/** Cards and heroes the review lists; enough for one screen and one share image. */
const TOP_CARDS = 5;

export type YearReview = {
  year: number;
  games: number;
  hours: number;
  /** Games per mode of the year. */
  modes: { battlegrounds: number; standard: number; wild: number; arena: number };
  /** Constructed and Arena games: wins and the share of wins (ties are not wins). */
  wins: number;
  winRate: number | null;
  bestStreak: number;
  bestMonth: { month: number; games: number } | null;
  favouriteClass: { playerClass: HearthstoneClass; games: number } | null;
  favouriteDeck: { name: string | null; archetype: string | null; playerClass: HearthstoneClass; deckCode: string | null; games: number; wins: number } | null;
  /** Cards of the decks played most, by the games they were in; card ids and names filled by the caller. */
  topCards: Array<{ dbfId: number; cardId: string | null; name: string | null; games: number }>;
  battlegrounds: {
    games: number;
    favouriteHero: { cardId: string; name: string | null; games: number } | null;
    /** Top-half finishes (top 4 solo, top 2 Duos) of all Battlegrounds games. */
    top4Rate: number | null;
    averagePlacement: number | null;
    bestRating: number | null;
  };
};

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);

function most<K>(counts: Map<K, number>): [K, number] | null {
  let best: [K, number] | null = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  return best;
}

function add<K>(counts: Map<K, number>, key: K, by = 1) {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

function deckCardDbfIds(deckCode: string): number[] {
  try {
    return decode(deckCode).cards.map(([dbfId]) => dbfId);
  } catch {
    return [];
  }
}

/**
 * The year in review (Итоги года) of one account from its tracker games: every game that started in `year` (UTC).
 * Pure: card ids and names of the top cards and the hero are filled by the caller.
 */
export function buildYearReview(games: readonly PlayerGame[], year: number): YearReview {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const played = games.filter(game => game.startedAt >= start && game.startedAt < end).sort((left, right) => left.startedAt - right.startedAt);

  const modes = { battlegrounds: 0, standard: 0, wild: 0, arena: 0 };
  const months = new Map<number, number>();
  const classes = new Map<HearthstoneClass, number>();
  const decks = new Map<string, { name: string | null; archetype: string | null; playerClass: HearthstoneClass; deckCode: string | null; games: number; wins: number }>();
  const deckCards = new Map<number, number>();
  const heroes = new Map<string, number>();
  let seconds = 0;
  let wins = 0;
  let decided = 0;
  let streak = 0;
  let bestStreak = 0;
  let bgTop = 0;
  let bgPlacements = 0;
  let bestRating: number | null = null;

  for (const game of played) {
    modes[game.mode] += 1;
    seconds += game.durationSeconds;
    add(months, new Date(game.startedAt).getUTCMonth() + 1);
    streak = game.result === 'win' ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
    if (game.mode === 'battlegrounds') {
      const detail = game.battlegrounds;
      add(heroes, detail.heroCardId);
      if (game.result === 'win') bgTop += 1;
      bgPlacements += detail.placement;
      if (detail.ratingAfter !== null) bestRating = Math.max(bestRating ?? 0, detail.ratingAfter);
      continue;
    }
    const detail = game.mode === 'arena' ? game.arena : game.constructed;
    add(classes, detail.playerClass);
    if (game.result !== 'tie') decided += 1;
    if (game.result === 'win') wins += 1;
    if (game.mode === 'arena') continue;
    const constructed = game.constructed;
    const key = constructed.deckCode ?? `${constructed.playerClass}|${constructed.deckName ?? ''}|${constructed.archetype ?? ''}`;
    const deck = decks.get(key) ?? { name: constructed.deckName, archetype: constructed.archetype, playerClass: constructed.playerClass,
      deckCode: constructed.deckCode, games: 0, wins: 0 };
    deck.games += 1;
    if (game.result === 'win') deck.wins += 1;
    decks.set(key, deck);
    if (constructed.deckCode) for (const dbfId of new Set(deckCardDbfIds(constructed.deckCode))) add(deckCards, dbfId);
  }

  const topDbf = [...deckCards].sort((left, right) => right[1] - left[1]).slice(0, TOP_CARDS);
  const favouriteClass = most(classes);
  const favouriteDeck = [...decks.values()].sort((left, right) => right.games - left.games)[0] ?? null;
  const month = most(months);
  const hero = most(heroes);
  return {
    year,
    games: played.length,
    hours: Math.round((seconds / 3600) * 10) / 10,
    modes,
    wins,
    winRate: ratio(wins, decided),
    bestStreak,
    bestMonth: month ? { month: month[0], games: month[1] } : null,
    favouriteClass: favouriteClass ? { playerClass: favouriteClass[0], games: favouriteClass[1] } : null,
    favouriteDeck,
    topCards: topDbf.map(([dbfId, count]) => ({ dbfId, cardId: null, name: null, games: count })),
    battlegrounds: {
      games: modes.battlegrounds,
      favouriteHero: hero ? { cardId: hero[0], name: null, games: hero[1] } : null,
      top4Rate: ratio(bgTop, modes.battlegrounds),
      averagePlacement: modes.battlegrounds ? Math.round((bgPlacements / modes.battlegrounds) * 100) / 100 : null,
      bestRating,
    },
  };
}

/**
 * When the review of `year` opens: `YEAR_REVIEW_ENABLED=1` forces it open (testing), `0` closed; otherwise from
 * December 1 of that year (UTC) on. A future year is never open.
 */
export function yearReviewOpen(year: number, now: number, flag: string | undefined): boolean {
  if (year > new Date(now).getUTCFullYear()) return false;
  if (flag === '0') return false;
  if (flag === '1') return true;
  return now >= Date.UTC(year, 11, 1);
}
