export type LegendarySource = 'hsreplay' | 'firestone';

export interface LegendaryCard {
  cardId: string;
  name: string;
  cost?: number;
  type?: string;
  rarity?: string;
  classKey?: string;
  source?: 'hsreplay' | 'heartharena' | 'firestone';
  statsContext?: 'tierlist' | 'legendary';
  winrate?: number;
  deckWinrate?: number | null;
  pickRate?: number | null;
  playedWinrate?: number | null;
  inDecks?: number | null;
  arenaScore?: number | null;
  offerRate?: number | null;
  discardRate?: number | null;
  drawnWinrate?: number | null;
  mulliganWinrate?: number | null;
  keptRate?: number | null;
  avgCopies?: number | null;
  totalGames?: number | null;
  count?: number;
  imageHa?: string;
  imageRu?: string | null;
}

export interface LegendaryGroup {
  keyCard: LegendaryCard;
  cards: LegendaryCard[];
  winRate: number | null;
  pickRate?: number | null;
  /** Sample behind the group's winrate; only the open layer carries it. */
  totalGames?: number | null;
  offerRate?: number | null;
  score?: number | null;
  byClass?: Record<string, {
    winRate: number | null;
    pickRate: number | null;
    offerRate?: number | null;
    score?: number | null;
  }>;
  classKey: string;
}

/** Which paid figures the source has at all: a flag, never a value. */
export interface LegendaryPaidMetrics { offerRate: boolean; score: boolean }

export interface LegendariesData {
  groups: LegendaryGroup[];
  updatedAt: string | null;
  source: string;
  sourceId?: LegendarySource;
  warning?: string;
  paidMetrics?: LegendaryPaidMetrics;
}
