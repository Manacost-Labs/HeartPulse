export const ARENA_CLASS_LABELS = {
  ALL: 'Все классы',
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
} as const;

export type ArenaClassId = keyof typeof ARENA_CLASS_LABELS;

export const ARENA_CLASS_IDS = Object.keys(ARENA_CLASS_LABELS) as ArenaClassId[];

export type ArenaSynergyCard = {
  id: string;
  name: string;
  cost: number | null;
  type: string | null;
  rarity: string | null;
  deckWinRate: number | null;
  runs: number;
};

export type ArenaCombination = {
  cards: [ArenaSynergyCard, ArenaSynergyCard];
  observedRuns: number;
  expectedRuns: number;
  supportPercent: number;
  lift: number;
  score: number;
  confidence: 'high' | 'medium' | 'exploratory';
  forcedPackageShare: number;
};

export type ArenaRedraftCard = {
  card: ArenaSynergyCard;
  addedCopies: number;
  addedRuns: number;
  discardedCopies: number;
  discardedRuns: number;
  decisions: number;
  addShare: number;
  netCopies: number;
};

export type ArenaSynergyPayload = {
  schemaVersion: 1;
  generatedAt: string;
  selectedClass: ArenaClassId;
  source: {
    winningDecksFetchedAt: string | null;
    cardStatsFetchedAt: string | null;
  };
  cohort: {
    id: string;
    patchVersion: string | null;
    patchPublishedAt: string | null;
    poolFingerprint: string;
    from: string | null;
    to: string | null;
  };
  summary: {
    runsAvailable: number;
    runsAnalyzed: number;
    redraftRuns: number;
    recordCounts: Record<string, number>;
    warnings: string[];
  };
  availableClasses: Array<{
    id: ArenaClassId;
    label: string;
    runs: number;
  }>;
  methodology: {
    sampleLimit: number;
    minimumPairRuns: number;
    minimumLift: number;
    packageFilterShare: number;
    classStratified: boolean;
    note: string;
  };
  combinations: ArenaCombination[];
  redraft: ArenaRedraftCard[];
};
