import type { CardFormat } from './cardRoute';
import type { PublicCardSeed } from './publicCardSeed';
import type { ConstructedCardPeriod, ConstructedCardRank } from './statisticsContext';

export type CardCatalogPayload<Card> = {
  format: CardFormat;
  rank: ConstructedCardRank;
  rankLabel?: string;
  rankRange?: string;
  period: { id: ConstructedCardPeriod; label: string; timeRange: string | null; patch: string | null };
  updatedAt: string | null;
  sourceUrl: string;
  statsAccess: boolean;
  cards: Card[];
  facets: { classes: string[]; sets: string[]; mechanics: string[]; types: string[]; rarities: string[] };
  mechanicTranslations?: Record<string, string>;
  mechanicOverrides?: Record<string, string>;
  warning?: string | null;
  dataStatus: 'fresh' | 'stale';
  partial: false;
  datasetVersion: string;
  pagination: { page: number; perPage: number; total: number; totalPages: number };
};

export type PublicCatalogCard = PublicCardSeed & {
  card_type: { slug: string | null; name_ru: string | null };
  multi_class: string[];
  mechanics: string[];
  referenced_tags: string[];
  minion_type: string | null;
  spell_school: string | null;
};

/** Only public catalog presentation crosses the server/client boundary. */
export type PublicCardCatalogSeed = CardCatalogPayload<PublicCatalogCard> & { statsAccess: false };
