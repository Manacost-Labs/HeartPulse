import { constructedCardPath, type PublicCardSeed, type PublicCardCatalogSeed, type PublicCardOpenStats } from '../modules/constructedCards/public';
import type { ConstructedCardFormat } from './constructedCardCatalogModel';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import {
  constructedCardStatsUrl,
  type ConstructedCardPeriod,
  type ConstructedCardRank,
} from './constructedCardPeriods';
import { translateConstructedMechanic } from '../../shared/constructedCardTranslations';

// Card records, props and formatting shared by the catalog (StandardCards.tsx)
// and the card page (StandardCardDetail.tsx), which ship as separate bundles.

export type CardFormat = ConstructedCardFormat;

export type CardStats = {
  deckPopularity: number | null;
  deckWinrate: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayed: number | null;
  winrateWhenDrawn: number | null;
  keepPercentage: number | null;
  openingHandWinrate: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

/** What a guest's card carries: the three open numbers of the default slice, nothing else. */
export type OpenCardStats = PublicCardOpenStats;

export type CardRecord = {
  card_id: string;
  dbf: number | null;
  slug?: string;
  formats?: Array<{ slug: string; name_ru?: string; name_en?: string }>;
  name?: { ru?: string | null; en?: string | null };
  text?: { ru?: string | null; en?: string | null };
  flavor?: { ru?: string | null; en?: string | null };
  card_set?: string | null;
  card_type?: { slug?: string | null; name_ru?: string | null };
  rarity?: string | null;
  class?: string | null;
  multi_class?: string[];
  minion_type?: string | null;
  spell_school?: string | null;
  mana_cost?: number | null;
  attack?: number | null;
  health?: number | null;
  durability?: number | null;
  armor?: number | null;
  artist?: string | null;
  images?: {
    card?: string | null;
    golden?: string | null;
    signature?: string | null;
    diamond?: string | null;
    crop?: string | null;
    tile?: string | null;
    horizontal?: string | null;
    animated?: Record<string, string | null>;
  };
  mechanics?: string[];
  referenced_tags?: string[];
  wiki_page?: { title?: string | null; url?: string | null };
  /** Every field for a subscriber; a guest's card carries only the three open ones (`OpenCardStats`). */
  stats: Partial<CardStats> | null;
  statsUpdatedAt?: string | null;
  statsSourceUrl?: string | null;
  catalogPending?: boolean;
  wiki?: Record<string, any>;
  mechanicTranslations?: Record<string, string>;
  mechanicOverrides?: Record<string, string>;
  decks?: ConstructedDeck[];
  related_cards_localized?: unknown;
};

export type ConstructedDeck = {
  id: string;
  title: string;
  archetype?: string | null;
  archetypeLabel?: string | null;
  className?: string | null;
  deckCode: string;
  source?: string | null;
  sourceUrl?: string | null;
  winrate?: number | null;
  score?: string | null;
  updatedAt?: string | null;
};

/** The numbers the anonymous card API opens for the open slice (`OPEN_STATISTICS_SLICE`); every other one is paid. */
export const OPEN_CARD_STATISTICS = ['deckPopularity', 'deckWinrate', 'averageCopies'] as const;

/**
 * What a viewer without confirmed access may see of a loaded card: the open numbers only when the loaded statistics
 * are the open slice and that is the slice shown (`openSliceShown`), and the decks without their winrate and score.
 * The card page derives it in render, so a refusal or a withdrawn access drops the paid numbers in the same frame.
 */
export function openPartOfCard(card: CardRecord, openSliceShown: boolean): CardRecord {
  const stats = openSliceShown && card.stats
    ? Object.fromEntries(OPEN_CARD_STATISTICS.map(id => [id, card.stats?.[id] ?? null])) as Partial<CardStats>
    : null;
  return {
    ...card,
    stats,
    statsUpdatedAt: stats ? card.statsUpdatedAt ?? null : null,
    statsSourceUrl: stats ? card.statsSourceUrl ?? null : null,
    decks: Array.isArray(card.decks) ? card.decks.map(deck => ({ ...deck, winrate: null, score: null })) : card.decks,
  };
}

export type StandardCardsProps = {
  initialCard?: PublicCardSeed;
  initialCatalog?: PublicCardCatalogSeed;
  initialSearch?: string;
  currentPath: string;
  navigatePath: (path: string) => void;
  statsAccess: boolean;
  statsAccessLoading: boolean;
  /** The access check failed: neither a grant nor a refusal, so no lock. */
  statsAccessUnavailable?: boolean;
  authUser: object | null;
  onRefreshSubscription: () => Promise<unknown>;
};

export function cardName(card: CardRecord): string {
  return card.name?.ru || card.name?.en || card.card_id;
}

export function mechanicLabel(value: string, translations?: Record<string, string>): string {
  return translateConstructedMechanic(value, translations);
}

/**
 * Digits are grouped here, not by the locale: ICU's ru-RU separator is a narrow
 * no-break space (U+202F) in some engines, and the display font has no glyph
 * for it, so «2 697» fell apart. A no-break space also keeps the number whole
 * at a line end.
 */
function groupThousands(formatted: string): string {
  return formatted.replace(/\d+/, digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'));
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'Нет данных'
    : `${groupThousands(value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false }))}%`;
}

export function number(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Нет данных' : groupThousands(value.toLocaleString('ru-RU', { useGrouping: false }));
}

export function cardPath(format: CardFormat, card: CardRecord): string {
  return canonicalPagePath(constructedCardPath(format, card.card_id));
}

/** A card page path in its canonical trailing-slash form, from the card id alone. */
export function canonicalCardIdPath(format: CardFormat, cardId: string): string {
  return canonicalPagePath(constructedCardPath(format, cardId));
}

export function navigateWithConstructedCardContext(
  navigatePath: (path: string) => void,
  pathname: string,
  period: ConstructedCardPeriod,
  rank: ConstructedCardRank,
  statsFormat?: CardFormat,
  defaultStatsFormat?: CardFormat,
): void {
  navigatePath(constructedCardStatsUrl(pathname, { period, rank, statsFormat, defaultStatsFormat },
    typeof window === 'undefined' ? '' : window.location.search));
}
