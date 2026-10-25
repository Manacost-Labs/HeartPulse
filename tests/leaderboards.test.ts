import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {
  LeaderboardContractError, parseLeaderboardPlayer, parseLeaderboardStats, parseLeaderboardTable, parsePlayerHits, parseSeasonCatalog,
  type LeaderboardPlayer, type LeaderboardStats, type LeaderboardTable,
} from '../server/modules/leaderboards/contract.js';
import { createLeaderboardsRouter } from '../server/modules/leaderboards/routes.js';
import { createLeaderboardsService } from '../server/modules/leaderboards/service.js';
import type {
  LeaderboardPlayer as PagePlayer, LeaderboardStats as PageStats, LeaderboardTable as PageTable,
} from '../src/modules/leaderboards/model/types.js';
import {
  formatLeaderboardTime, formatPlayers, formatRating, formatRatingTick, formatSeasonLabel, leaderboardApiQuery, leaderboardSearch, leaderboardSeasons,
  parseLeaderboardSelection, playersDelta, rankChange,
} from '../src/modules/leaderboards/model/leaderboardsView.js';

// Ответы hs-data-api /v1/leaderboards* в его формате ({ data, meta }), как на живом прогоне 25.10.2026.
const BOARD = { region: 'EU', mode: 'battlegrounds', season_id: 19, season_start: null, is_latest: true, final: false, rated: true };
const SNAPSHOT = { day: '2026-10-25', captured_at: '2026-10-25T16:10:02+00:00', total_size: 6543, stored_rows: 6543, truncated: false, final: false, stale: false };
const upstreamTable = () => ({
  data: {
    board: BOARD, snapshot: SNAPSHOT, days: ['2026-10-24', '2026-10-25'], query: null, total: 6543,
    rows: [
      { rank: 1, name: 'XQN', rating: 20104, previous_rank: 2 },
      { rank: 2, name: 'СтоякБезДела\u0007', rating: 19861, previous_rank: null },
    ],
  },
  meta: { source_id: 'blizzard_leaderboards', stale: false, count: 6543, limit: 50, offset: 0 },
});
const upstreamStats = () => ({
  data: {
    board: BOARD, snapshot: SNAPSHOT, top_rating: 20104,
    thresholds: [{ rank: 100, reached: true, rating: 13010 }, { rank: 1000, reached: true, rating: 10120 }, { rank: 5000, reached: true, rating: 8320 }],
    rating: { rated_players: 6543, min: 8000, max: 20104, mean: 9480.2, median: 9010 },
    histogram: [{ from: 8000, to: 8500, players: 1800 }, { from: 8500, to: 9000, players: 1300 }],
    histogram_bucket: 500,
    series: [
      { day: '2026-10-24', total_size: 6400, rating_at_1: 20050, rating_at_100: 12990, rating_at_1000: 10100, rating_at_5000: 8300 },
      { day: '2026-10-25', total_size: 6543, rating_at_1: 20104, rating_at_100: 13010, rating_at_1000: 10120, rating_at_5000: 8320 },
    ],
  },
});
const upstreamPlayer = () => ({
  data: {
    player: { region: 'EU', name: 'XQN' }, shared_name: false,
    seasons: [{
      mode: 'battlegrounds', season_id: 19, season_start: null, is_latest: true, final: false, rated: true,
      best_rank: 1, best_day: '2026-10-25', last_rank: 1, last_rating: 20104, last_day: '2026-10-25', in_latest_snapshot: true, days: 2,
      series: [
        { day: '2026-10-24', rank: 2, rating: 20050, total_size: 6400, final: false },
        { day: '2026-10-25', rank: 1, rating: 20104, total_size: 6543, final: false },
      ],
    }],
  },
});
const upstreamSeasons = () => ({
  data: {
    regions: ['EU', 'US', 'AP'],
    modes: [
      { mode: 'classic', rated: false, regions: {} },
      {
        mode: 'standard', rated: false, regions: {
          EU: { latest_season: 156, seasons: [
            { season_id: 155, season_start: '2026-09-01', is_latest: false, final: true, has_data: true, day: '2026-10-25', total_size: 23663 },
            { season_id: 156, season_start: '2026-10-01', is_latest: true, final: false, has_data: true, day: '2026-10-25', total_size: 16625 },
            { season_id: 154, season_start: '2026-08-01', is_latest: false, final: false, has_data: false, day: null, total_size: null },
          ] },
        },
      },
    ],
  },
});

test('the leaderboard contract maps hs-data-api responses to the page model', () => {
  const table = parseLeaderboardTable(upstreamTable(), 1, 50);
  // Типы страницы повторяют контракт сервера: присваивание в обе стороны ломает проверку типов при расхождении.
  const forPage: PageTable = table;
  const fromPage: LeaderboardTable = forPage;
  assert.deepEqual(fromPage.board, { mode: 'battlegrounds', region: 'EU', season: 19, seasonStart: null, latest: true, final: false, rated: true });
  assert.equal(table.snapshot.capturedAt, '2026-10-25T16:10:02.000Z', 'times leave as ISO');
  assert.deepEqual([table.total, table.pages, table.hasPrevious], [6543, 131, true]);
  assert.equal(table.rows[1].name, 'СтоякБезДела', 'control characters are dropped from names');
  assert.deepEqual(table.rows.map(row => row.previousRank), [2, null]);

  const stats = parseLeaderboardStats(upstreamStats());
  const statsForPage: PageStats = stats;
  const statsFromPage: LeaderboardStats = statsForPage;
  assert.deepEqual(statsFromPage.thresholds.map(item => item.rating), [13010, 10120, 8320]);
  assert.deepEqual(stats.series[1], { day: '2026-10-25', players: 6543, top: 20104, at100: 13010, at1000: 10120, at5000: 8320 });
  assert.equal(parseLeaderboardStats({ data: { ...upstreamStats().data, rating: null, histogram: null } }).histogram, null, 'unrated modes have no histogram');

  const player = parseLeaderboardPlayer(upstreamPlayer());
  const playerForPage: PagePlayer = player;
  const playerFromPage: LeaderboardPlayer = playerForPage;
  assert.deepEqual(playerFromPage.seasons[0].series.map(point => point.rank), [2, 1]);

  const catalog = parseSeasonCatalog(upstreamSeasons());
  assert.deepEqual(catalog.modes.map(mode => mode.mode), ['standard'], 'modes the site does not show are skipped');
  assert.deepEqual(catalog.modes[0].regions.EU.map(season => season.id), [156, 155], 'only stored seasons, newest first');
  assert.deepEqual(catalog.modes[0].regions.US, []);

  assert.deepEqual(parsePlayerHits({ data: [{ region: 'US', name: 'Exodius003', current: [{ mode: 'battlegroundsduo', season_id: 19, rank: 12, rating: 18679 }, { mode: 'mercenaries', season_id: 60, rank: 1, rating: 1 }] }] }),
    [{ region: 'US', name: 'Exodius003', current: [{ mode: 'battlegroundsduo', season: 19, rank: 12, rating: 18679 }] }]);

  assert.throws(() => parseLeaderboardTable({ data: { ...upstreamTable().data, board: { ...BOARD, mode: 'mercenaries' } } }, 1, 50), LeaderboardContractError);
  assert.throws(() => parseLeaderboardTable({ data: { ...upstreamTable().data, rows: [{ rank: 0, name: 'x' }] } }, 1, 50), LeaderboardContractError);
  assert.throws(() => parseLeaderboardStats({ error: 'down' }), LeaderboardContractError);
});

test('the service asks hs-data-api once per URL, maps 404 to null and never caches failures', async () => {
  const urls: string[] = [];
  let failNext = false;
  let clock = 0;
  const service = createLeaderboardsService({
    baseUrl: 'https://api.test/',
    now: () => clock,
    fetchJson: async url => {
      urls.push(url);
      if (failNext) { failNext = false; throw new Error('HTTP 500'); }
      if (url.includes('/player')) return null;
      return url.includes('/stats') ? upstreamStats() : upstreamTable();
    },
  });
  const query = { mode: 'battlegrounds' as const, region: 'EU' as const, season: null, page: 3, query: 'xq' };
  const [first, second] = await Promise.all([service.table(query), service.table(query)]);
  assert.equal(first, second);
  assert.deepEqual(urls, ['https://api.test/v1/leaderboards?mode=battlegrounds&region=EU&q=xq&limit=50&offset=100']);
  assert.equal(first?.page, 3);
  assert.equal(await service.player('EU', 'nobody'), null, 'a 404 is «not found», not an error');
  clock = 121_000;
  failNext = true;
  await assert.rejects(service.stats({ mode: 'battlegrounds', region: 'EU', season: 19 }), /HTTP 500/);
  assert.ok(await service.stats({ mode: 'battlegrounds', region: 'EU', season: 19 }), 'the failure is not cached');
  assert.equal(urls.filter(url => url.includes('/stats')).length, 2);
});

test('the routes validate parameters and keep hs-data-api errors out of the edge cache', async () => {
  const service = createLeaderboardsService({
    baseUrl: 'https://api.test',
    fetchJson: async url => {
      if (url.includes('region=AP')) throw new Error('HTTP 503');
      if (url.includes('season=150')) return null;
      if (url.includes('/seasons')) return upstreamSeasons();
      return url.includes('/stats') ? upstreamStats() : upstreamTable();
    },
  });
  const server = express().use('/api', createLeaderboardsRouter({ service, onError: () => undefined })).listen(0);
  try {
    const { port } = server.address() as { port: number };
    const get = (path: string) => fetch(`http://127.0.0.1:${port}/api/leaderboards${path}`);
    const table = await get('/table?mode=battlegrounds&region=EU&page=1');
    assert.equal(table.status, 200);
    assert.equal(table.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
    assert.equal((await table.json()).rows[0].name, 'XQN');
    assert.equal((await get('/seasons')).status, 200);
    for (const bad of ['/table?mode=mercenaries', '/table?page=0', '/table?page=1001', '/table?season=-1', `/table?q=${'x'.repeat(33)}`,
      '/player?region=EU', '/players?q=x', '/stats?region=CN']) {
      assert.equal((await get(bad)).status, 400, bad);
    }
    const missing = await get('/table?season=150');
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Эта таблица ещё не собрана' });
    const down = await get('/stats?region=AP');
    assert.equal(down.status, 502);
    assert.equal(down.headers.get('cache-control'), 'no-store');
  } finally {
    server.close();
  }
});

test('the page model keeps the selection in the URL and formats without Intl clocks', () => {
  const selection = parseLeaderboardSelection(new URLSearchParams('mode=battlegrounds&region=US&season=19&page=3&q=%20xqn%20&player=XQN'));
  assert.deepEqual(selection, { mode: 'battlegrounds', region: 'US', season: 19, page: 3, query: 'xqn', player: 'XQN' });
  assert.equal(leaderboardSearch(selection), '?mode=battlegrounds&region=US&season=19&page=3&q=xqn&player=XQN');
  assert.equal(leaderboardApiQuery(selection, true), 'mode=battlegrounds&region=US&season=19&page=3&q=xqn');
  assert.equal(leaderboardApiQuery(selection, false), 'mode=battlegrounds&region=US&season=19');
  const fallback = parseLeaderboardSelection(new URLSearchParams('mode=hacks&region=CN&page=-2&season=abc'));
  assert.deepEqual(fallback, { mode: 'standard', region: 'EU', season: null, page: 1, query: '', player: null });
  assert.equal(leaderboardSearch(fallback), '', 'defaults keep the URL clean');

  assert.equal(formatSeasonLabel({ id: 156, start: '2026-10-01', latest: true }), 'Сезон 156 · октябрь 2026 — текущий');
  assert.equal(formatSeasonLabel({ id: 19, start: null }), 'Сезон 19');
  assert.equal(formatLeaderboardTime('2026-10-25T16:10:02Z'), '25 октября, 19:10 МСК');
  assert.equal(formatPlayers(25469), '25 469');
  assert.equal(formatRating('arena', 9.1), '9,10');
  assert.equal(formatRating('battlegrounds', 20104.4), '20 104');
  assert.equal(formatRating('standard', null), '—');
  assert.deepEqual([8000, 8500, 12000, 7.5].map(formatRatingTick), ['8к', '8,5к', '12к', '7,5']);

  assert.equal(rankChange(5, 8, true)?.label, '▲ 3');
  assert.equal(rankChange(9, 4, true)?.kind, 'down');
  assert.equal(rankChange(3, null, true)?.label, 'Новый');
  assert.equal(rankChange(3, null, false), null, 'without a previous snapshot there is nothing to compare');
  assert.equal(playersDelta(parseLeaderboardStats(upstreamStats())), 143);
  assert.deepEqual(leaderboardSeasons(parseSeasonCatalog(upstreamSeasons()), 'standard', 'EU').map(season => season.id), [156, 155]);
  assert.deepEqual(leaderboardSeasons(null, 'wild', 'AP'), []);
});
