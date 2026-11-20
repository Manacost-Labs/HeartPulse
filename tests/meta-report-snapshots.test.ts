import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { type TestContext } from 'node:test';
import { startMetaReportSnapshots } from '../server/metaReportSnapshotSources.js';

/*
 * Weekly meta report snapshots (docs/specs/meta-report-snapshots.md). The real
 * open projections and a real `node:sqlite` file in a temporary directory; only
 * the clock (`Date`, mocked) and the raw upstream payloads are fixtures. Every paid figure of the
 * payloads carries a sentinel that must never reach the stored snapshot.
 */

const PAID = [
  '77.7701', '77.7702', '-7.7703', 'SENTINEL_DECK_CODE', 'SENTINEL_LEGEND', '66.6066',
  '63.3636', 'SENTINEL_PERIOD', 'SENTINEL_HISTORY', '12.3456', '20.1111', 'SENTINEL_ARENASMITH', '41.4141',
  'TOP_1_PERCENT', 'SENTINEL_OFFER',
];

const MONDAY_0630 = Date.parse('2026-11-23T06:30:00Z');

type World = {
  metaUpdatedAt: string; archetypes: number; arenaUpdatedAt: string; heroesFail: boolean; arenaWinrate: number;
  /** The Arena origin fails; `arenaSnapshotUpdatedAt` is the local `winrates.json` (none when null). */
  arenaFails?: boolean; arenaSnapshotUpdatedAt?: string | null;
  /** Runs while the Standard source is read (to move the clock during a run). */
  onMetaRead?: () => void;
};

const metaPayload = (world: World, rank: string, period: string) => ({
  publicationMode: 'stable', publishedAt: world.metaUpdatedAt, format: 'standard', formatLabel: 'Стандарт', rank, rankLabel: rank, period,
  availablePeriods: ['past_day', 'patch_37.0.2'], currentPatchPeriod: 'patch_37.0.2', coin: 'any_player', minGames: 100,
  source: 'hsguru', sourceId: 'sentinel', sourceUrl: 'https://www.hsguru.com/meta', translationSource: 'database', updatedAt: world.metaUpdatedAt,
  items: Array.from({ length: world.archetypes }, (_, index) => ({
    id: `m-${index + 1}`, slug: `archetype-${index + 1}`, archetype: `Archetype ${index + 1}`, archetypeLabel: `Архетип ${index + 1}`,
    translated: true, classKey: 'mage', winrate: rank === 'legend' ? 66.6066 : 55 - index / 2, popularity: 10 - index / 4, games: 5000 - index * 100,
    turns: 77.7701, durationMinutes: 77.7702, climbingSpeed: -7.7703, deckCode: 'SENTINEL_DECK_CODE', narrowRank: 'SENTINEL_LEGEND',
  })),
});

const matchupPayload = () => ({
  data: {
    period: 'black_empire', checked_at: '2026-11-23T04:00:00Z', total_games: 9000, source_url: 'https://www.hsguru.com/matchups?format=2&rank=all',
    archetypes: [
      { archetype: 'Aggro Warlock', class: 'WARLOCK', games: 6000, winrate: 51.5, popularity_pct: 60, legend_winrate: 63.3636 },
      { archetype: "C'Thun DH", class: 'DEMONHUNTER', games: 1000, winrate: 48.4, popularity_pct: 10, history: 'SENTINEL_HISTORY' },
    ],
    matchups: [
      { archetype: 'Aggro Warlock', opponent: "C'Thun DH", winrate: 54.2, games: 120 },
      { archetype: "C'Thun DH", opponent: 'Aggro Warlock', winrate: 45.8, games: 120 },
    ],
  },
  meta: { available: { periods: ['SENTINEL_PERIOD', 'black_empire'], current_period: 'SENTINEL_PERIOD', default_period: 'black_empire' } },
});

const arenaDataset = (world: World) => ({
  source: 'api.kolodahearthstone.com', updatedAt: world.arenaUpdatedAt,
  classes: [
    { id: 'MAGE', name: 'Маг', winrate: world.arenaWinrate, games: 1200, wins: 41.4141, arenasmith: 'SENTINEL_ARENASMITH' },
    { id: 'ROGUE', name: 'Разбойник', winrate: 49.94, games: 35, wins: 41.4141 },
  ],
});

const heroCatalog = () => ({
  ok: true, fetched_at: '2026-11-23T06:05:00Z', mmr: 'TOP_50_PERCENT', other_ranges: { TOP_1_PERCENT: { avg_placement: 3.1 } },
  heroes: [{
    dbfId: 59201, id: 'BG25_HERO_100', hero: 'Леди Ваш', tier: 'A', avg_placement: '3.95', pick_rate: '30.5%', offer_rate: 'SENTINEL_OFFER',
    placement_distribution: [20.1111, 15, 15, 10, 10, 10, 10, 9.8889], adjusted_placement: 12.3456, hero_power: { name: 'Сила' },
  }],
});

const patchList = () => ({
  patches: [
    { version: '37.0.0.254477', title: 'Обновление 37.0', official_published_at: '2026-10-12T16:55:00+00:00', content: 'Текст' },
    { version: '37.0.2', title: 'Обновление 37.0.2', published_at: '2026-11-03T21:30:16', content: 'Текст' },
  ],
});

function harness(t: TestContext, overrides: Partial<World> = {}, now = MONDAY_0630) {
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['Date'], now });
  const directory = mkdtempSync(join(tmpdir(), 'meta-report-snapshots-'));
  const world: World = {
    metaUpdatedAt: '2026-11-23T05:00:00.000Z', archetypes: 20, arenaUpdatedAt: '2026-11-23T06:00:00Z',
    heroesFail: false, arenaWinrate: 52.345, ...overrides,
  };
  const snapshots = startMetaReportSnapshots({
    stateDirectory: directory,
    hourly: false,
    now: () => Date.now(),
    loadMeta: async (_format, rank, period) => {
      world.onMetaRead?.();
      return metaPayload(world, rank, period);
    },
    matchups: { origin: 'https://api.test', fetchJson: async () => matchupPayload(), formatLabel: () => 'Стандарт', translate: name => name },
    getTranslations: async () => ({ source: 'database', map: {} }),
    loadArenaWinrates: async () => {
      if (world.arenaFails) throw new Error('Arena origin HTTP 502');
      return arenaDataset(world);
    },
    loadArenaSnapshot: () => (world.arenaSnapshotUpdatedAt
      ? { data: { ...arenaDataset(world), source: 'cached', updatedAt: world.arenaSnapshotUpdatedAt } } : null),
    loadHeroCatalog: async () => {
      if (world.heroesFail) throw new Error('Battleground hero catalog HTTP 502');
      return heroCatalog();
    },
    fetchJson: async () => patchList(),
    patchesUrl: 'https://api.test/api/patches?limit=20',
    onError: () => {},
  });
  const storedPayload = (date: string): string => {
    const database = new DatabaseSync(join(directory, 'meta-report-snapshots-v1', 'snapshots.sqlite'));
    try {
      return (database.prepare('SELECT payload FROM weekly_snapshots WHERE date = ?').get(date) as { payload: string }).payload;
    } finally {
      database.close();
    }
  };
  const cleanup = () => {
    snapshots.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const setNow = (iso: string) => t.mock.timers.setTime(Date.parse(iso));
  return { world, setNow, snapshots, directory, storedPayload, cleanup };
}

test('Monday 06:30 UTC records the open sections once; a second run of the day changes nothing', async t => {
  const { world, setNow, snapshots, storedPayload, cleanup } = harness(t);
  try {
    assert.equal(await snapshots.run(), 'recorded');
    const first = storedPayload('2026-11-23');
    const snapshot = snapshots.get('2026-11-23')!;
    assert.deepEqual(snapshots.list(), ['2026-11-23']);
    assert.equal(snapshot.date, '2026-11-23');
    assert.equal(snapshot.recordedAt, '2026-11-23T06:30:00.000Z');

    const { standard, matchups, arena, battlegrounds, patch } = snapshot.sections;
    assert.deepEqual({ ...standard, data: null }, {
      status: 'fresh', source: 'hsguru', updatedAt: '2026-11-23T05:00:00.000Z', fetchedAt: '2026-11-23T06:30:00.000Z', data: null,
    });
    assert.deepEqual({ ...standard.data!, items: standard.data!.items.length }, {
      format: 'standard', rank: 'diamond_legend', period: 'patch_37.0.2', currentPatchPeriod: 'patch_37.0.2', minGames: 100, totalGames: 81000, items: 20,
    });
    assert.deepEqual(standard.data!.items[0], {
      slug: 'archetype-1', archetype: 'Archetype 1', name: 'Архетип 1', classKey: 'mage', winrate: 55, popularity: 10, games: 5000,
    });
    assert.equal(matchups.status, 'fresh');
    assert.equal(matchups.data!.period, 'black_empire');
    assert.equal(matchups.data!.rank, 'all');
    assert.deepEqual(matchups.data!.rows[0], {
      archetype: 'Aggro Warlock', archetypeLabel: 'Aggro Warlock', classKey: 'warlock', winrate: 51.5, games: 6000,
      cells: [{ opponent: 'Aggro Warlock', winrate: null, games: 0 }, { opponent: "C'Thun DH", winrate: 54.2, games: 120 }],
    });
    assert.deepEqual(arena, {
      status: 'fresh', source: 'HSReplay', updatedAt: '2026-11-23T06:00:00.000Z', fetchedAt: '2026-11-23T06:30:00.000Z',
      data: { sampleUnit: 'drafts', classes: [
        { place: 1, id: 'MAGE', name: 'Маг', winrate: 52.3, sample: 1200 },
        { place: 2, id: 'ROGUE', name: 'Разбойник', winrate: 49.9, sample: 35 },
      ] },
    });
    assert.deepEqual(battlegrounds, {
      status: 'fresh', source: 'HSReplay', updatedAt: '2026-11-23T06:05:00.000Z', fetchedAt: '2026-11-23T06:30:00.000Z',
      data: { mode: 'solo', mmr: 'TOP_50_PERCENT', heroes: [
        { dbfId: 59201, cardId: 'BG25_HERO_100', name: 'Леди Ваш', tier: 'A', avgPlacement: 3.95, top4Rate: 60.1, pickRate: 30.5 },
      ] },
    });
    assert.deepEqual(patch, {
      status: 'fresh', source: 'api.kolodahearthstone.com', updatedAt: null, fetchedAt: '2026-11-23T06:30:00.000Z',
      data: { version: '37.0.2', build: '37.0.2', title: 'Обновление 37.0.2', publishedAt: '2026-11-03T18:30:16.000Z' },
    });

    // Later the same Monday the sources move on; the snapshot does not.
    setNow('2026-11-23T19:00:00Z');
    world.arenaWinrate = 58;
    assert.equal(await snapshots.run(), 'exists');
    assert.equal(storedPayload('2026-11-23'), first);
  } finally {
    cleanup();
  }
});

test('a stored snapshot cannot be updated or deleted', async t => {
  const { snapshots, directory, cleanup } = harness(t);
  try {
    assert.equal(await snapshots.run(), 'recorded');
    const database = new DatabaseSync(join(directory, 'meta-report-snapshots-v1', 'snapshots.sqlite'));
    try {
      assert.throws(() => database.prepare("UPDATE weekly_snapshots SET payload = '{}' WHERE date = '2026-11-23'").run(), /append-only/);
      assert.throws(() => database.prepare("DELETE FROM weekly_snapshots WHERE date = '2026-11-23'").run(), /append-only/);
      assert.throws(() => database.prepare("INSERT OR REPLACE INTO weekly_snapshots VALUES ('2026-11-23', 'x', '{}')").run(), /append-only/);
    } finally {
      database.close();
    }
    assert.equal(snapshots.get('2026-11-23')!.recordedAt, '2026-11-23T06:30:00.000Z');
  } finally {
    cleanup();
  }
});

test('nothing is recorded before Monday 06:30 UTC or on another day; a missed Monday is not written later', async t => {
  const { world, setNow, snapshots, cleanup } = harness(t, {}, Date.parse('2026-11-23T06:29:59Z'));
  try {
    assert.equal(await snapshots.run(), 'not-due');
    setNow('2026-11-22T12:00:00Z');
    assert.equal(await snapshots.run(), 'not-due');
    setNow('2026-11-24T06:30:00Z');
    assert.equal(await snapshots.run(), 'not-due');
    assert.deepEqual(snapshots.list(), []);
    setNow('2026-11-30T23:59:00Z');
    world.metaUpdatedAt = '2026-11-30T11:00:00.000Z';
    world.arenaUpdatedAt = '2026-11-30T06:00:00Z';
    assert.equal(await snapshots.run(), 'recorded');
    assert.deepEqual(snapshots.list(), ['2026-11-30']);
  } finally {
    cleanup();
  }
});

test('the stored snapshot holds no paid figure of the sources', async t => {
  const { world, snapshots, storedPayload, cleanup } = harness(t);
  try {
    const raw = JSON.stringify([metaPayload(world, 'legend', 'past_day'), matchupPayload(), arenaDataset(world), heroCatalog()]);
    assert.deepEqual(PAID.filter(label => !raw.includes(label)), [], 'every sentinel sits in a source payload');
    assert.equal(await snapshots.run(), 'recorded');
    const stored = storedPayload('2026-11-23');
    assert.deepEqual(PAID.filter(label => stored.includes(label)), []);
    assert.deepEqual(Object.keys(snapshots.get('2026-11-23')!.sections.standard.data!.items[0]).sort(), [
      'archetype', 'classKey', 'games', 'name', 'popularity', 'slug', 'winrate',
    ]);
  } finally {
    cleanup();
  }
});

test('a stale or small Standard section means no snapshot; stale Arena and failed Battlegrounds are marked', async t => {
  const stale = harness(t, { metaUpdatedAt: '2026-11-21T06:29:00.000Z' });
  try {
    assert.equal(await stale.snapshots.run(), 'standard-unavailable');
    assert.deepEqual(stale.snapshots.list(), []);
    // The source catches up later that Monday: the hourly check records the day then.
    stale.world.metaUpdatedAt = '2026-11-23T11:00:00.000Z';
    stale.setNow('2026-11-23T11:30:00Z');
    assert.equal(await stale.snapshots.run(), 'recorded');
  } finally {
    stale.cleanup();
  }

  const small = harness(t, { archetypes: 19 });
  try {
    assert.equal(await small.snapshots.run(), 'standard-unavailable');
    assert.deepEqual(small.snapshots.list(), []);
  } finally {
    small.cleanup();
  }

  const partial = harness(t, { arenaUpdatedAt: '2026-11-21T06:00:00Z', heroesFail: true });
  try {
    assert.equal(await partial.snapshots.run(), 'recorded');
    const { arena, battlegrounds } = partial.snapshots.get('2026-11-23')!.sections;
    assert.equal(arena.status, 'stale');
    assert.equal(arena.updatedAt, '2026-11-21T06:00:00.000Z');
    assert.equal(arena.data!.classes.length, 2);
    assert.deepEqual(battlegrounds, { status: 'missing', source: null, updatedAt: null, fetchedAt: '2026-11-23T06:30:00.000Z', data: null });
  } finally {
    partial.cleanup();
  }
});

test('an unwritable state directory fails the run and reports it, without throwing at startup', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: MONDAY_0630 });
  const directory = mkdtempSync(join(tmpdir(), 'meta-report-snapshots-'));
  const notADirectory = join(directory, 'file');
  writeFileSync(notADirectory, 'x');
  const errors: unknown[] = [];
  const snapshots = startMetaReportSnapshots({
    stateDirectory: notADirectory, hourly: false, now: () => Date.now(),
    loadMeta: async () => { throw new Error('not read'); },
    matchups: { origin: 'https://api.test', fetchJson: async () => ({}), formatLabel: () => 'Стандарт', translate: name => name },
    getTranslations: async () => ({}), loadArenaWinrates: async () => ({}), loadHeroCatalog: async () => ({}) as never,
    fetchJson: async () => ({}), patchesUrl: 'https://api.test/api/patches?limit=20',
    onError: error => { errors.push(error); },
  });
  try {
    assert.equal(await snapshots.run(), 'failed');
    assert.equal(errors.length, 1);
  } finally {
    snapshots.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a run that crosses midnight writes nothing: a snapshot is dated by the day it is taken', async t => {
  const late = harness(t, {}, Date.parse('2026-11-23T23:59:30Z'));
  try {
    late.world.onMetaRead = () => late.setNow('2026-11-24T00:00:05Z');
    assert.equal(await late.snapshots.run(), 'not-due');
    assert.deepEqual(late.snapshots.list(), []);
  } finally {
    late.cleanup();
  }
});

test('Arena falls back to the local snapshot as the guest teaser does: when it is fresher or the origin fails', async t => {
  const fresher = harness(t, { arenaUpdatedAt: '2026-11-23T03:00:00Z', arenaSnapshotUpdatedAt: '2026-11-23T06:00:00Z' });
  try {
    assert.equal(await fresher.snapshots.run(), 'recorded');
    const { arena } = fresher.snapshots.get('2026-11-23')!.sections;
    assert.equal(arena.status, 'fresh');
    assert.equal(arena.updatedAt, '2026-11-23T06:00:00.000Z');
  } finally {
    fresher.cleanup();
  }

  const down = harness(t, { arenaFails: true, arenaSnapshotUpdatedAt: '2026-11-23T05:00:00Z' });
  try {
    assert.equal(await down.snapshots.run(), 'recorded');
    const { arena } = down.snapshots.get('2026-11-23')!.sections;
    assert.equal(arena.status, 'fresh');
    assert.equal(arena.updatedAt, '2026-11-23T05:00:00.000Z');
  } finally {
    down.cleanup();
  }

  const none = harness(t, { arenaFails: true });
  try {
    assert.equal(await none.snapshots.run(), 'recorded');
    assert.equal(none.snapshots.get('2026-11-23')!.sections.arena.status, 'missing');
  } finally {
    none.cleanup();
  }
});
