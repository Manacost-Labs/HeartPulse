import { ARENA_CLASS_LABELS } from '@/shared/arenaSynergyContract';

export type PublicYearReview = {
  year: number;
  games: number;
  hours: number;
  modes: { battlegrounds: number; standard: number; wild: number; arena: number };
  wins: number;
  winRate: number | null;
  bestStreak: number;
  bestMonth: { month: number; games: number } | null;
  favouriteClass: { playerClass: string; label: string; games: number } | null;
  favouriteDeck: { title: string; deckCode: string | null; games: number; wins: number } | null;
  topCards: Array<{ cardId: string; name: string; games: number }>;
  battlegrounds: { games: number; favouriteHero: { cardId: string; name: string; games: number } | null; top4Rate: number | null;
    averagePlacement: number | null; bestRating: number | null };
};

export const PROFILE_ID = /^[1-9][0-9]{0,9}$/;
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export const monthName = (month: number) => MONTHS[month - 1] ?? '';
export const className = (playerClass: string) => (ARENA_CLASS_LABELS as Record<string, string>)[playerClass] ?? '';

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const maybe = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const obj = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

/** Copies only the contract's fields of `GET /api/profiles/:id/year/:year`; an extra field never renders. Exported for tests. */
export function readYearReview(value: unknown): PublicYearReview | null {
  const body = obj(value);
  if (!body || !Number.isInteger(body.year) || typeof body.games !== 'number') return null;
  const modes = obj(body.modes) ?? {};
  const month = obj(body.bestMonth);
  const favClass = obj(body.favouriteClass);
  const deck = obj(body.favouriteDeck);
  const bg = obj(body.battlegrounds) ?? {};
  const hero = obj(bg.favouriteHero);
  const deckClass = deck ? className(str(deck.playerClass)) : '';
  return {
    year: body.year as number,
    games: num(body.games),
    hours: num(body.hours),
    modes: { battlegrounds: num(modes.battlegrounds), standard: num(modes.standard), wild: num(modes.wild), arena: num(modes.arena) },
    wins: num(body.wins),
    winRate: maybe(body.winRate),
    bestStreak: num(body.bestStreak),
    bestMonth: month ? { month: num(month.month), games: num(month.games) } : null,
    favouriteClass: favClass && className(str(favClass.playerClass))
      ? { playerClass: str(favClass.playerClass), label: className(str(favClass.playerClass)), games: num(favClass.games) } : null,
    favouriteDeck: deck ? {
      title: str(deck.archetype) || str(deck.name) || (deckClass ? `Колода: ${deckClass}` : 'Колода'),
      deckCode: str(deck.deckCode) || null, games: num(deck.games), wins: num(deck.wins),
    } : null,
    topCards: (Array.isArray(body.topCards) ? body.topCards : []).flatMap(item => {
      const card = obj(item);
      return card && str(card.cardId) && str(card.name) ? [{ cardId: str(card.cardId), name: str(card.name), games: num(card.games) }] : [];
    }),
    battlegrounds: {
      games: num(bg.games),
      favouriteHero: hero && str(hero.cardId) ? { cardId: str(hero.cardId), name: str(hero.name) || 'Герой', games: num(hero.games) } : null,
      top4Rate: maybe(bg.top4Rate), averagePlacement: maybe(bg.averagePlacement), bestRating: maybe(bg.bestRating),
    },
  };
}

export const percent = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);
