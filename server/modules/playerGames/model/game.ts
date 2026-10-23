export const PLAYER_GAME_MODES = ['battlegrounds', 'standard', 'wild', 'arena'] as const;
export type PlayerGameMode = typeof PLAYER_GAME_MODES[number];

export const HEARTHSTONE_CLASSES = [
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR',
] as const;
export type HearthstoneClass = typeof HEARTHSTONE_CLASSES[number];

export const BATTLEGROUNDS_RACES = [
  'BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC',
  'NAGA', 'PIRATE', 'QUILBOAR', 'UNDEAD',
] as const;

export const BATTLEGROUNDS_OFFER_KINDS = ['hero', 'discover', 'trinket', 'quest', 'reward', 'buddy', 'other'] as const;

export type GameResult = 'win' | 'loss' | 'tie';

export const PLAYER_GAME_SCHEMA_VERSION = 1;
export const MAX_GAMES_PER_BATCH = 50;
export const MAX_GAME_BYTES = 16 * 1024;
export const MAX_GAMES_PER_ACCOUNT = 50_000;

export type BoardMinion = { cardId: string; attack: number; health: number; golden: boolean };
export type CombatRound = {
  turn: number;
  result: GameResult;
  damageDealt: number;
  damageTaken: number;
  opponentHeroCardId: string | null;
};
export type BattlegroundsOffer = {
  turn: number;
  kind: typeof BATTLEGROUNDS_OFFER_KINDS[number];
  offered: string[];
  picked: string | null;
};

export type BattlegroundsDetail = {
  heroCardId: string;
  placement: number;
  duos: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  anomalyCardId: string | null;
  races: string[];
  tavernTier: number | null;
  finalBoard: BoardMinion[];
  combats: CombatRound[];
  heroOptions: string[];
  offers: BattlegroundsOffer[];
};

/** `starLevel` follows the game client: Bronze 10 = 1 … Diamond 1 = 50, Legend = 51. */
export type LadderRank = { starLevel: number; stars: number; legendRank: number | null };

export type ConstructedDetail = {
  ranked: boolean;
  playerClass: HearthstoneClass;
  opponentClass: HearthstoneClass;
  heroCardId: string | null;
  opponentHeroCardId: string | null;
  deckCode: string | null;
  deckName: string | null;
  archetype: string | null;
  opponentArchetype: string | null;
  wentFirst: boolean | null;
  rankBefore: LadderRank | null;
  rankAfter: LadderRank | null;
};

export type ArenaDetail = {
  runId: string;
  playerClass: HearthstoneClass;
  opponentClass: HearthstoneClass;
  gameNumber: number;
  winsBefore: number | null;
  lossesBefore: number | null;
  underground: boolean;
  wentFirst: boolean | null;
  deckCode: string | null;
};

type PlayerGameBase = {
  id: string;
  startedAt: number;
  durationSeconds: number;
  result: GameResult;
  turns: number | null;
  client: { name: string; version: string };
};

/** A validated upload, normalized so equal content always serializes equally. */
export type PlayerGame =
  | PlayerGameBase & { mode: 'battlegrounds'; battlegrounds: BattlegroundsDetail }
  | PlayerGameBase & { mode: 'standard' | 'wild'; constructed: ConstructedDetail }
  | PlayerGameBase & { mode: 'arena'; arena: ArenaDetail };

export type IngestStatus = 'created' | 'updated' | 'unchanged';
export type RejectionCode = 'INVALID_GAME' | 'UNSUPPORTED_MODE' | 'GAME_TOO_LARGE' | 'DUPLICATE_ID' | 'QUOTA_EXCEEDED';
export type IngestResult =
  | { id: string; status: IngestStatus }
  | { id: string; status: 'rejected'; code: RejectionCode; field?: string };

/** Battlegrounds wins are a top half finish: top 4 solo, top 2 in Duos. */
export function battlegroundsResult(placement: number, duos: boolean): GameResult {
  return placement <= (duos ? 2 : 4) ? 'win' : 'loss';
}

/** One comparable ladder value: four steps per star level, so a gained star always counts. */
export function ladderValue(rank: LadderRank | null): number | null {
  return rank ? rank.starLevel * 4 + rank.stars : null;
}
