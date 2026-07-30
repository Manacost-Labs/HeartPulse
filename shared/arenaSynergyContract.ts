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
  twelveWinRunQuality: number | null;
  runs: number;
};

export type ArenaCombination = {
  cards: [ArenaSynergyCard, ArenaSynergyCard];
  observedRuns: number;
  expectedRuns: number;
  supportPercent: number;
  lift: number;
  adjustedLift: number;
  expectedRunQuality: number;
  actualRunQuality: number;
  interactionDeltaPoints: number;
  adjustedInteractionDeltaPoints: number;
  interactionEvidence: {
    cardARuns: number;
    cardBRuns: number;
    pairRuns: number;
    cardAQuality: number;
    cardBQuality: number;
    classBaselineQuality: number;
  };
  interactionSignal: 'positive' | 'neutral' | 'negative' | 'insufficient';
  classification?: 'confirmed' | 'promising' | 'popular';
  controlledInteractionDeltaPoints?: number;
  matchedControl?: {
    pairRuns: number;
    controlRuns: number;
    pairRunQuality: number;
    controlRunQuality: number;
    deltaPoints: number;
    averageSimilarity: number;
    distinctDays: number;
    distinctPlayers: number;
    maxPlayerShare: number;
  };
  historicalWeight: number;
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

export type ArenaDataQualityCheck = {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  value: number | string | null;
  threshold: string;
  message: string;
};

export type ArenaDataQuality = {
  status: 'healthy' | 'warning' | 'blocked';
  score: number;
  metrics: {
    sourceRows: number;
    validRuns: number;
    invalidRuns: number;
    duplicateRuns: number;
    futureRuns: number;
    impossibleDecks: number;
    unknownCardReferences: number;
    totalCardReferences: number;
    maxClassShare: number;
    maxPlayerShare: number;
    sourceAgeHours: number | null;
    volumeRatioToPrevious: number | null;
  };
  checks: ArenaDataQualityCheck[];
};

export type ArenaCohortHistoryEntry = {
  id: string;
  patchVersion: string | null;
  poolFingerprint: string;
  from: string | null;
  to: string | null;
  generatedAt: string;
  runsAnalyzed: number;
  qualityStatus: ArenaDataQuality['status'];
  topCombination: {
    cards: [string, string];
    score: number;
    interactionDeltaPoints: number;
  } | null;
};

export type ArenaReliability = {
  sampleMode: 'stable' | 'warming' | 'insufficient' | 'last-known-good';
  servedFrom: 'live' | 'last-known-good';
  currentWeight: number;
  historicalWeight: number;
  stableAtRuns: number;
  previousCohortId: string | null;
  limitations: string[];
};

export type ArenaDraftCurveBucket = {
  id: 'LOW' | 'MID' | 'HIGH' | 'TOP';
  label: string;
  minimumCost: number;
  maximumCost: number | null;
  targetShare: number;
  targetCount: number;
};

export type ArenaDraftCardCopyProfile = {
  cardId: string;
  averageCopiesWhenPresent: number;
  multiCopyShare: number;
  maxObservedCopies: number;
};

export type ArenaDraftAdvisorContext = {
  status: 'shadow';
  deckSize: 30;
  minimumRuns: number;
  cards: ArenaSynergyCard[];
  copyProfiles?: ArenaDraftCardCopyProfile[];
  targetCurve: ArenaDraftCurveBucket[];
  pairCoverage: number;
  limitations: string[];
};

export type ArenaDraftStage = 'early' | 'middle' | 'late';

export type ArenaDraftWeights = {
  base: number;
  synergy: number;
  curve: number;
};

export type ArenaDraftModel = {
  id: 'arena-draft-advisor-v2';
  stage: ArenaDraftStage;
  weights: ArenaDraftWeights;
};

export type ArenaDraftSynergyEvidence = {
  partner: ArenaSynergyCard;
  classification: 'confirmed' | 'promising';
  deltaPoints: number;
  observedRuns: number;
  contribution: number;
};

export type ArenaDraftChoice = {
  rank: number;
  card: ArenaSynergyCard;
  score: number;
  components: {
    base: number;
    synergy: number;
    curve: number;
    redundancyPenalty: number;
  };
  confidence: 'high' | 'medium' | 'low';
  synergies: ArenaDraftSynergyEvidence[];
  reasons: string[];
  warnings: string[];
};

export type ArenaDraftAdvice = {
  model: ArenaDraftModel;
  choices: ArenaDraftChoice[];
  isCloseDecision: boolean;
  limitations: string[];
};

export type ArenaDraftAdviceRequest = {
  class: Exclude<ArenaClassId, 'ALL'>;
  deckCardIds: string[];
  candidateCardIds: [string, string, string];
};

export type ArenaDraftAdviceResponse = {
  schemaVersion: 1;
  generatedAt: string;
  selectedClass: Exclude<ArenaClassId, 'ALL'>;
  model: ArenaDraftModel;
  cohort: ArenaSynergyPayload['cohort'];
  sample: {
    runsAnalyzed: number;
    dataQualityStatus: ArenaDataQuality['status'];
    sampleMode: ArenaReliability['sampleMode'];
    servedFrom: ArenaReliability['servedFrom'];
  };
  advice: Omit<ArenaDraftAdvice, 'model'>;
};

export type ArenaSynergyPayload = {
  schemaVersion: 2;
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
    outcomeMetric: string;
    note: string;
  };
  dataQuality: ArenaDataQuality;
  reliability: ArenaReliability;
  draftAdvisor?: ArenaDraftAdvisorContext;
  history: ArenaCohortHistoryEntry[];
  combinations: ArenaCombination[];
  redraft: ArenaRedraftCard[];
};
