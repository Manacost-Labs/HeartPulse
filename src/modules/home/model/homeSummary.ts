interface ClassData {
  id: string;
  name: string;
  winrate: number;
}

interface HomeSummaryCard {
  cardId: string;
  name: string;
  imageHa?: string | null;
  imageRu?: string | null;
}

interface HomeSummaryLegendary extends HomeSummaryCard {
  winRate: number | null;
}

interface HomeBattlegroundSpotlight {
  dbfId: number;
  name: string;
  image: string;
  tier: string;
  avgPlacement: number;
  pickRate: number | null;
  placementDistribution: number[];
  heroPower?: { name?: string; text?: string; image?: string };
  updatedAt?: string | null;
  source?: string;
}

export interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
  battlegroundSpotlight?: HomeBattlegroundSpotlight | null;
  updatedAt?: Record<string, string | null>;
  sources?: Record<string, string>;
}

export const CLASS_ICON_BY_ID: Record<string, string> = {
  dk: '/class_icon/ui/deathknight-64.webp',
  'death-knight': '/class_icon/ui/deathknight-64.webp',
  dh: '/class_icon/ui/demonhunter-64.webp',
  'demon-hunter': '/class_icon/ui/demonhunter-64.webp',
  druid: '/class_icon/ui/druid-64.webp',
  hunter: '/class_icon/ui/hunter-64.webp',
  mage: '/class_icon/ui/mage-64.webp',
  paladin: '/class_icon/ui/paladin-64.webp',
  priest: '/class_icon/ui/priest-64.webp',
  rogue: '/class_icon/ui/rogue-64.webp',
  shaman: '/class_icon/ui/shaman-64.webp',
  warlock: '/class_icon/ui/warlock-64.webp',
  warrior: '/class_icon/ui/warrior-64.webp',
};
