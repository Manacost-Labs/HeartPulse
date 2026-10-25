import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {
  LeaderboardContractError, parseLeaderboardPlayer, parseLeaderboardStats, parseLeaderboardTable, parsePlayerHits, parseSeasonCatalog,
  type LeaderboardPlayer, type LeaderboardStats, type LeaderboardTable,
} from '../server/modules/leaderboards/contract.js';
import { createLeaderboardsRouter } from '../server/modules/leaderboards/routes.js';
import { createLeaderboardsService } from '../server/modules/leaderboards/service.js';
import { buildStreamerIndex, createStreamerDirectory } from '../server/modules/leaderboards/streamers.js';
import type {
  LeaderboardPlayer as PagePlayer, LeaderboardStats as PageStats, LeaderboardTable as PageTable,
} from '../src/modules/leaderboards/model/types.js';
import {
  formatLeaderboardTime, formatPlayers, formatRating, formatRatingTick, formatSeasonLabel, leaderboardApiQuery, leaderboardSearch, leaderboardSeasons,
  parseLeaderboardSelection, playersDelta, rankChange,
} from '../src/modules/leaderboards/model/leaderboardsView.js';
import { histogramBars, histogramTicks, playersLabel, summaryLine } from '../src/modules/leaderboards/model/leaderboardSummary.js';
import {
  bestSeason, modeSeasons, playerModes, plotPoints, profilePoints, profileUsesRating, profileViews,
} from '../src/modules/leaderboards/model/playerProfile.js';
import { myNickRank } from '../src/modules/leaderboards/ui/useMyNick.js';

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
    streamers: async () => () => null,
    fetchJson: async url => {
      urls.push(url);
      if (failNext) { failNext = false; throw new Error('HTTP 500'); }
      if (url.includes('/player')) return null;
      return url.includes('/stats') ? upstreamStats() : upstreamTable();
    },
  });
  const query = { mode: 'battlegrounds' as const, region: 'EU' as const, season: null, page: 3, query: 'xq' };
  const [first, second] = await Promise.all([service.table(query), service.table(query)]);
  assert.deepEqual(first, second);
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
  assert.deepEqual(selection, { mode: 'battlegrounds', region: 'US', season: 19, page: 3, query: 'xqn', player: 'XQN', rank: null });
  assert.equal(leaderboardSearch(selection), '?mode=battlegrounds&region=US&season=19&page=3&q=xqn&player=XQN');
  assert.equal(leaderboardApiQuery(selection, true), 'mode=battlegrounds&region=US&season=19&page=3&q=xqn');
  assert.equal(leaderboardApiQuery(selection, false), 'mode=battlegrounds&region=US&season=19');
  const fallback = parseLeaderboardSelection(new URLSearchParams('mode=hacks&region=CN&page=-2&season=abc'));
  assert.deepEqual(fallback, { mode: 'standard', region: 'EU', season: null, page: 1, query: '', player: null, rank: null });
  assert.equal(leaderboardSearch(fallback), '', 'defaults keep the URL clean');
  const jumped = parseLeaderboardSelection(new URLSearchParams('rank=1001&page=7'));
  assert.deepEqual([jumped.rank, jumped.page], [1001, 21], 'the place sets its own page');
  assert.equal(leaderboardSearch(jumped), '?rank=1001', 'the place link carries no page');
  assert.equal(parseLeaderboardSelection(new URLSearchParams('rank=50001')).rank, null, 'beyond the stored places');
  assert.equal(parseLeaderboardSelection(new URLSearchParams('rank=5&q=bob')).rank, null, 'a search has no place to jump to');

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

test('streamer badges match Blizzard names to the HSGuru catalog without false friends', async () => {
  const index = buildStreamerIndex([
    { slug: 'moquaitv', displayName: 'MoquaiTV', login: 'moquaitv' },
    { slug: 'theohs_', displayName: 'TheoHS_', login: 'theohs_' },
    { slug: 'lugozzi__', displayName: 'Lugozzi__', login: 'lugozzi__' },
    { slug: 'pizzahs', displayName: 'PizzaHS', login: 'pizzahs' },
    // Два разных стримера с одним ключом: значка нет ни у одного.
    { slug: 'zeddy', displayName: 'Zeddy', login: 'zeddy' },
    { slug: 'zeddy_', displayName: 'zeddy_', login: 'zeddy_' },
  ]);
  assert.deepEqual(index.get('moquai'), { slug: 'moquaitv', name: 'MoquaiTV' }, 'a long name without the TV tail');
  assert.deepEqual(index.get('lugozzi'), { slug: 'lugozzi__', name: 'Lugozzi__' }, 'underscores are not part of a BattleTag');
  assert.equal(index.get('theo'), undefined, 'a short name without its tail would match any Theo');
  assert.equal(index.get('pizza'), undefined);
  assert.equal(index.get('zeddy'), undefined, 'an ambiguous name gets no badge');

  const urls: string[] = [];
  let clock = 0;
  let fail = false;
  const page = (offset: number) => Array.from({ length: offset === 0 ? 100 : 2 }, (_, index) => ({ slug: `s${offset + index}`, display_name: `Streamer${offset + index}` }));
  const lookup = createStreamerDirectory({
    baseUrl: 'https://api.test', now: () => clock,
    fetchJson: async url => {
      urls.push(url);
      if (fail) throw new Error('HTTP 503');
      return { data: page(Number(new URL(url).searchParams.get('offset'))) };
    },
  });
  assert.deepEqual((await lookup())('streamer101'), { slug: 's101', name: 'Streamer101' });
  assert.deepEqual(urls, [
    'https://api.test/v1/hsguru/streamers?days=0&decks=0&limit=100&offset=0',
    'https://api.test/v1/hsguru/streamers?days=0&decks=0&limit=100&offset=100',
  ], 'pages are read until a short one');
  await lookup();
  assert.equal(urls.length, 2, 'the catalog is cached');
  clock = 31 * 60_000;
  fail = true;
  assert.deepEqual((await lookup())('Streamer1'), { slug: 's1', name: 'Streamer1' }, 'a stale catalog answers while it refreshes');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await lookup())('Streamer1'), { slug: 's1', name: 'Streamer1' }, 'a failed refresh keeps the previous catalog');

  const broken = createStreamerDirectory({ baseUrl: 'https://api.test', fetchJson: async () => { throw new Error('down'); } });
  assert.equal((await broken())('Streamer1'), null, 'without a catalog the table simply has no badges');
});

test('the service adds streamers to rows and the regions where a name exists', async () => {
  const service = createLeaderboardsService({
    baseUrl: 'https://api.test',
    streamers: async () => name => (name === 'XQN' ? { slug: 'xqn', name: 'XQN' } : null),
    fetchJson: async url => {
      if (url.includes('/player')) {
        const region = new URL(url).searchParams.get('region');
        if (region === 'AP') throw new Error('HTTP 503');
        return region === 'EU' || region === 'US' ? upstreamPlayer() : null;
      }
      return upstreamTable();
    },
  });
  const table = await service.table({ mode: 'battlegrounds', region: 'EU', season: null, page: 1, query: null });
  assert.deepEqual(table?.rows.map(row => row.streamer), [{ slug: 'xqn', name: 'XQN' }, null]);
  const player = await service.player('EU', 'XQN');
  assert.deepEqual(player?.regions, ['EU', 'US'], 'a failing neighbour region is left out, not an error');
  assert.deepEqual(player?.streamer, { slug: 'xqn', name: 'XQN' });
});

test('the summary line, the rating histogram and the player profile model', () => {
  assert.deepEqual([1, 3, 11, 22, 25, 111, 6543].map(playersLabel),
    ['1 игрок', '3 игрока', '11 игроков', '22 игрока', '25 игроков', '111 игроков', '6\u00a0543 игрока']);
  const stats = parseLeaderboardStats(upstreamStats());
  const line = summaryLine(stats);
  assert.equal(line.delta, '+143 за день');
  assert.deepEqual(line.thresholds.map(item => [item.label, item.rating]),
    [['топ-100', '13\u00a0010'], ['топ-1\u00a0000', '10\u00a0120'], ['топ-5\u00a0000', '8\u00a0320']]);
  const cut = summaryLine({ ...stats, snapshot: { ...stats.snapshot, stored: 2000, truncated: true } });
  assert.deepEqual(cut.thresholds.map(item => item.rank), [100, 1000], 'no jump past the stored places');
  const bars = histogramBars(stats);
  assert.deepEqual(bars.map(bar => bar.height), [1, 1300 / 1800]);
  assert.match(bars[1].label, /^8\u00a0500–9\u00a0000: 1\u00a0300 игроков$/);
  assert.deepEqual(histogramTicks(bars), ['8к', '8,5к', '9к']);
  assert.deepEqual(histogramBars({ ...stats, board: { ...stats.board, rated: false } }), [], 'unrated modes have no histogram');

  const player = parseLeaderboardPlayer(upstreamPlayer());
  const earlier = { ...player.seasons[0], season: 18, final: true, latest: false, bestRank: 3, lastRank: 4, lastRating: 18800,
    series: [{ day: '2026-10-24', rank: 4, rating: 18800, players: 7100, final: true }] };
  const profile = { ...player, seasons: [earlier, player.seasons[0], { ...earlier, mode: 'standard' as const, rated: false, lastRating: null }] };
  assert.deepEqual(playerModes(profile), ['standard', 'battlegrounds'], 'modes in tab order');
  const seasons = modeSeasons(profile, 'battlegrounds');
  assert.deepEqual(seasons.map(season => season.season), [19, 18], 'newest season first');
  assert.equal(bestSeason(seasons)?.season, 19);
  assert.deepEqual(profileViews(seasons, seasons[0]), ['days', 'seasons']);
  assert.deepEqual(profileViews([earlier], earlier), [], 'one point is not a chart');
  assert.deepEqual(profilePoints('seasons', seasons, seasons[0]).map(point => [point.tick, point.value]), [['18', 18800], ['19', 20104]],
    'rated seasons plot the rating, oldest first');
  assert.equal(profileUsesRating('days', seasons, seasons[0]), true);
  const ranks = profilePoints('seasons', modeSeasons(profile, 'standard'), null);
  assert.equal(ranks[0].detail, 'итог: 4 место');
  const points = plotPoints([1, 10, 100], { width: 100, height: 50, pad: 5, rank: true });
  assert.deepEqual(points.map(point => Math.round(point.y)), [5, 25, 45], 'places on a log scale with the first place on top');
  assert.deepEqual(plotPoints([7], { width: 100, height: 50, pad: 5, rank: false }), [{ x: 50, y: 25 }]);

  const selection = parseLeaderboardSelection(new URLSearchParams('mode=battlegrounds'));
  assert.equal(myNickRank(player, selection, null), null, 'without the catalog the latest season is unknown');
  assert.equal(myNickRank(player, { ...selection, season: 19 }, null), 1);
});
