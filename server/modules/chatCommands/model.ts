import { encode, type FormatType } from '@firestone-hs/deckstrings';
import type { LadderRank, PlayerGame } from '../playerGames/public.js';

/** Nightbot shows at most 400 characters of `$(urlfetch)`; StreamElements' `${customapi}` is cut there too. */
export const CHAT_MAX_LENGTH = 400;
export const CHAT_COMMANDS = ['deck', 'winrate', 'rank', 'mmr'] as const;
export type ChatCommand = typeof CHAT_COMMANDS[number];
export type ChatLanguage = 'ru' | 'en';

/** The stream's games: those that started within this window before now. */
export const CHAT_SESSION_MS = 12 * 60 * 60_000;
/** The app's longest stream delay (`AppSettings.MaxTwitchDelaySeconds`): the delay assumed when the app sent none. */
export const CHAT_MAX_DELAY_SECONDS = 600;

/** The deck part of the app's Twitch state (docs/specs/twitch-extension.md), as the chat reads it. */
export type ChatDeck = {
  name: string | null;
  /** Hero card id (`HERO_08`); null when the app did not know it. */
  hero: string | null;
  format: string;
  cards: Array<{ dbf: number; total: number }>;
};

const FORMAT_TYPE: Record<string, FormatType> = { wild: 1, standard: 2, classic: 3, twist: 4 };

/**
 * A deckstring from the cards the app sent (dbf ids and copies) and the hero's dbf id; null without a hero or cards.
 * The app sends the remaining copies too, but `total` is the deck as built.
 */
export function deckstringOf(deck: ChatDeck, heroDbfId: number | null): string | null {
  if (!heroDbfId || deck.cards.length === 0) return null;
  const counts = new Map<number, number>();
  for (const card of deck.cards) if (card.dbf > 0 && card.total > 0) counts.set(card.dbf, (counts.get(card.dbf) ?? 0) + card.total);
  if (counts.size === 0) return null;
  try {
    return encode({ cards: [...counts], heroes: [heroDbfId], format: FORMAT_TYPE[deck.format] ?? FORMAT_TYPE.standard });
  } catch {
    return null;
  }
}

/** One chat line: no line breaks, no control characters, within the bots' limit. */
export function chatLine(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > CHAT_MAX_LENGTH ? `${flat.slice(0, CHAT_MAX_LENGTH - 1)}…` : flat;
}

const LEAGUES: Record<ChatLanguage, string[]> = {
  ru: ['Бронза', 'Серебро', 'Золото', 'Платина', 'Алмаз'],
  en: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
};

/** `starLevel` 1 = Bronze 10 … 50 = Diamond 1, 51 = Legend, as the game client counts it. */
export function rankText(rank: LadderRank, lang: ChatLanguage): string {
  if (rank.starLevel >= 51) {
    const legend = lang === 'ru' ? 'Легенда' : 'Legend';
    return rank.legendRank ? `${legend} ${rank.legendRank}` : legend;
  }
  const league = LEAGUES[lang][Math.floor((rank.starLevel - 1) / 10)] ?? LEAGUES[lang][0];
  return `${league} ${10 - ((rank.starLevel - 1) % 10)}`;
}

const T = {
  ru: {
    notSharing: 'Hearthpulse: стример сейчас не показывает колоду.',
    noDeck: 'Hearthpulse: колода сейчас не выбрана.',
    deck: (name: string, code: string) => `${name ? `${name}: ` : 'Колода: '}${code}`,
    deckNoCode: (name: string) => `${name || 'Колода'} — код колоды пока недоступен.`,
    statsHidden: 'Hearthpulse: стример не показывает статистику.',
    noGames: 'Hearthpulse: сегодня ещё нет игр.',
    record: (wins: number, losses: number, rate: number) => `${wins}–${losses} (${rate}%)`,
    constructed: 'Сегодня',
    bg: (games: number, place: string) => `Поля сражений: ${games} игр, среднее место ${place}`,
    noRank: 'Hearthpulse: ранга за последние игры нет.',
    rank: (rank: string, format: string) => `Ранг: ${rank} (${format})`,
    noMmr: 'Hearthpulse: рейтинга Полей сражений за последние игры нет.',
    mmr: (rating: number, delta: string) => `MMR Полей сражений: ${rating}${delta ? ` (${delta} сегодня)` : ''}`,
    standard: 'Стандарт', wild: 'Вольный',
  },
  en: {
    notSharing: 'Hearthpulse: the streamer is not showing the deck right now.',
    noDeck: 'Hearthpulse: no deck selected right now.',
    deck: (name: string, code: string) => `${name ? `${name}: ` : 'Deck: '}${code}`,
    deckNoCode: (name: string) => `${name || 'Deck'} — the deck code is not available yet.`,
    statsHidden: 'Hearthpulse: the streamer does not share stats.',
    noGames: 'Hearthpulse: no games today yet.',
    record: (wins: number, losses: number, rate: number) => `${wins}–${losses} (${rate}%)`,
    constructed: 'Today',
    bg: (games: number, place: string) => `Battlegrounds: ${games} games, average place ${place}`,
    noRank: 'Hearthpulse: no rank in recent games.',
    rank: (rank: string, format: string) => `Rank: ${rank} (${format})`,
    noMmr: 'Hearthpulse: no Battlegrounds rating in recent games.',
    mmr: (rating: number, delta: string) => `Battlegrounds MMR: ${rating}${delta ? ` (${delta} today)` : ''}`,
    standard: 'Standard', wild: 'Wild',
  },
} as const;

export const chatTexts = (lang: ChatLanguage) => T[lang];

/** `!deck`: the deck's name and code from the delayed snapshot the app sent for the extension. */
export function deckReply(deck: ChatDeck | null, code: string | null, lang: ChatLanguage): string {
  const text = T[lang];
  if (!deck) return text.noDeck;
  const name = deck.name ? deck.name.slice(0, 60) : '';
  return chatLine(code ? text.deck(name, code) : text.deckNoCode(name));
}

/** Games that are over by `visibleUntil` (now minus the stream delay), so chat never runs ahead of the stream. */
export function visibleGames(games: readonly PlayerGame[], visibleUntil: number): PlayerGame[] {
  return games.filter(game => game.startedAt + game.durationSeconds * 1000 <= visibleUntil);
}

/** `!winrate`: today's record in Constructed and Arena, and Battlegrounds by places. */
export function winrateReply(games: readonly PlayerGame[], lang: ChatLanguage): string {
  const text = T[lang];
  const ladder = games.filter(game => game.mode !== 'battlegrounds');
  const bg = games.filter(game => game.mode === 'battlegrounds');
  const parts: string[] = [];
  const wins = ladder.filter(game => game.result === 'win').length;
  const losses = ladder.filter(game => game.result === 'loss').length;
  if (wins + losses > 0) parts.push(`${text.constructed}: ${text.record(wins, losses, Math.round((wins / (wins + losses)) * 100))}`);
  if (bg.length > 0) {
    const places = bg.map(game => (game.mode === 'battlegrounds' ? game.battlegrounds.placement : 0));
    const average = places.reduce((sum, place) => sum + place, 0) / places.length;
    parts.push(text.bg(bg.length, average.toFixed(1)));
  }
  return parts.length ? chatLine(parts.join(' · ')) : text.noGames;
}

/** `!rank`: the ladder rank after the newest visible ranked Constructed game. */
export function rankReply(games: readonly PlayerGame[], lang: ChatLanguage): string {
  const text = T[lang];
  for (let index = games.length - 1; index >= 0; index -= 1) {
    const game = games[index];
    if ((game.mode === 'standard' || game.mode === 'wild') && game.constructed.ranked && game.constructed.rankAfter) {
      return chatLine(text.rank(rankText(game.constructed.rankAfter, lang), game.mode === 'wild' ? text.wild : text.standard));
    }
  }
  return text.noRank;
}

/** `!mmr`: the Battlegrounds rating after the newest visible game, with the change over the stream's games of that queue. */
export function mmrReply(games: readonly PlayerGame[], lang: ChatLanguage): string {
  const text = T[lang];
  const rated = games.filter((game): game is Extract<PlayerGame, { mode: 'battlegrounds' }> =>
    game.mode === 'battlegrounds' && game.battlegrounds.ratingAfter !== null);
  const last = rated.at(-1);
  if (!last) return text.noMmr;
  const first = rated.find(game => game.battlegrounds.duos === last.battlegrounds.duos && game.battlegrounds.ratingBefore !== null);
  const delta = first ? (last.battlegrounds.ratingAfter as number) - (first.battlegrounds.ratingBefore as number) : 0;
  return chatLine(text.mmr(last.battlegrounds.ratingAfter as number, delta ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}` : ''));
}
