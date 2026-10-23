import {
  BATTLEGROUNDS_OFFER_KINDS,
  BATTLEGROUNDS_RACES,
  HEARTHSTONE_CLASSES,
  battlegroundsResult,
  type ArenaDetail,
  type ArenaRunRecord,
  type BattlegroundsDetail,
  type ConstructedDetail,
  type GameResult,
  type LadderRank,
  type PlayerGame,
} from '../model/game.js';
import { GAME_EVENT_TYPES, type GameEventType, type StatisticsEvent } from '../model/events.js';
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
const DECK_CODE = /^[A-Za-z0-9+/=_-]{4,256}$/;

type Payload = Record<string, unknown>;

function readBattlegrounds(input: Payload): BattlegroundsDetail {
  const duos = optionalBoolean(input.duos, 'duos', false) as boolean;
  const board = input.finalBoard === undefined || input.finalBoard === null ? {} : object(input.finalBoard, 'finalBoard');
  return {
    heroCardId: cardId(input.heroCardId, 'heroCardId'),
    placement: integer(input.placement, 'placement', 1, duos ? 4 : 8),
    duos,
    ratingBefore: optionalInteger(input.ratingBefore, 'ratingBefore', 0, 30_000),
    ratingAfter: optionalInteger(input.ratingAfter, 'ratingAfter', 0, 30_000),
    anomalyCardId: optionalCardId(input.anomalyCardId, 'anomalyCardId'),
    races: [...new Set(list(input.races, 'races', 6, (race, field) => oneOf(race, field, BATTLEGROUNDS_RACES)))].sort(),
    tavernTier: optionalInteger(input.tavernTier, 'tavernTier', 1, 7),
    finalBoard: list(board.minions, 'finalBoard.minions', 7, (item, field) => {
      const minion = object(item, field);
      return {
        cardId: cardId(minion.cardId, `${field}.cardId`),
        attack: integer(minion.attack, `${field}.attack`, 0, 100_000),
        health: integer(minion.health, `${field}.health`, 0, 100_000),
        golden: optionalBoolean(minion.golden, `${field}.golden`, false) as boolean,
      };
    }),
    combats: list(input.combats, 'combats', 60, (item, field) => {
      const combat = object(item, field);
      return {
        turn: integer(combat.turn, `${field}.turn`, 1, 60),
        result: oneOf(combat.result, `${field}.result`, RESULTS),
        damageDealt: integer(combat.damageDealt ?? 0, `${field}.damageDealt`, 0, 200),
        damageTaken: integer(combat.damageTaken ?? 0, `${field}.damageTaken`, 0, 200),
        opponentHeroCardId: optionalCardId(combat.opponentHeroCardId, `${field}.opponentHeroCardId`),
      };
    }),
    heroOptions: list(input.heroOptions, 'heroOptions', 4, cardId),
    offers: list(input.offers, 'offers', 80, (item, field) => {
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

function readConstructed(input: Payload): ConstructedDetail {
  return {
    ranked: optionalBoolean(input.ranked, 'ranked', true) as boolean,
    playerClass: oneOf(input.playerClass, 'playerClass', HEARTHSTONE_CLASSES),
    opponentClass: oneOf(input.opponentClass, 'opponentClass', HEARTHSTONE_CLASSES),
    heroCardId: optionalCardId(input.heroCardId, 'heroCardId'),
    opponentHeroCardId: optionalCardId(input.opponentHeroCardId, 'opponentHeroCardId'),
    deckCode: optionalDeckCode(input.deckCode, 'deckCode'),
    deckName: optionalText(input.deckName, 'deckName', 80),
    archetype: optionalText(input.archetype, 'archetype', 80),
    opponentArchetype: optionalText(input.opponentArchetype, 'opponentArchetype', 80),
    wentFirst: optionalBoolean(input.wentFirst, 'wentFirst', null),
    rankBefore: readRank(input.rankBefore, 'rankBefore'),
    rankAfter: readRank(input.rankAfter, 'rankAfter'),
  };
}

function readArena(input: Payload): ArenaDetail {
  return {
    runId: pattern(input.runId, 'runId', CLIENT_ID_PATTERN),
    playerClass: oneOf(input.playerClass, 'playerClass', HEARTHSTONE_CLASSES),
    opponentClass: oneOf(input.opponentClass, 'opponentClass', HEARTHSTONE_CLASSES),
    gameNumber: integer(input.gameNumber, 'gameNumber', 1, 20),
    winsBefore: optionalInteger(input.winsBefore, 'winsBefore', 0, 12),
    lossesBefore: optionalInteger(input.lossesBefore, 'lossesBefore', 0, 3),
    underground: optionalBoolean(input.underground, 'underground', false) as boolean,
    wentFirst: optionalBoolean(input.wentFirst, 'wentFirst', null),
    deckCode: optionalDeckCode(input.deckCode, 'deckCode'),
  };
}

function readCommon(input: Payload, resultRequired: boolean) {
  return {
    durationSeconds: integer(input.durationSeconds, 'durationSeconds', 0, 14_400),
    turns: optionalInteger(input.turns, 'turns', 0, 200),
    result: resultRequired ? oneOf(input.result, 'result', RESULTS) : null,
  };
}

/** Throws `GameFieldError` on the first invalid statistics field of a game or run payload. */
function readPayload(type: GameEventType, input: Payload): unknown {
  if (type === 'arena_run') {
    return {
      runId: pattern(input.runId, 'runId', CLIENT_ID_PATTERN),
      playerClass: oneOf(input.playerClass, 'playerClass', HEARTHSTONE_CLASSES),
      wins: integer(input.wins, 'wins', 0, 12),
      losses: integer(input.losses, 'losses', 0, 3),
      complete: optionalBoolean(input.complete, 'complete', null),
      underground: optionalBoolean(input.underground, 'underground', false) as boolean,
    };
  }
  if (type === 'battlegrounds_match') return { ...readCommon(input, false), battlegrounds: readBattlegrounds(input) };
  if (type === 'arena_match') return { ...readCommon(input, true), arena: readArena(input) };
  const format = oneOf(input.format, 'format', ['standard', 'wild'] as const);
  return { ...readCommon(input, true), format, constructed: readConstructed(input) };
}

const isGameEventType = (type: string): type is GameEventType => GAME_EVENT_TYPES.includes(type as GameEventType);

const EARLIEST_GAME_MS = Date.UTC(2014, 0, 1);
const FUTURE_TOLERANCE_MS = 86_400_000;
/** v1 lists other features read; a v2 event keeps them next to the statistics fields. */
const V1_LIST_FIELDS = ['playerMulligan', 'opponentDeck', 'finalDeckCardIds', 'offeredCardIds'];

function inGameWindow(occurredAt: string, now: number): boolean {
  const time = Date.parse(occurredAt);
  return Number.isFinite(time) && time >= EARLIEST_GAME_MS && time <= now + FUTURE_TOLERANCE_MS;
}

/** The read statistics back in the wire shape, so stored v2 payloads hold only documented fields. */
function wireShape(type: GameEventType, read: Record<string, unknown>): Payload {
  const { battlegrounds, constructed, arena, ...common } = read as Record<string, Record<string, unknown>> & Payload;
  if (type === 'battlegrounds_match') {
    const { finalBoard, ...rest } = battlegrounds;
    return { ...common, ...rest, finalBoard: { minions: finalBoard } };
  }
  if (type === 'constructed_match') return { ...common, ...constructed };
  if (type === 'arena_match') return { ...common, ...arena };
  return common;
}

/**
 * The tracker ingestion's payload check for `schemaVersion` 2 game and run
 * events. The stored payload is normalized: the documented statistics fields
 * plus the v1 lists, nothing else. When a statistics field is invalid or the
 * game time is implausible, the event is still stored with its v1 lists and a
 * `statisticsError` naming the field, so other data is never lost; the page
 * then skips it. Version 1 and other event types pass unchanged.
 */
export function validateStatisticsPayload(type: string, schemaVersion: number, payload: Payload,
  context: { occurredAt: string; now: number }): { ok: true; payload: Payload; warning?: string } {
  if (schemaVersion < 2 || !isGameEventType(type)) return { ok: true, payload };
  const lists = Object.fromEntries(V1_LIST_FIELDS.filter(field => payload[field] !== undefined).map(field => [field, payload[field]]));
  try {
    if (!inGameWindow(context.occurredAt, context.now)) throw new GameFieldError('occurredAt');
    return { ok: true, payload: { ...wireShape(type, readPayload(type, payload) as Record<string, unknown>), ...lists } };
  } catch (error) {
    if (!(error instanceof GameFieldError)) throw error;
    return { ok: true, payload: { ...lists, statisticsError: error.field }, warning: error.field };
  }
}

/**
 * Reads one stored event as a game or an Arena run. A version 1 payload is
 * read the same way when it happens to carry the fields; an event marked with
 * `statisticsError`, one dated outside the plausible window or one without
 * the fields has no statistics, and `null` is returned.
 */
export function statisticsFromEvent(event: StatisticsEvent, now = Date.now()): PlayerGame | ArenaRunRecord | null {
  if (!isGameEventType(event.type) || !isObject(event.payload) || event.payload.statisticsError !== undefined) return null;
  if (!inGameWindow(event.occurredAt, now)) return null;
  const startedAt = Date.parse(event.occurredAt);
  let read: Record<string, unknown>;
  try {
    read = readPayload(event.type, event.payload) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof GameFieldError) return null;
    throw error;
  }
  if (event.type === 'arena_run') return { ...(read as Omit<ArenaRunRecord, 'occurredAt'>), occurredAt: startedAt };
  const base = { id: event.eventId, startedAt, durationSeconds: read.durationSeconds as number, turns: read.turns as number | null };
  if (event.type === 'battlegrounds_match') {
    const battlegrounds = read.battlegrounds as BattlegroundsDetail;
    return { ...base, mode: 'battlegrounds', result: battlegroundsResult(battlegrounds.placement, battlegrounds.duos), battlegrounds };
  }
  if (event.type === 'arena_match') return { ...base, mode: 'arena', result: read.result as GameResult, arena: read.arena as ArenaDetail };
  return { ...base, mode: read.format as 'standard' | 'wild', result: read.result as GameResult,
    constructed: read.constructed as ConstructedDetail };
}
