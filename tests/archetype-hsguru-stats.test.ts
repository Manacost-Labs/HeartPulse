import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {
  createArchetypeHsguruStatsHandler, createHsguruStatsReader, normalizeHsguruCards, pickDefaultHsguruSlice, readHsguruStatSlice,
  type HsguruSliceEntry,
} from '../server/modules/constructedArchetypes/public.js';

// Shapes of hs-data-api /v1/hsguru/mulligan* and /class-matchups on 25.10.2026.
const card = (name: string, mulligan: number, drawn: number) => ({
  position: 0, card_id: `ID_${name}`, dbf_id: name.length, card_name: name,
  mulligan_impact: 3.5, mulligan_count: mulligan, drawn_impact: -0.6, drawn_count: drawn,
  not_drawn_impact: 0.6, not_drawn_count: 1242, kept_impact: 6.5, kept_count: 314,
});
const page = (extra: Record<string, unknown>) => ({
  kind: 'cards', subject_type: 'archetype', format: 'standard', archetype: 'Zoolock', deck_id: null,
  rank: 'legend', period: 'black_empire', coin: 'any_player', opponent_class: 'any', games: 51613, winrate: null,
  changed_at: '2026-10-25T11:28:30+00:00', checked_at: '2026-10-25T11:28:30+00:00', active: true, stale: false,
  source_url: 'https://www.hsguru.com/card-stats?archetype=Zoolock', ...extra,
});
const slice = (extra: Record<string, unknown>) => ({
  kind: 'cards', rank: 'legend', period: 'black_empire', coin: 'any_player', opponent_class: 'any',
  active: 1, state: 'ok', last_success_at: '2026-10-25T11:28:30+00:00', last_games: 51613, ...extra,
});

function upstream(routes: Record<string, unknown>) {
  const paths: string[] = [];
  const request = async (path: string) => {
    paths.push(path);
    const key = Object.keys(routes).find(prefix => path.startsWith(prefix));
    const body = key === undefined ? undefined : routes[key];
    if (body === undefined) return new Response(JSON.stringify({ detail: 'This slice is not collected yet' }), { status: 404 });
    if (body instanceof Error) return new Response('down', { status: 503 });
    return Response.json(body);
  };
  return { request, paths };
}

test('a slice request takes HSGuru defaults and rejects unknown values', () => {
  assert.deepEqual(readHsguruStatSlice({}), { rank: 'legend', period: 'current', coin: 'any_player', opponentClass: 'any' });
  assert.deepEqual(readHsguruStatSlice({ rank: 'all', period: 'black_empire_ban', coin: 'on_coin', opponent: 'MAGE' }),
    { rank: 'all', period: 'black_empire_ban', coin: 'on_coin', opponentClass: 'MAGE' });
  assert.equal(readHsguruStatSlice({ rank: 'bronze' }), null);
  assert.equal(readHsguruStatSlice({ period: '../admin' }), null);
  assert.equal(readHsguruStatSlice({ opponent: 'mage' }), null);
});

test('cards outside HSGuru default sample are dropped and Not Drawn is kept', () => {
  const rows = normalizeHsguruCards([card('Forge', 633, 1946), card('Deathwing', 1, 16), card('Dryad', 30, 10)]);
  assert.deepEqual(rows.map(row => row.cardName), ['Forge']);
  assert.equal(rows[0].notDrawnImpact, 0.6);
  assert.equal(rows[0].notDrawnCount, 1242);
});

test('the default slice prefers the Bans window, then Legend, any coin and class', () => {
  const entry = (rank: string, period: string, extra: Partial<HsguruSliceEntry> = {}) => ({
    kind: 'cards', rank, period, coin: 'any_player', opponentClass: 'any', games: 1, checkedAt: null, ...extra,
  }) as HsguruSliceEntry;
  assert.deepEqual(pickDefaultHsguruSlice([
    entry('all', 'black_empire'), entry('legend', 'black_empire'), entry('legend', 'past_day'),
    entry('all', 'black_empire_ban'), entry('legend', 'black_empire_ban', { coin: 'on_coin' }),
  ]), { rank: 'all', period: 'black_empire_ban', coin: 'any_player', opponentClass: 'any' });
  assert.deepEqual(pickDefaultHsguruSlice([entry('all', 'black_empire'), entry('legend', 'black_empire')]),
    { rank: 'legend', period: 'black_empire', coin: 'any_player', opponentClass: 'any' });
  assert.equal(pickDefaultHsguruSlice([entry('legend', 'black_empire', { kind: 'matchups' })]), null);
});

test('the reader opens the collected slice and reports a missing one as null', async () => {
  const { request, paths } = upstream({
    'v1/hsguru/mulligan/slices': { data: [slice({}), slice({ rank: 'all', state: 'pending' }), slice({ kind: 'matchups', active: 0 })] },
    'v1/hsguru/mulligan/coverage': { data: { coverage: [
      { active: 1, targets: 200, with_data: 200 }, { active: 1, targets: 2831, with_data: 0 }, { active: 0, targets: 9, with_data: 9 },
    ] } },
    'v1/hsguru/mulligan?archetype=Zoolock&format=standard&rank=legend&period=black_empire&': {
      data: page({ rows: [card('Forge', 633, 1946)] }),
    },
  });
  const reader = createHsguruStatsReader({ request });
  const opened = await reader.read('standard', 'Zoolock', null);
  assert.deepEqual(opened.slice, { rank: 'legend', period: 'black_empire', coin: 'any_player', opponentClass: 'any' });
  assert.equal(opened.mulligan?.games, 51613);
  assert.deepEqual(opened.mulligan?.rows.map(row => row.cardName), ['Forge']);
  assert.equal(opened.classMatchups, null);
  assert.equal(opened.slices.length, 1, 'pending and retired pages are not offered');
  assert.deepEqual(opened.coverage, { collected: 200, planned: 3031 });
  assert.ok(paths.some(path => path.startsWith('v1/hsguru/class-matchups?') && !path.includes('opponent_class')));

  const bans = await reader.read('standard', 'Zoolock', readHsguruStatSlice({ period: 'black_empire_ban' }));
  assert.equal(bans.mulligan, null);
  const before = paths.length;
  await reader.read('standard', 'Zoolock', readHsguruStatSlice({ period: 'black_empire_ban' }));
  assert.equal(paths.length, before, 'a missing slice is cached like data');
});

test('a failed card read fails, failed optional reads only empty their part', async () => {
  const { request } = upstream({
    'v1/hsguru/mulligan/slices': new Error('down'),
    'v1/hsguru/mulligan/coverage': new Error('down'),
    'v1/hsguru/class-matchups': new Error('down'),
    'v1/hsguru/mulligan?': { data: page({ rows: [] }) },
  });
  const stats = await createHsguruStatsReader({ request }).read('standard', 'Zoolock', null);
  assert.deepEqual([stats.slices, stats.coverage, stats.classMatchups], [[], null, null]);
  assert.ok(stats.mulligan);
  const failing = upstream({ 'v1/hsguru/mulligan?': new Error('down') });
  await assert.rejects(createHsguruStatsReader({ request: failing.request }).read('standard', 'Zoolock', null), /Upstream HTTP 503/);
});

test('the route validates the address and the slice and localizes the cards', async () => {
  const reads: unknown[] = [];
  const app = express();
  app.get('/stats/:format/:slug', createArchetypeHsguruStatsHandler({
    findArchetype: async (_format, slug) => (slug === 'zoolock' ? 'Zoolock' : null),
    read: async (_format, archetype, requested) => {
      reads.push([archetype, requested]);
      return {
        slice: requested ?? { rank: 'legend', period: 'black_empire', coin: 'any_player', opponentClass: 'any' },
        mulligan: { rank: 'legend', period: 'black_empire', coin: 'any_player', opponentClass: 'any', games: 1, winrate: null,
          changedAt: null, checkedAt: null, stale: false, sourceUrl: '', rows: normalizeHsguruCards([card('Forge', 633, 1946)]) },
        classMatchups: null, slices: [], coverage: null,
      };
    },
    localizeCards: async (_format, rows) => rows.map(row => ({ ...row, cardName: 'Кузня', cost: 2 })),
    setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  }));
  const server = app.listen(0);
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/stats`;
    const opened = await fetch(`${base}/standard/zoolock`);
    assert.equal(opened.status, 200);
    assert.equal(opened.headers.get('cache-control'), 'private, no-store');
    const body = await opened.json();
    assert.deepEqual([body.mulligan.rows[0].cardName, body.mulligan.rows[0].cost], ['Кузня', 2]);
    assert.equal((await fetch(`${base}/standard/zoolock?coin=on_coin`)).status, 200);
    assert.deepEqual(reads, [['Zoolock', null], ['Zoolock', { rank: 'legend', period: 'current', coin: 'on_coin', opponentClass: 'any' }]]);
    assert.equal((await fetch(`${base}/standard/zoolock?rank=gold`)).status, 400);
    assert.equal((await fetch(`${base}/arena/zoolock`)).status, 400);
    assert.equal((await fetch(`${base}/standard/unknown`)).status, 404);
  } finally {
    server.close();
  }
});
