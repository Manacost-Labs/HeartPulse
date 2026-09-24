export type TierlistSource = 'hsreplay' | 'heartharena' | 'firestone';

export const TIERLIST_SOURCES: readonly TierlistSource[] = ['hsreplay', 'heartharena', 'firestone'];

export interface CardLookup {
  cost?: number;
  attack?: number;
  health?: number;
  type?: string;
  imageHa: string;
  imageRu: string | null;
  rarityDb?: string;
}

export interface TierCard {
  name: string;
  score: number;
  rarity: string;
  cardId: string;
  classKey: string;
  source?: TierlistSource;
  statsContext?: 'tierlist' | 'legendary';
  winrate?: number;
  deckWinrate?: number | null;
  pickRate?: number | null;
  playedWinrate?: number | null;
  inDecks?: number | null;
  totalGames?: number | null;
  arenaScore?: number | null;
  offerRate?: number | null;
  discardRate?: number | null;
  drawnWinrate?: number | null;
  mulliganWinrate?: number | null;
  keptRate?: number | null;
  avgCopies?: number | null;
}

export interface TierSection {
  tier: string;
  label: string;
  description: string;
  cards: TierCard[];
}

export interface ClassSection {
  id: string;
  name: string;
  color: string;
  textDark: boolean;
  classPosition?: string;
  tiers: TierSection[];
  totalCards: number;
}

export interface CardData extends TierCard, Partial<CardLookup> {}

export interface TierlistData {
  sections: ClassSection[];
  cards: Record<string, CardLookup>;
  classPositions?: Record<string, string>;
  updatedAt: string | null;
  source: string;
  warning?: string;
  data_phase?: string;
  provisional?: boolean;
  accepted_rows?: number;
  baseline_rows?: number;
  coverage_ratio?: number;
  minimum_sample?: number;
  patch_window?: string | Record<string, unknown>;
}
