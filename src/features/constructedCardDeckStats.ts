import { percent, type ConstructedDeck } from './constructedCardRecord';

export type CardDeckStats = {
  winRate: number | null;
  stats: Array<{ label: string; value: string }>;
  /** The source's own note when it is not a plain win–loss record. */
  note: string | null;
};

const RECORD = /^\s*(\d{1,6})\s*[-–:]\s*(\d{1,6})\s*$/;

/**
 * The numbers of a deck with the card. A deck from a player's list has no win
 * rate, only its record («22-10»): the win rate and the number of games are
 * read from it. A subscriber-only figure that a guest does not receive stays a dash.
 */
export function cardDeckStats(deck: Pick<ConstructedDeck, 'winrate' | 'score'>): CardDeckStats {
  const record = deck.score ? RECORD.exec(deck.score) : null;
  const wins = record ? Number(record[1]) : 0;
  const losses = record ? Number(record[2]) : 0;
  const games = wins + losses;
  const winRate = deck.winrate ?? (games ? Math.round((wins / games) * 1000) / 10 : null);
  const stats = [{ label: 'Винрейт', value: winRate === null ? '—' : percent(winRate) }];
  if (record) stats.push({ label: 'Игры', value: `${games} (${wins}–${losses})` });
  return { winRate, stats, note: deck.score && !record ? deck.score : null };
}
