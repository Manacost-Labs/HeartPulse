import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  LeaderboardContractError,
  parseLeaderboardPlayer,
  parseLeaderboardStats,
  parseLeaderboardTable,
  parsePlayerHits,
  parseSeasonCatalog,
} from '../server/modules/leaderboards/contract.js';
import { assertProperty } from './helpers/propertyRuns.js';

// hs-data-api /v1/leaderboards answers in its own format ({ data }).
const BOARD = { mode: 'standard', region: 'EU', season_id: 156, season_start: '2026-10-01', is_latest: true, final: false, rated: false };
const SNAPSHOT = { day: '2026-10-25', captured_at: '2026-10-25T16:10:02+00:00', total_size: 16_625, stored_rows: 16_625 };

function tablePayload(rows: unknown[], extra: Record<string, unknown> = {}) {
  return { data: { board: BOARD, snapshot: SNAPSHOT, days: ['2026-10-25'], query: null, total: rows.length, rows, ...extra } };
}

function rowNamed(name: unknown) {
  return parseLeaderboardTable(tablePayload([{ rank: 1, name, rating: null }]), 1, 50).rows[0].name;
}

const parsers = {
  table: (payload: unknown) => parseLeaderboardTable(payload, 1, 50),
  stats: parseLeaderboardStats,
  seasons: parseSeasonCatalog,
  player: parseLeaderboardPlayer,
  hits: parsePlayerHits,
};

test('a broken hs-data-api answer is a contract error, never a crash', () => {
  assertProperty(fc.property(fc.jsonValue(), fc.constantFrom(...Object.values(parsers)), (payload, parse) => {
    try {
      parse(payload);
    } catch (error) {
      assert.ok(error instanceof LeaderboardContractError, String(error));
    }
  }));
});

test('every published row keeps its place, nickname and rating', () => {
  const row = fc.record({
    rank: fc.integer({ min: 1, max: 50_000 }),
    name: fc.stringMatching(/^[A-Za-zА-Яа-я][A-Za-zА-Яа-я0-9]{2,11}$/),
    rating: fc.option(fc.integer({ min: 0, max: 30_000 }), { nil: null }),
  });
  assertProperty(fc.property(fc.array(row, { maxLength: 50 }), rows => {
    const table = parseLeaderboardTable(tablePayload(rows), 1, 50);

    assert.deepEqual(table.rows.map(entry => [entry.rank, entry.name, entry.rating]), rows.map(entry => [entry.rank, entry.name, entry.rating]));
  }));
});

test('a nickname the page shows reads back as the same nickname', () => {
  const character = fc.constantFrom('a', 'Я', ' ', '\u0007', '\u007f', '😀');
  // Blizzard nicknames are 3–12 characters; the contract's 64-character cap is only a guard.
  assertProperty(fc.property(fc.string({ unit: character, maxLength: 32 }), raw => {
    let shown: string;
    try {
      shown = rowNamed(raw);
    } catch {
      return;
    }

    assert.equal(rowNamed(shown), shown);
    assert.equal(shown, shown.trim());
    assert.ok(!shown.includes('\u0007') && !shown.includes('\u007f'), JSON.stringify(shown));
  }));
});

test('the season list shows only stored seasons, the newest first', () => {
  // Stored seasons get even ids and empty ones odd ids, so the two never collide.
  const stored = fc.uniqueArray(fc.integer({ min: 0, max: 250 }).map(id => id * 2), { maxLength: 10 });
  const empty = fc.uniqueArray(fc.integer({ min: 0, max: 250 }).map(id => id * 2 + 1), { maxLength: 10 });
  const listed = fc.tuple(stored, empty).chain(([withData, withoutData]) => fc.tuple(fc.constant(withData), fc.shuffledSubarray([
    ...withData.map(id => ({ season_id: id, has_data: true })),
    ...withoutData.map(id => ({ season_id: id, has_data: false })),
  ], { minLength: withData.length + withoutData.length })));
  assertProperty(fc.property(listed, ([withData, seasons]) => {
    const catalog = parseSeasonCatalog({ data: { modes: [{ mode: 'standard', regions: { EU: { seasons } } }] } });
    const shown = catalog.modes[0].regions.EU.map(entry => entry.id);

    assert.deepEqual(new Set(shown), new Set(withData));
    shown.slice(1).forEach((id, index) => assert.ok(shown[index] > id));
  }));
});

test('the table reads its board, snapshot, query, previous places and pages', () => {
  const table = parseLeaderboardTable(tablePayload([
    { rank: 1, name: '  TrueBench\u001f ', rating: 101.5, previous_rank: 2 },
    { rank: 2, name: 'Bob\u007f', rating: '99', previous_rank: 1 },
    { rank: 3, name: 'New', previous_rank: 0 },
    { rank: 4, name: 'Old', previous_rank: null },
  ], {
    board: { ...BOARD, is_latest: 'true', final: true, rated: 1 },
    snapshot: { ...SNAPSHOT, truncated: true, stale: 'yes' },
    days: [7, '2026-10-24', '2026-10-25'],
    query: 'bob',
    total: 101,
  }), 3, 50);

  assert.deepEqual(table, {
    board: { mode: 'standard', region: 'EU', season: 156, seasonStart: '2026-10-01', latest: false, final: true, rated: false },
    snapshot: { day: '2026-10-25', capturedAt: '2026-10-25T16:10:02.000Z', players: 16_625, stored: 16_625, truncated: true, stale: false },
    query: 'bob',
    total: 101,
    page: 3,
    pageSize: 50,
    pages: 3,
    hasPrevious: true,
    rows: [
      { rank: 1, name: 'TrueBench', rating: 101.5, previousRank: 2, streamer: null },
      { rank: 2, name: 'Bob', rating: null, previousRank: 1, streamer: null },
      { rank: 3, name: 'New', rating: null, previousRank: null, streamer: null },
      { rank: 4, name: 'Old', rating: null, previousRank: null, streamer: null },
    ],
  });
});

test('the first day of a board has nothing to compare with', () => {
  const sameDay = parseLeaderboardTable(tablePayload([], { days: ['2026-10-25', '2026-10-26', 20_261_024], query: 7 }), 1, 50);

  assert.equal(sameDay.hasPrevious, false);
  assert.equal(sameDay.query, null);
  assert.equal(sameDay.pages, 1);
  assert.equal(parseLeaderboardTable(tablePayload([], { total: 0 }), 1, 50).pages, 1);
  assert.equal(parseLeaderboardTable(tablePayload([], { total: 51 }), 1, 50).pages, 2);
});

test('a malformed table is refused instead of shown', () => {
  const broken: Array<[string, unknown]> = [
    ['rank zero', tablePayload([{ rank: 0, name: 'A' }])],
    ['fractional rank', tablePayload([{ rank: 1.5, name: 'A' }])],
    ['rank as text', tablePayload([{ rank: '1', name: 'A' }])],
    ['blank name', tablePayload([{ rank: 1, name: ' \u0007 ' }])],
    ['name not text', tablePayload([{ rank: 1, name: 42 }])],
    ['row not an object', tablePayload(['A'])],
    ['rows not a list', tablePayload([], { rows: { 0: {} } })],
    ['days not a list', tablePayload([], { days: '2026-10-25' })],
    ['negative total', tablePayload([], { total: -1 })],
    ['unknown mode', tablePayload([], { board: { ...BOARD, mode: 'duels' } })],
    ['unknown region', tablePayload([], { board: { ...BOARD, region: 'CN' } })],
    ['season as text', tablePayload([], { board: { ...BOARD, season_id: '156' } })],
    ['day with time', tablePayload([], { snapshot: { ...SNAPSHOT, day: '2026-10-25T00:00' } })],
    ['day after text', tablePayload([], { snapshot: { ...SNAPSHOT, day: 'x2026-10-25' } })],
    ['day as number', tablePayload([], { snapshot: { ...SNAPSHOT, day: 20_261_025 } })],
    ['capture time not a time', tablePayload([], { snapshot: { ...SNAPSHOT, captured_at: 'yesterday' } })],
    ['capture time as number', tablePayload([], { snapshot: { ...SNAPSHOT, captured_at: 1_761_400_000_000 } })],
    ['data is a list', { data: [] }],
    ['no data', {}],
    ['answer not an object', 'ok'],
  ];
  for (const [label, payload] of broken) {
    assert.throws(() => parseLeaderboardTable(payload, 1, 50), LeaderboardContractError, label);
  }
});

test('the season catalog keeps known modes in site order with their flags', () => {
  const catalog = parseSeasonCatalog({ data: { modes: [
    { mode: 'battlegrounds', rated: true, regions: { US: { seasons: [
      { season_id: 18, has_data: true, season_start: 'soon', is_latest: false, final: true, total_size: '5' },
      { season_id: 19, has_data: true, season_start: null, is_latest: true, total_size: 6_543 },
      { season_id: 20, has_data: 'yes' },
    ] } } },
    { mode: 'duels', regions: { EU: { seasons: [{ season_id: 1, has_data: true }] } } },
    { mode: 'standard', rated: 'yes', regions: { EU: { seasons: [{ season_id: 156, has_data: true, season_start: '2026-10-01' }] } } },
  ] } });

  assert.deepEqual(catalog, { modes: [
    { mode: 'standard', rated: false, regions: {
      EU: [{ id: 156, start: '2026-10-01', latest: false, final: false, players: null }], US: [], AP: [],
    } },
    { mode: 'battlegrounds', rated: true, regions: {
      EU: [],
      US: [
        { id: 19, start: null, latest: true, final: false, players: 6_543 },
        { id: 18, start: null, latest: false, final: true, players: null },
      ],
      AP: [],
    } },
  ] });
  assert.throws(() => parseSeasonCatalog({ data: { modes: {} } }), LeaderboardContractError);
  assert.throws(() => parseSeasonCatalog({ data: { modes: [{ mode: 'wild', regions: [] }] } }), LeaderboardContractError);
});

test('the board summary reads thresholds, the rating spread, the histogram and the trend', () => {
  const stats = parseLeaderboardStats({ data: {
    board: { ...BOARD, mode: 'battlegrounds', rated: true },
    snapshot: SNAPSHOT,
    top_rating: 14_200,
    thresholds: [{ rank: 100, reached: true, rating: 11_000 }, { rank: 1000, reached: 'yes', rating: null }],
    rating: { min: 8000, max: 14_200, mean: 9100.5 },
    histogram: [{ from: 8000, to: 9000, players: 400 }, { from: 'low', players: 3 }],
    series: [{ day: '2026-10-24', total_size: 16_000, rating_at_1: 14_100, rating_at_100: 11_000, rating_at_1000: null, rating_at_5000: '8000' }],
  } });

  assert.deepEqual(stats, {
    board: { mode: 'battlegrounds', region: 'EU', season: 156, seasonStart: '2026-10-01', latest: true, final: false, rated: true },
    snapshot: { day: '2026-10-25', capturedAt: '2026-10-25T16:10:02.000Z', players: 16_625, stored: 16_625, truncated: false, stale: false },
    topRating: 14_200,
    thresholds: [{ rank: 100, reached: true, rating: 11_000 }, { rank: 1000, reached: false, rating: null }],
    rating: { min: 8000, max: 14_200, mean: 9100.5, median: null },
    histogram: [{ from: 8000, to: 9000, players: 400 }, { from: 0, to: 0, players: 3 }],
    series: [{ day: '2026-10-24', players: 16_000, top: 14_100, at100: 11_000, at1000: null, at5000: null }],
  });
});

test('a board without a full rating spread or histogram shows none', () => {
  const base = { board: BOARD, snapshot: SNAPSHOT, top_rating: null, thresholds: [], series: [] };
  for (const rating of [{ max: 2, mean: 1 }, { min: 0, mean: 1 }, { min: 0, max: 2 }]) {
    assert.equal(parseLeaderboardStats({ data: { ...base, rating } }).rating, null);
  }
  assert.deepEqual(parseLeaderboardStats({ data: { ...base, rating: { min: 0, max: 2, mean: 1, median: 1.5 } } }).rating,
    { min: 0, max: 2, mean: 1, median: 1.5 });
  assert.equal(parseLeaderboardStats({ data: { ...base, histogram: 'none' } }).histogram, null);
  assert.throws(() => parseLeaderboardStats({ data: { ...base, histogram: [{ players: -1 }] } }), LeaderboardContractError);
  assert.throws(() => parseLeaderboardStats({ data: { ...base, thresholds: [{ rank: 0 }] } }), LeaderboardContractError);
  assert.throws(() => parseLeaderboardStats({ data: { ...base, series: [{ day: '2026-10-24', total_size: 1.5 }] } }), LeaderboardContractError);
});

test('a player history reads every season and its daily places', () => {
  const player = parseLeaderboardPlayer({ data: {
    player: { region: 'US', name: ' Ramses ' },
    shared_name: true,
    seasons: [{
      mode: 'wild', season_id: 155, season_start: '2026-09-01', is_latest: true, final: true, rated: true,
      best_rank: 3, best_day: '2026-09-20', last_rank: 7, last_rating: 50, last_day: '2026-09-30', in_latest_snapshot: true,
      series: [{ day: '2026-09-30', rank: 7, rating: 50, total_size: 900, final: true }],
    }, {
      mode: 'standard', season_id: 156, is_latest: 1, final: 'no', rated: 'yes',
      best_rank: 1, best_day: '2026-10-02', last_rank: 1, last_day: '2026-10-02', in_latest_snapshot: 'yes',
      series: [{ day: '2026-10-02', rank: 1, total_size: 100, final: 1 }],
    }],
  } });

  assert.deepEqual(player, {
    region: 'US',
    name: 'Ramses',
    sharedName: true,
    regions: ['US'],
    streamer: null,
    seasons: [{
      mode: 'wild', season: 155, seasonStart: '2026-09-01', latest: true, final: true, rated: true,
      bestRank: 3, bestDay: '2026-09-20', lastRank: 7, lastRating: 50, lastDay: '2026-09-30', inLatest: true,
      series: [{ day: '2026-09-30', rank: 7, rating: 50, players: 900, final: true }],
    }, {
      mode: 'standard', season: 156, seasonStart: null, latest: false, final: false, rated: false,
      bestRank: 1, bestDay: '2026-10-02', lastRank: 1, lastRating: null, lastDay: '2026-10-02', inLatest: false,
      series: [{ day: '2026-10-02', rank: 1, rating: null, players: 100, final: false }],
    }],
  });
  assert.equal(parseLeaderboardPlayer({ data: { player: { region: 'EU', name: 'A' }, shared_name: 'true', seasons: [] } }).sharedName, false);
  assert.throws(() => parseLeaderboardPlayer({ data: { player: { region: 'EU', name: 'A' }, seasons: [{ mode: 'duels' }] } }),
    LeaderboardContractError);
});

test('a nickname search finds current places in known modes only', () => {
  assert.deepEqual(parsePlayerHits({ data: [
    { region: 'AP', name: 'Moquai', current: [
      { mode: 'battlegrounds', season_id: 19, rank: 4, rating: 12_000 },
      { mode: 'duels', season_id: 1, rank: 1 },
      { mode: 'arena', season_id: 3, rank: 9, rating: 'top' },
    ] },
  ] }), [
    { region: 'AP', name: 'Moquai', current: [
      { mode: 'battlegrounds', season: 19, rank: 4, rating: 12_000 },
      { mode: 'arena', season: 3, rank: 9, rating: null },
    ] },
  ]);
  assert.throws(() => parsePlayerHits({ data: [{ region: 'EU', name: 'A', current: [{ mode: 'arena', season_id: 1, rank: 0 }] }] }),
    LeaderboardContractError);
  assert.throws(() => parsePlayerHits({ data: {} }), LeaderboardContractError);
});
