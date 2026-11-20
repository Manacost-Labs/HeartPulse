import type { ConstructedCardPeriod, ConstructedCardRank } from './serviceContracts.js';

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;

/**
 * The card statistics a guest gets (owner's decision 2026-11-18, #447): the base numbers of
 * the default slice — how often the card is played, how its decks win, how many copies they
 * hold — with their date and source. Mulligan and draw numbers, other ranks and periods and
 * the history stay paid and never leave the server for a guest.
 */
export const OPEN_CARD_STATISTICS = ['deckPopularity', 'deckWinrate', 'averageCopies'] as const;

/** The default slice of the card page (last day, Legend): the one open to everybody. */
export function isOpenStatisticsSlice(period: ConstructedCardPeriod, rank: ConstructedCardRank): boolean {
  return period === '1d' && rank === 'legend';
}

/**
 * A card as a guest receives it: the open statistics of the default slice field by field
 * (anything else, including a field added upstream later, is dropped), `null` for any other
 * slice, and decks without their winrate and score.
 */
export function guestConstructedCard(card: JsonRecord, period: ConstructedCardPeriod, rank: ConstructedCardRank): JsonRecord {
  const source = record(card.stats);
  const open = source && isOpenStatisticsSlice(period, rank)
    ? Object.fromEntries(OPEN_CARD_STATISTICS.map(field => [field, Number.isFinite(source[field]) ? source[field] : null]))
    : null;
  const stats = open && Object.values(open).some(value => value !== null) ? open : null;
  return {
    ...card,
    stats,
    statsUpdatedAt: stats ? card.statsUpdatedAt ?? null : null,
    statsSourceUrl: stats ? card.statsSourceUrl ?? null : null,
    decks: Array.isArray(card.decks)
      ? card.decks.map(deck => ({ ...record(deck), winrate: null, score: null }))
      : card.decks,
  };
}
