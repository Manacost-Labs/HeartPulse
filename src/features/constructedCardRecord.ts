import { constructedCardPath, type PublicCardSeed, type PublicCardCatalogSeed } from '../modules/constructedCards/public';
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
    animated?: Record<string, string | null>;
  };
  mechanics?: string[];
  referenced_tags?: string[];
  wiki_page?: { title?: string | null; url?: string | null };
  stats: CardStats | null;
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

export type StandardCardsProps = {
  initialCard?: PublicCardSeed;
  initialCatalog?: PublicCardCatalogSeed;
  initialSearch?: string;
  currentPath: string;
  navigatePath: (path: string) => void;
  statsAccess: boolean;
  statsAccessLoading: boolean;
  authUser: object | null;
  onRefreshSubscription: () => Promise<unknown>;
};

export function cardName(card: CardRecord): string {
  return card.name?.ru || card.name?.en || card.card_id;
}

export function mechanicLabel(value: string, translations?: Record<string, string>): string {
  return translateConstructedMechanic(value, translations);
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Нет данных' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

export function number(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Нет данных' : value.toLocaleString('ru-RU');
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
