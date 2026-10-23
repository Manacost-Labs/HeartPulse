/**
 * Client view of `GET /api/account/game-stats` (docs/specs/player-game-stats.md).
 * The server owns aggregation; these types only describe what it returns.
 */
export type PlayerStatsMode = 'battlegrounds' | 'standard' | 'wild' | 'arena';
export type StatsPeriod = 'all' | '7' | '30' | '90' | 'season';
export type GlobalMmrFilter = 'TOP_50_PERCENT' | 'TOP_20_PERCENT' | 'TOP_5_PERCENT' | 'TOP_1_PERCENT';
export type GlobalAvailability = 'available' | 'subscription' | 'unavailable';
export type HearthstoneClass = 'DEATHKNIGHT' | 'DEMONHUNTER' | 'DRUID' | 'HUNTER' | 'MAGE' | 'PALADIN'
  | 'PRIEST' | 'ROGUE' | 'SHAMAN' | 'WARLOCK' | 'WARRIOR';

export type WinLoss = { games: number; wins: number };
export type BoardMinion = { cardId: string; attack: number; health: number; golden: boolean };
export type LadderRank = { starLevel: number; stars: number; legendRank: number | null };

export type RatingPoint = {
  id: string;
  startedAt: number;
  heroCardId: string;
  placement: number;
  rating: number;
  delta: number | null;
  anomalyCardId: string | null;
  tavernTier: number | null;
  board: BoardMinion[];
};

export type HeroStats = {
  heroCardId: string;
  games: number;
  netRating: number | null;
  averagePlacement: number;
  placements: number[];
  combat: Array<{ turn: number; winrate: number; rounds: number }>;
  offered: number;
  picked: number;
  global: {
    averagePlacement: number | null;
    pickRatePercent: number | null;
    placementPercent: number[] | null;
    combat: Array<{ turn: number; winrate: number }> | null;
  } | null;
};

export type BattlegroundsStats = {
  mode: 'battlegrounds';
  period: StatsPeriod;
  duos: boolean;
  games: number;
  summary: {
    highestRating: number | null;
    currentRating: number | null;
    ratingChange: number | null;
    averagePlacement: number | null;
    placements: number[];
    top4Rate: number | null;
    firstPlaces: number;
    timePlayedSeconds: number;
  };
  ratingSeries: RatingPoint[];
  heroes: HeroStats[];
  global: { availability: GlobalAvailability; mmr: GlobalMmrFilter };
  cards: Record<string, string>;
};

export type ConstructedStats = {
  mode: 'standard' | 'wild';
  period: StatsPeriod;
  games: number;
  summary: {
    wins: number;
    losses: number;
    ties: number;
    winrate: number | null;
    rankedGames: number;
    averageDurationSeconds: number | null;
    averageTurns: number | null;
    timePlayedSeconds: number;
    currentRank: LadderRank | null;
    bestRank: LadderRank | null;
    first: WinLoss;
    coin: WinLoss;
  };
  rankSeries: Array<{ id: string; startedAt: number; result: string; playerClass: HearthstoneClass; rank: LadderRank; value: number }>;
  decks: Array<WinLoss & { key: string; deckCode: string | null; deckName: string | null; archetype: string | null;
    playerClass: HearthstoneClass; lastPlayedAt: number }>;
  archetypes: Array<WinLoss & { archetype: string; playerClass: HearthstoneClass; globalWinrate: number | null }>;
  classes: Array<WinLoss & { playerClass: HearthstoneClass; globalWinrate: number | null }>;
  opponentClasses: Array<WinLoss & { opponentClass: HearthstoneClass }>;
  matchups: Array<WinLoss & { playerClass: HearthstoneClass; opponentClass: HearthstoneClass }>;
  global: { availability: GlobalAvailability };
};

export type ArenaRun = {
  runId: string;
  playerClass: HearthstoneClass;
  wins: number;
  losses: number;
  games: number;
  startedAt: number;
  lastPlayedAt: number;
  complete: boolean;
  underground: boolean;
};

export type ArenaStats = {
  mode: 'arena';
  period: StatsPeriod;
  games: number;
  summary: {
    runs: number;
    averageWins: number | null;
    bestRun: ArenaRun | null;
    twelveWinRuns: number;
    wins: number;
    losses: number;
    gameWinrate: number | null;
    timePlayedSeconds: number;
  };
  runs: ArenaRun[];
  classes: Array<{ playerClass: HearthstoneClass; runs: number; averageWins: number; games: number; wins: number;
    globalWinrate: number | null; globalAverageWins: number | null }>;
  global: { availability: GlobalAvailability };
};

export type PlayerStats = BattlegroundsStats | ConstructedStats | ArenaStats;

export type PlayerStatsQuery = { mode: PlayerStatsMode; period: StatsPeriod; duos: boolean; mmr: GlobalMmrFilter };
