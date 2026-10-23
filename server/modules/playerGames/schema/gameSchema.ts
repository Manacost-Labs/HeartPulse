import {
  BATTLEGROUNDS_OFFER_KINDS,
  BATTLEGROUNDS_RACES,
  HEARTHSTONE_CLASSES,
  MAX_GAME_BYTES,
  PLAYER_GAME_MODES,
  battlegroundsResult,
  type ArenaDetail,
  type BattlegroundsDetail,
  type ConstructedDetail,
  type GameResult,
  type LadderRank,
  type PlayerGame,
  type RejectionCode,
} from '../model/game.js';
import {
  CLIENT_ID_PATTERN,
  GameFieldError,
  cardId,
  integer,
  isObject,
  list,
  object,
  oneOf,
  optionalBoolean,
  optionalCardId,
  optionalInteger,
  optionalText,
  pattern,
} from './fields.js';

const RESULTS: readonly GameResult[] = ['win', 'loss', 'tie'];
const EARLIEST_GAME_MS = Date.UTC(2014, 0, 1);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/;
const DECK_CODE = /^[A-Za-z0-9+/=_-]{4,256}$/;

export type GameValidation =
  | { ok: true; game: PlayerGame }
  | { ok: false; id: string | null; code: RejectionCode; field?: string };

/** Reads only the client id, so an otherwise invalid item can still be answered individually. */
export function clientGameId(input: unknown): string | null {
  if (!isObject(input) || typeof input.id !== 'string') return null;
  return CLIENT_ID_PATTERN.test(input.id) ? input.id : null;
}

/**
 * Validates one uploaded game against `docs/specs/player-game-stats.md`.
 * Unknown fields are dropped, so stored content is exactly the documented shape.
 */
export function validatePlayerGame(input: unknown, now: number): GameValidation {
  const id = clientGameId(input);
  if (!id || !isObject(input)) return { ok: false, id, code: 'INVALID_GAME', field: 'id' };
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, id, code: 'INVALID_GAME' };
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_GAME_BYTES) return { ok: false, id, code: 'GAME_TOO_LARGE' };
  if (typeof input.mode !== 'string' || !PLAYER_GAME_MODES.includes(input.mode as PlayerGame['mode'])) {
    return { ok: false, id, code: 'UNSUPPORTED_MODE', field: 'mode' };
  }
  try {
    return { ok: true, game: readGame(id, input, now) };
  } catch (error) {
    if (error instanceof GameFieldError) return { ok: false, id, code: 'INVALID_GAME', field: error.field };
    throw error;
  }
}

function readGame(id: string, input: Record<string, unknown>, now: number): PlayerGame {
  const mode = input.mode as PlayerGame['mode'];
  const startedAt = timestamp(input.startedAt, now);
  const durationSeconds = integer(input.durationSeconds, 'durationSeconds', 0, 14_400);
  const turns = optionalInteger(input.turns, 'turns', 0, 200);
  const clientInput = object(input.client, 'client');
  const client = {
    name: pattern(clientInput.name, 'client.name', /^[a-z0-9-]{1,40}$/),
    version: pattern(clientInput.version, 'client.version', /^[A-Za-z0-9.+-]{1,32}$/),
  };
  const base = { id, startedAt, durationSeconds, turns, client };
  if (mode === 'battlegrounds') {
    const battlegrounds = readBattlegrounds(object(input.battlegrounds, 'battlegrounds'));
    return { ...base, mode, result: battlegroundsResult(battlegrounds.placement, battlegrounds.duos), battlegrounds };
  }
  const result = oneOf(input.result, 'result', RESULTS);
  if (mode === 'arena') return { ...base, mode, result, arena: readArena(object(input.arena, 'arena')) };
  return { ...base, mode, result, constructed: readConstructed(object(input.constructed, 'constructed')) };
}

function timestamp(value: unknown, now: number): number {
  if (typeof value !== 'string' || value.length > 40 || !ISO_TIMESTAMP.test(value)) {
    throw new GameFieldError('startedAt');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed < EARLIEST_GAME_MS || parsed > now + 86_400_000) {
    throw new GameFieldError('startedAt');
  }
  return parsed;
}

function readBattlegrounds(input: Record<string, unknown>): BattlegroundsDetail {
  const duos = optionalBoolean(input.duos, 'battlegrounds.duos', false) as boolean;
  return {
    heroCardId: cardId(input.heroCardId, 'battlegrounds.heroCardId'),
    placement: integer(input.placement, 'battlegrounds.placement', 1, duos ? 4 : 8),
    duos,
    ratingBefore: optionalInteger(input.ratingBefore, 'battlegrounds.ratingBefore', 0, 30_000),
    ratingAfter: optionalInteger(input.ratingAfter, 'battlegrounds.ratingAfter', 0, 30_000),
    anomalyCardId: optionalCardId(input.anomalyCardId, 'battlegrounds.anomalyCardId'),
    races: [...new Set(list(input.races, 'battlegrounds.races', 6,
      (race, field) => oneOf(race, field, BATTLEGROUNDS_RACES)))].sort(),
    tavernTier: optionalInteger(input.tavernTier, 'battlegrounds.tavernTier', 1, 7),
    finalBoard: list(input.finalBoard, 'battlegrounds.finalBoard', 7, (item, field) => {
      const minion = object(item, field);
      return {
        cardId: cardId(minion.cardId, `${field}.cardId`),
        attack: integer(minion.attack, `${field}.attack`, 0, 100_000),
        health: integer(minion.health, `${field}.health`, 0, 100_000),
        golden: optionalBoolean(minion.golden, `${field}.golden`, false) as boolean,
      };
    }),
    combats: list(input.combats, 'battlegrounds.combats', 60, (item, field) => {
      const combat = object(item, field);
      return {
        turn: integer(combat.turn, `${field}.turn`, 1, 60),
        result: oneOf(combat.result, `${field}.result`, RESULTS),
        damageDealt: integer(combat.damageDealt ?? 0, `${field}.damageDealt`, 0, 200),
        damageTaken: integer(combat.damageTaken ?? 0, `${field}.damageTaken`, 0, 200),
        opponentHeroCardId: optionalCardId(combat.opponentHeroCardId, `${field}.opponentHeroCardId`),
      };
    }),
    heroOptions: list(input.heroOptions, 'battlegrounds.heroOptions', 4, cardId),
    offers: list(input.offers, 'battlegrounds.offers', 80, (item, field) => {
      const offer = object(item, field);
      return {
        turn: integer(offer.turn, `${field}.turn`, 0, 60),
        kind: oneOf(offer.kind, `${field}.kind`, BATTLEGROUNDS_OFFER_KINDS),
        offered: list(offer.offered, `${field}.offered`, 8, cardId),
        picked: optionalCardId(offer.picked, `${field}.picked`),
      };
    }),
  };
}

function readRank(value: unknown, field: string): LadderRank | null {
  if (value === undefined || value === null) return null;
  const rank = object(value, field);
  const starLevel = integer(rank.starLevel, `${field}.starLevel`, 1, 51);
  const legendRank = optionalInteger(rank.legendRank, `${field}.legendRank`, 1, 1_000_000);
  if (legendRank !== null && starLevel !== 51) throw new GameFieldError(`${field}.legendRank`);
  return { starLevel, stars: optionalInteger(rank.stars, `${field}.stars`, 0, 3) ?? 0, legendRank };
}

function optionalDeckCode(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : pattern(value, field, DECK_CODE);
}

function readConstructed(input: Record<string, unknown>): ConstructedDetail {
  return {
    ranked: optionalBoolean(input.ranked, 'constructed.ranked', true) as boolean,
    playerClass: oneOf(input.playerClass, 'constructed.playerClass', HEARTHSTONE_CLASSES),
    opponentClass: oneOf(input.opponentClass, 'constructed.opponentClass', HEARTHSTONE_CLASSES),
    heroCardId: optionalCardId(input.heroCardId, 'constructed.heroCardId'),
    opponentHeroCardId: optionalCardId(input.opponentHeroCardId, 'constructed.opponentHeroCardId'),
    deckCode: optionalDeckCode(input.deckCode, 'constructed.deckCode'),
    deckName: optionalText(input.deckName, 'constructed.deckName', 80),
    archetype: optionalText(input.archetype, 'constructed.archetype', 80),
    opponentArchetype: optionalText(input.opponentArchetype, 'constructed.opponentArchetype', 80),
    wentFirst: optionalBoolean(input.wentFirst, 'constructed.wentFirst', null),
    rankBefore: readRank(input.rankBefore, 'constructed.rankBefore'),
    rankAfter: readRank(input.rankAfter, 'constructed.rankAfter'),
  };
}

function readArena(input: Record<string, unknown>): ArenaDetail {
  return {
    runId: pattern(input.runId, 'arena.runId', CLIENT_ID_PATTERN),
    playerClass: oneOf(input.playerClass, 'arena.playerClass', HEARTHSTONE_CLASSES),
    opponentClass: oneOf(input.opponentClass, 'arena.opponentClass', HEARTHSTONE_CLASSES),
    gameNumber: integer(input.gameNumber, 'arena.gameNumber', 1, 20),
    winsBefore: optionalInteger(input.winsBefore, 'arena.winsBefore', 0, 12),
    lossesBefore: optionalInteger(input.lossesBefore, 'arena.lossesBefore', 0, 3),
    underground: optionalBoolean(input.underground, 'arena.underground', false) as boolean,
    wentFirst: optionalBoolean(input.wentFirst, 'arena.wentFirst', null),
    deckCode: optionalDeckCode(input.deckCode, 'arena.deckCode'),
  };
}
