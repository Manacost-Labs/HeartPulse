export type BattlegroundHeroMode = 'solo' | 'duos';

export type BattlegroundHeroMmr =
  | 'TOP_50_PERCENT'
  | 'TOP_20_PERCENT'
  | 'TOP_5_PERCENT'
  | 'TOP_1_PERCENT';

export type BattlegroundHeroSortKey = 'tier' | 'pickRate' | 'averagePlace';

export type BattlegroundHeroSortDirection = 'asc' | 'desc';

export interface BattlegroundHeroRelatedCard {
  dbf?: number | null;
  name: string;
  text?: string;
  image?: string | null;
  imageGold?: string | null;
  cropImage?: string | null;
}

export interface BattlegroundHeroTierEntry {
  name: string;
  originalName?: string;
  popularity?: string;
  averagePlace?: string;
  image: string;
  dbfId?: number;
  placementDistribution?: string[];
  bestComposition?: string;
  bestCompositionId?: number;
  sourceId?: string;
  heroPower?: BattlegroundHeroRelatedCard | null;
}

export interface BattlegroundHeroTierSection {
  tier: string;
  title?: string;
  heroes: BattlegroundHeroTierEntry[];
}
