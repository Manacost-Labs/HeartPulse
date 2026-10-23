import assert from 'node:assert/strict';
import { statisticsFromEvent, validateStatisticsPayload, type StatisticsEvent } from '../server/modules/playerGames/public.js';

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
  deckCode: 'AAECAfHhBAA=',
  wentFirst: false,
  rankBefore: { starLevel: 51, legendRank: 812 },
  rankAfter: { starLevel: 51, legendRank: 790 },
  playerMulligan: { initial: ['CARD_1'] },
  ...overrides,
});
const event = (type: string, payload: Record<string, unknown>, schemaVersion = 2): StatisticsEvent => ({
  eventId: '0199b2d2-7cc7-7d75-bcea-7d28b628ef4b', type, schemaVersion, occurredAt: '2026-10-22T15:04:11.000Z', payload,
});

// Version 2 game payloads are checked strictly and stored as sent.
assert.deepEqual(validateStatisticsPayload('battlegrounds_match', 2, battlegrounds()), { ok: true, payload: battlegrounds() });
assert.deepEqual(validateStatisticsPayload('battlegrounds_match', 2, battlegrounds({ duos: true, placement: 5 })),
  { ok: false, field: 'placement' });
assert.deepEqual(validateStatisticsPayload('battlegrounds_match', 2,
  battlegrounds({ finalBoard: { minions: Array(8).fill({ cardId: 'BG25_008', attack: 1, health: 1 }) } })),
{ ok: false, field: 'finalBoard.minions' });
assert.deepEqual(validateStatisticsPayload('constructed_match', 2, constructed({ format: 'twist' })), { ok: false, field: 'format' });
assert.deepEqual(validateStatisticsPayload('constructed_match', 2, constructed({ rankAfter: { starLevel: 50, legendRank: 10 } })),
  { ok: false, field: 'rankAfter.legendRank' });
assert.deepEqual(validateStatisticsPayload('constructed_match', 2, constructed({ deckName: 'a\u0000b' })), { ok: false, field: 'deckName' });
assert.deepEqual(validateStatisticsPayload('arena_match', 2, { result: 'win', durationSeconds: 600, runId: 'run-00000001',
  playerClass: 'PALADIN', opponentClass: 'ROGUE' }), { ok: false, field: 'gameNumber' });
assert.deepEqual(validateStatisticsPayload('arena_run', 2, { runId: 'run-00000001', playerClass: 'PALADIN', wins: 13, losses: 0 }),
  { ok: false, field: 'wins' });

// Version 1 and non-game types stay opaque.
assert.equal(validateStatisticsPayload('constructed_match', 1, { matchId: 'm', turns: 8 }).ok, true);
assert.equal(validateStatisticsPayload('arena_draft_pick', 2, { offeredCardIds: ['A'] }).ok, true);

// Reading stored events.
const bg = statisticsFromEvent(event('battlegrounds_match', battlegrounds()));
assert.ok(bg && 'mode' in bg && bg.mode === 'battlegrounds');
assert.equal(bg.result, 'win');
assert.equal(bg.startedAt, Date.parse('2026-10-22T15:04:11Z'));
assert.deepEqual(bg.battlegrounds.races, ['BEAST', 'UNDEAD']);
assert.deepEqual(bg.battlegrounds.finalBoard, [{ cardId: 'BG25_008', attack: 48, health: 51, golden: true }]);
assert.deepEqual(bg.battlegrounds.combats[0], { turn: 1, result: 'tie', damageDealt: 0, damageTaken: 0, opponentHeroCardId: null });

const wild = statisticsFromEvent(event('constructed_match', constructed()));
assert.ok(wild && 'mode' in wild && wild.mode === 'wild');
assert.deepEqual(wild.constructed.rankAfter, { starLevel: 51, stars: 0, legendRank: 790 });

const run = statisticsFromEvent(event('arena_run', { runId: 'run-00000001', playerClass: 'MAGE', wins: 7, losses: 3 }));
assert.deepEqual(run, { runId: 'run-00000001', playerClass: 'MAGE', wins: 7, losses: 3, complete: null, underground: false,
  occurredAt: Date.parse('2026-10-22T15:04:11Z') });

// A v1 payload counts when it happens to carry the fields; an opaque one has no statistics.
assert.ok(statisticsFromEvent(event('constructed_match', constructed(), 1)));
assert.equal(statisticsFromEvent(event('constructed_match', { matchId: 'm', turns: 8 }, 1)), null);
assert.equal(statisticsFromEvent(event('collection_snapshot', { cards: [] })), null);
assert.equal(statisticsFromEvent({ ...event('constructed_match', constructed()), occurredAt: 'never' }), null);

console.log('player games schema: ok');
