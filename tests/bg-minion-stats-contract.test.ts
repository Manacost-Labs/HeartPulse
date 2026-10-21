import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express from 'express';
import {
  hasBattlegroundMinionStats,
  parseBattlegroundMinionStats,
} from '../server/modules/battlegroundLibrary/minionStatsContract.js';
import {
  createBattlegroundMinionStatsRouter,
  createBattlegroundMinionStatsSource,
  type BattlegroundMinionStatsRead,
} from '../server/modules/battlegroundLibrary/minionStats.js';

const fixture = (dbfId: number) => JSON.parse(readFileSync(new URL(`./fixtures/bg-minion-stats-${dbfId}-20261021.json`, import.meta.url), 'utf8'));
const lowTier = fixture(104551);
const highTier = fixture(130298);

test('a real upstream payload keeps the drawn numbers, nulls and same-origin images', () => {
  const stats = parseBattlegroundMinionStats(lowTier.data);
  assert.equal(stats.minion.dbfId, 104551);
  assert.equal(stats.minion.images.art, '/api/public-resource/db/uploads/art/BG28_300.jpg');
  assert.equal(stats.minion.images.cardGolden, '/api/public-resource/db/uploads/framed/BG28_300_G.png');
  assert.deepEqual(
    [stats.normal?.placementWith, stats.normal?.placementWithout, stats.normal?.combatWinrate, stats.normal?.gamesWith],
    [3.9514, 3.651, 56.83, 18161],
  );
  assert.equal(stats.rounds.length, 16);
  assert.equal(stats.rounds[15].normal, null, 'round 16 has no sample');
  assert.deepEqual(stats.rounds[2].median, { normal: [1, 1], golden: [2, 2] });
  assert.deepEqual(stats.purchases[0].copies, [20.874, null, null]);
  assert.deepEqual(stats.purchases[1].discover, [31.624, 53.425, null]);
  assert.equal(stats.positions.normal?.slots.length, 7);
  assert.equal(stats.positions.taunt?.slots[0].impact, null, 'below 200 boards the slot impact stays null');
  assert.equal(stats.positions.compositions[0].name, 'Мурлоки');
  assert.equal(stats.slice.mmr, 'TOP_50_PERCENT');
  assert.equal(stats.slice.updatedAt, '2026-10-21T13:41:24Z', 'the newest upstream table dates the slice');
  assert.equal(JSON.stringify(stats).includes('methodology'), false, 'English formula text never reaches the page');
  assert.equal(parseBattlegroundMinionStats(highTier.data).positions.defaultBoard, 'normal');
});

test('a pool minion without games has no totals', () => {
  const data = structuredClone(lowTier.data);
  data.normal = { impact: null, combat_winrate: null, popularity: null, games_with_minion: 0, games_without_minion: 0, avg_placement_with: null, avg_placement_without: null, wins: 0, losses: 0 };
  data.golden = null;
  assert.equal(hasBattlegroundMinionStats(parseBattlegroundMinionStats(data)), false);
});

test('a broken upstream shape is rejected instead of drawn', () => {
  const broken = (mutate: (data: any) => void) => {
    const data = structuredClone(lowTier.data);
    mutate(data);
    return () => parseBattlegroundMinionStats(data);
  };
  assert.throws(broken(data => { data.normal.combat_winrate = 140; }), /normal.combat_winrate/);
  assert.throws(broken(data => { data.rounds = 'x'; }), /rounds/);
  assert.throws(broken(data => { data.minion.dbf_id = -1; }), /dbf_id/);
  assert.throws(broken(data => { data.positions.normal.positions[0].occurrences = 1.5; }), /occurrences/);
  assert.throws(() => parseBattlegroundMinionStats(null), /data must be an object/);
});

function upstream(responses: Array<() => Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: URL | string) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('the source caches, coalesces and never caches a failure', async () => {
  let time = 0;
  const { calls, fetchImpl } = upstream([json({}, 503), json(lowTier), json({ detail: 'missing' }, 404)]);
  const source = createBattlegroundMinionStatsSource({ baseUrl: 'https://data.test/', fetchImpl, ttlMs: 1000, now: () => time });
  await assert.rejects(source.read(104551), /HTTP 503/);
  const [first, second] = await Promise.all([source.read(104551), source.read(104551)]);
  assert.equal(first, second);
  assert.equal(first.status, 'ok');
  assert.equal((await source.read(104551)).status, 'ok');
  assert.deepEqual(calls, ['https://data.test/v1/battlegrounds/minions/104551/stats', 'https://data.test/v1/battlegrounds/minions/104551/stats']);
  time = 2000;
  assert.deepEqual(await source.read(104551, 8), { status: 'missing' });
  assert.equal(calls[2], 'https://data.test/v1/battlegrounds/minions/104551/stats?composition=8');
});

test('the source refuses another minion and treats an unplayed minion as missing', async () => {
  const empty = structuredClone(lowTier);
  empty.data.normal.games_with_minion = 0;
  empty.data.golden.games_with_minion = 0;
  const { fetchImpl } = upstream([json(highTier), json(empty)]);
  const source = createBattlegroundMinionStatsSource({ baseUrl: 'https://data.test', fetchImpl });
  await assert.rejects(source.read(104551), /another minion/);
  assert.deepEqual(await source.read(104551), { status: 'missing' });
});

test('the route checks access and input and answers 200, 404 or 502', async () => {
  const stats = parseBattlegroundMinionStats(lowTier.data);
  const reads: Array<[number, number]> = [];
  const errors: unknown[] = [];
  let guarded = 0;
  const app = express();
  app.use('/api', createBattlegroundMinionStatsRouter({
    requireAccess: (_request, _response, next) => { guarded++; next(); },
    read: async (dbfId, composition): Promise<BattlegroundMinionStatsRead> => {
      reads.push([dbfId, composition]);
      if (dbfId === 1) return { status: 'missing' };
      if (dbfId === 2) throw new Error('upstream down');
      return { status: 'ok', stats };
    },
    onError: error => errors.push(error),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}/api/bg/library/minions`;
  try {
    const ok = await fetch(`${origin}/104551/stats?composition=8`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'private, no-store, max-age=0, must-revalidate');
    assert.equal(((await ok.json()) as { minion: { dbfId: number } }).minion.dbfId, 104551);
    assert.equal((await fetch(`${origin}/1/stats`)).status, 404);
    assert.equal((await fetch(`${origin}/2/stats`)).status, 502);
    assert.equal((await fetch(`${origin}/0/stats`)).status, 400);
    assert.equal((await fetch(`${origin}/104551/stats?composition=-1`)).status, 400);
    assert.equal((await fetch(`${origin}/104551/stats?composition=1&composition=2`)).status, 400);
    assert.deepEqual(reads, [[104551, 8], [1, 0], [2, 0]]);
    assert.equal(guarded, 6);
    assert.equal(errors.length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
