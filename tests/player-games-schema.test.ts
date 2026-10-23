import assert from 'node:assert/strict';
import { statisticsFromEvent, validateStatisticsPayload, type StatisticsEvent } from '../server/modules/playerGames/public.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const context = { occurredAt: '2026-10-22T15:04:11.000Z', now: NOW };
const battlegrounds = (overrides: Record<string, unknown> = {}) => ({
  durationSeconds: 1260,
  turns: 13,
  heroCardId: 'BG20_HERO_242',
  placement: 2,
  ratingBefore: 6412,
  ratingAfter: 6451,
  races: ['UNDEAD', 'BEAST', 'BEAST'],
  finalBoard: { minions: [{ cardId: 'BG25_008', attack: 48, health: 51, golden: true }] },
  combats: [{ turn: 1, result: 'tie' }, { turn: 2, result: 'win', damageDealt: 3 }],
  heroOptions: ['BG20_HERO_242', 'BG22_HERO_000'],
  ...overrides,
});
const constructed = (overrides: Record<string, unknown> = {}) => ({
  format: 'wild',
  result: 'win',
  durationSeconds: 540,
  playerClass: 'DEATHKNIGHT',
  opponentClass: 'MAGE',
  wentFirst: false,
  rankBefore: { starLevel: 51, legendRank: 812 },
  rankAfter: { starLevel: 51, legendRank: 790 },
  playerMulligan: { initial: ['CARD_1'] },
  ...overrides,
});
const check = (type: string, payload: Record<string, unknown>, at = context) => validateStatisticsPayload(type, 2, payload, at);
const event = (type: string, payload: Record<string, unknown>, schemaVersion = 2): StatisticsEvent => ({
  eventId: '0199b2d2-7cc7-7d75-bcea-7d28b628ef4b', type, schemaVersion, occurredAt: context.occurredAt, payload,
});

// Version 2 payloads are stored normalized: documented fields and v1 lists only.
const bg = check('battlegrounds_match', battlegrounds({ opponentName: 'Someone#1234', debug: { log: 'x' } }));
assert.equal(bg.warning, undefined);
assert.equal('opponentName' in bg.payload || 'debug' in bg.payload, false, 'unknown fields are dropped');
assert.deepEqual(bg.payload.races, ['BEAST', 'UNDEAD']);
assert.deepEqual(bg.payload.finalBoard, { minions: [{ cardId: 'BG25_008', attack: 48, health: 51, golden: true }] });
const wildPayload = check('constructed_match', constructed()).payload;
assert.deepEqual(wildPayload.playerMulligan, { initial: ['CARD_1'] }, 'v1 lists survive');
assert.deepEqual(check('constructed_match', wildPayload), { ok: true, payload: wildPayload }, 'normalizing twice changes nothing');

// Nested v1 lists keep card ids only, so nothing else hidden in them is stored.
const nested = check('constructed_match', constructed({ playerMulligan: { initial: ['CARD_1', { cardId: 'CARD_2', owner: 'Name#1234' }, 7], note: 'x' },
  opponentDeck: { observedCards: ['CARD_3'], opponentName: 'Someone' } })).payload;
assert.deepEqual(nested.playerMulligan, { initial: ['CARD_1', 'CARD_2'] });
assert.deepEqual(nested.opponentDeck, { observedCards: ['CARD_3'] });

// An invalid statistics field never loses the event: it is stored with the v1 lists and marked.
assert.deepEqual(check('battlegrounds_match', battlegrounds({ duos: true, placement: 5 })),
  { ok: true, payload: { statisticsError: 'placement' }, warning: 'placement' });
assert.deepEqual(check('constructed_match', constructed({ opponentClass: 'NEUTRAL' })),
  { ok: true, payload: { playerMulligan: { initial: ['CARD_1'] }, statisticsError: 'opponentClass' }, warning: 'opponentClass' });
assert.equal(check('battlegrounds_match', battlegrounds({ finalBoard: { minions: Array(8).fill({ cardId: 'BG25_008', attack: 1, health: 1 }) } })).warning,
  'finalBoard.minions');
assert.equal(check('constructed_match', constructed({ format: 'twist' })).warning, 'format');
assert.equal(check('constructed_match', constructed({ rankAfter: { starLevel: 50, legendRank: 10 } })).warning, 'rankAfter.legendRank');
assert.equal(check('constructed_match', constructed({ deckName: 'a\u0000b' })).warning, 'deckName');
assert.equal(check('constructed_match', constructed({ opponentArchetype: 'Player#12345' })).warning, 'opponentArchetype', 'no BattleTags');
assert.equal(check('constructed_match', constructed({ archetype: 'Aggro‮Druid' })).warning, 'archetype', 'no bidi controls');
assert.equal(check('constructed_match', constructed({ archetype: 'Big #1 Deck' })).warning, undefined);
assert.equal(check('arena_match', { result: 'win', durationSeconds: 600, runId: 'run-00000001', playerClass: 'PALADIN',
  opponentClass: 'ROGUE' }).warning, 'gameNumber');
assert.equal(check('arena_run', { runId: 'run-00000001', playerClass: 'PALADIN', wins: 13, losses: 0 }).warning, 'wins');

// The game time must be plausible.
assert.equal(check('constructed_match', constructed(), { occurredAt: '2099-01-01T00:00:00.000Z', now: NOW }).warning, 'occurredAt');
assert.equal(check('constructed_match', constructed(), { occurredAt: '2013-12-31T00:00:00.000Z', now: NOW }).warning, 'occurredAt');

// Version 1 and non-game types stay as sent.
assert.deepEqual(validateStatisticsPayload('constructed_match', 1, { matchId: 'm', turns: 8 }, context),
  { ok: true, payload: { matchId: 'm', turns: 8 } });
assert.deepEqual(check('arena_draft_pick', { offeredCardIds: ['A'] }), { ok: true, payload: { offeredCardIds: ['A'] } });

// Reading stored events.
const game = statisticsFromEvent(event('battlegrounds_match', bg.payload), NOW);
assert.ok(game && 'mode' in game && game.mode === 'battlegrounds');
assert.equal(game.result, 'win');
assert.equal(game.startedAt, Date.parse(context.occurredAt));
assert.deepEqual(game.battlegrounds.combats[0], { turn: 1, result: 'tie', damageDealt: 0, damageTaken: 0, opponentHeroCardId: null });
const wild = statisticsFromEvent(event('constructed_match', wildPayload), NOW);
assert.ok(wild && 'mode' in wild && wild.mode === 'wild');
assert.deepEqual(wild.constructed.rankAfter, { starLevel: 51, stars: 0, legendRank: 790 });
const run = statisticsFromEvent(event('arena_run', { runId: 'run-00000001', playerClass: 'MAGE', wins: 7, losses: 3 }), NOW);
assert.deepEqual(run, { runId: 'run-00000001', playerClass: 'MAGE', wins: 7, losses: 3, complete: null, underground: false,
  occurredAt: Date.parse(context.occurredAt) });

assert.equal(statisticsFromEvent(event('constructed_match', { statisticsError: 'opponentClass' }), NOW), null);
assert.ok(statisticsFromEvent(event('constructed_match', constructed(), 1), NOW), 'a v1 payload with the fields counts');
assert.equal(statisticsFromEvent(event('constructed_match', { matchId: 'm', turns: 8 }, 1), NOW), null);
assert.equal(statisticsFromEvent(event('collection_snapshot', { cards: [] }), NOW), null);
assert.equal(statisticsFromEvent({ ...event('constructed_match', constructed(), 1), occurredAt: '2099-01-01T00:00:00.000Z' }, NOW), null);

console.log('player games schema: ok');
