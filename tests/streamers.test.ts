import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { currentPlace, lastSeasonPlace, ladderName, parseLadderPlayer } from '../server/modules/streamers/ladder.js';
import { parseDeck, parseLiveStream, parseProfile, parseSummary, safeUrl } from '../server/modules/streamers/parsing.js';
import { createStreamersRouter } from '../server/modules/streamers/routes.js';
import { StreamerNotFoundError, createStreamersService } from '../server/modules/streamers/service.js';
import type { StreamerDeck, StreamerPage, StreamersFilters, StreamersPage } from '../server/modules/streamers/types.js';
import { streamerWeek } from '../server/modules/streamers/week.js';
import type { StreamerPage as ClientStreamerPage, StreamersPage as ClientStreamersPage } from '../src/modules/streamers/model/types.js';
import {
  cardBestRank, deckRecord, deckRankLabel, distinctRecentDecks, favoriteClasses, formatFollowers, formatLiveSince, isStreamerPage, isStreamersPage,
  ladderLabel, plural, streamerFacetOptions, streamerFilterQuery, streamerSearchQuery, streamModeLabel, visibleLiveStreams, vodTimecode,
} from '../src/modules/streamers/model/streamersView.js';

// Ответы hs-data-api 25.10.2026 (живой прогон сбора HSGuru), урезанные до нескольких строк.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/streamers-hsdata-20261025.json', import.meta.url), 'utf8')) as Record<string, { data: any; meta?: any }>;
const LABELS: Record<string, string> = { 'Thief Priest': 'Жрец-вор', 'Egg Priest': 'Яичный жрец' };
const namer = (name: string) => LABELS[name] ?? name;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
// Ответы /v1/leaderboards 25.10.2026: текущий сезон ещё не собран, у всех `current: []`.
const LADDER = JSON.parse(readFileSync(new URL('./fixtures/streamers-leaderboards-20261025.json', import.meta.url), 'utf8')) as Record<string, { data: any }>;
const ALL: StreamersFilters = { format: null, classKey: null, language: null, live: false, query: null, sort: 'active' };

test('a streamer of the catalog keeps links, live stream and decks with Russian names', () => {
  const raw = copy(FIXTURE.streamers.data[0]);
  const summary = parseSummary(raw, namer);
  assert.ok(summary);
  assert.equal(summary.slug, 'moquaitv');
  assert.deepEqual(summary.links, [{ kind: 'twitch', url: 'https://www.twitch.tv/moquaitv' }]);
  assert.equal(summary.live?.streamUrl, 'https://www.twitch.tv/moquaitv');
  assert.equal(summary.live?.thumbnailUrl, 'https://static-cdn.jtvnw.net/previews-ttv/live_user_moquaitv-384x216.jpg');
  const [deck] = summary.recentDecks;
  assert.deepEqual(
    { label: deck.archetypeLabel, archetype: deck.archetype, classKey: deck.classKey, format: deck.format, onStream: deck.onStream },
    { label: 'Жрец-вор', archetype: 'Thief Priest', classKey: 'priest', format: 'standard', onStream: true },
  );
  assert.equal(deck.peakRank, 6623);
  assert.equal(deck.latestRank, null, 'a rank missing on HSGuru stays empty');
  assert.equal(summary.bestRank, 609, 'the best rank of the 30-day window');
  assert.equal(summary.ladder, null, 'the leaderboard place is filled by the service');
});

test('the streamer profile carries YouTube and X, facets and VOD links of past broadcasts', () => {
  const profile = parseProfile(copy(FIXTURE.streamer.data), namer);
  assert.ok(profile);
  assert.equal(profile.slug, 'nohandsgamer');
  assert.deepEqual(profile.links.map(link => link.kind).slice(0, 3), ['twitch', 'youtube', 'x']);
  assert.ok(profile.facets.some(facet => facet.format === 'standard' && facet.classKey === 'deathknight' && facet.decks === 11));
  const decks = FIXTURE.streamerDecks.data.map((row: unknown) => parseProfile({ ...FIXTURE.streamer.data, last_deck: row }, namer)?.recentDecks[0]);
  assert.equal(decks[0]?.vodUrl, 'https://www.twitch.tv/videos/2909721478?t=5h41m20s');
});

test('links from third-party pages are https on their own hosts only', () => {
  assert.equal(safeUrl('https://www.youtube.com/@reqvam', ['youtube.com']), 'https://www.youtube.com/@reqvam');
  assert.equal(safeUrl('http://www.youtube.com/@reqvam', ['youtube.com']), null);
  assert.equal(safeUrl('javascript:alert(1)', ['youtube.com']), null);
  assert.equal(safeUrl('https://youtube.com.evil.example/', ['youtube.com']), null);
  assert.equal(safeUrl('https://user:pass@www.twitch.tv/x', ['twitch.tv']), null);
  const raw = copy(FIXTURE.streamers.data[0]);
  raw.youtube_url = 'https://evil.example/watch';
  raw.recent_decks[0].deck_code = '"><script>';
  const summary = parseSummary(raw, namer);
  assert.ok(summary && !summary.links.some(link => link.kind === 'youtube'));
  assert.equal(summary.recentDecks.some(deck => deck.deckId === raw.recent_decks[0].deck_id), false, 'a deck with a broken code is dropped');
});

test('a live stream links the known streamer and the deck of this broadcast', () => {
  const streams = FIXTURE.streamingNow.data.map((row: unknown) => parseLiveStream(row, namer));
  assert.equal(streams.length, 4);
  assert.ok(streams.every(stream => stream && stream.slug), 'known=true: every stream has a streamer page');
  const unknown = parseLiveStream({ ...FIXTURE.streamingNow.data[0], streamer: null, current_deck: null }, namer);
  assert.equal(unknown?.slug, null);
  assert.equal(unknown?.deck, null);
});

type Call = string;
function upstream(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: Call[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url.replace('https://hs.test', ''));
    const path = new URL(url).pathname;
    if (path in overrides) {
      const value = overrides[path];
      if (value instanceof Error) throw value;
      return value;
    }
    if (path === '/v1/hsguru/streamers') return FIXTURE.streamers;
    if (path === '/v1/hsguru/streaming-now') return FIXTURE.streamingNow;
    if (path === '/v1/hsguru/streamers/nohandsgamer') return FIXTURE.streamer;
    if (path === '/v1/hsguru/streamers/nohandsgamer/decks') return FIXTURE.streamerDecks;
    const query = new URL(url).searchParams;
    if (path === '/v1/leaderboards/players') return LADDER[`players${query.get('q')}`] ?? { data: [] };
    if (path === '/v1/leaderboards/player' && LADDER[`player${query.get('region')}`]) return LADDER[`player${query.get('region')}`];
    throw new StreamerNotFoundError('missing');
  };
  return { calls, fetchJson };
}

test('the service reads the catalog with live streams once and caches each slice', async () => {
  const { calls, fetchJson } = upstream();
  let time = 0;
  const service = createStreamersService({ baseUrl: 'https://hs.test/', fetchJson, loadNamer: async () => namer, now: () => time });
  const wildMage = { ...ALL, format: 'wild' as const, classKey: 'mage' };
  const page = await service.loadList(wildMage);
  assert.equal(page.streamers.length, 3);
  assert.equal(page.live.length, 4);
  assert.equal(page.total, FIXTURE.streamers.meta.count);
  assert.deepEqual(calls.filter(call => call.startsWith('/v1/hsguru')), [
    '/v1/hsguru/streamers?days=30&limit=24&offset=0&decks=8&sort=active&format=wild&player_class=MAGE',
    '/v1/hsguru/streaming-now?limit=60',
  ]);
  assert.deepEqual(calls.filter(call => call.startsWith('/v1/leaderboards')).sort(), [
    '/v1/leaderboards/players?q=MoquaiTV&limit=10', '/v1/leaderboards/players?q=Ramses&limit=10',
  ], 'only BattleTag-like names are looked up on the leaderboards');
  const read = calls.length;
  await service.loadList(wildMage);
  assert.equal(calls.length, read, 'a fresh slice is served from the cache');
  const next = await service.loadList(ALL, 24);
  assert.deepEqual(next.live, [], 'the next portion does not read live streams again');
  time = 61_000;
  assert.equal(await service.loadList(wildMage), page, 'an expired slice is served at once');
  assert.equal(calls.filter(call => call.includes('format=wild')).length, 2, 'while one background read refreshes it');
  await service.loadList({ ...ALL, language: 'ru', live: true, query: 'Jostik', sort: 'rank' });
  assert.ok(calls.includes('/v1/hsguru/streamers?days=30&limit=24&offset=0&decks=8&sort=rank&language=ru&live=true&q=Jostik'));
  const streamer = await service.loadStreamer('nohandsgamer', { format: null, classKey: null });
  assert.equal(streamer.decks.length, FIXTURE.streamerDecks.data.length);
  assert.equal(streamer.streamer.name, 'NoHandsGamer');
  assert.ok(calls.includes('/v1/hsguru/streamers/nohandsgamer/decks?days=7&limit=200'), 'the week is read with the first portion');
  assert.equal(streamer.week?.decks, FIXTURE.streamerDecks.data.length);
  assert.deepEqual(streamer.streamer.ladder, { rank: 66, region: 'AP', mode: 'standard', current: false, seasonStart: '2026-09-01' },
    'without a current board the page shows the best final place of the last stored season');
  assert.equal((await service.loadStreamer('nohandsgamer', { format: null, classKey: null }, 30)).week, null, 'the next portion has no week');
  await assert.rejects(service.loadStreamer('nobody', { format: null, classKey: null }), StreamerNotFoundError);
});

async function serve(router: express.Router) {
  const app = express();
  app.use('/api', router);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}/api`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('the router validates filters and maps upstream outcomes to statuses', async () => {
  const { fetchJson } = upstream({ '/v1/hsguru/streamers/broken': new Error('boom'), '/v1/hsguru/streamers/broken/decks': new Error('boom') });
  const service = createStreamersService({ baseUrl: 'https://hs.test', fetchJson, loadNamer: async () => namer });
  const { base, close } = await serve(createStreamersRouter(service));
  try {
    const list = await fetch(`${base}/streamers?format=standard`);
    assert.equal(list.status, 200);
    assert.match(list.headers.get('cache-control') ?? '', /max-age=60/);
    const body = await list.json() as StreamersPage;
    assert.ok(isStreamersPage(body));
    assert.equal((await fetch(`${base}/streamers?format=battlegrounds`)).status, 400);
    assert.equal((await fetch(`${base}/streamers?offset=-1`)).status, 400);
    assert.equal((await fetch(`${base}/streamers?lang=ru&live=1&sort=rank&q=${encodeURIComponent('Jostik HS')}`)).status, 200);
    for (const bad of ['lang=en', 'live=yes', 'sort=followers', `q=${encodeURIComponent('<script>')}`, `q=${'a'.repeat(41)}`]) {
      assert.equal((await fetch(`${base}/streamers?${bad}`)).status, 400, bad);
    }
    const one = await fetch(`${base}/streamers/NoHandsGamer?class=priest`);
    assert.equal(one.status, 200);
    assert.ok(isStreamerPage(await one.json()));
    assert.equal((await fetch(`${base}/streamers/nobody`)).status, 404);
    assert.equal((await fetch(`${base}/streamers/${encodeURIComponent('../etc')}`)).status, 404);
    const failed = await fetch(`${base}/streamers/broken`);
    assert.equal(failed.status, 502);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
  } finally {
    await close();
  }
});

test('page types mirror the server contract', async () => {
  const { fetchJson } = upstream();
  const service = createStreamersService({ baseUrl: 'https://hs.test', fetchJson });
  // Присваивание в обе стороны ломает `npm run lint` при расхождении типов.
  const list: ClientStreamersPage = await service.loadList(ALL);
  const back: StreamersPage = list;
  const page: ClientStreamerPage = await service.loadStreamer('nohandsgamer', { format: null, classKey: null });
  const pageBack: StreamerPage = page;
  assert.equal(back.streamers[0].recentDecks[0].archetypeLabel, 'Thief Priest', 'without translations the HSGuru name stays');
  assert.ok(pageBack.streamer.facets.length > 0);
});

test('the page model formats counts, ranks and facets in Russian', () => {
  assert.equal(plural(1, 'стример', 'стримера', 'стримеров'), 'стример');
  assert.equal(plural(3, 'стример', 'стримера', 'стримеров'), 'стримера');
  assert.equal(plural(11, 'стример', 'стримера', 'стримеров'), 'стримеров');
  assert.equal(plural(21, 'стример', 'стримера', 'стримеров'), 'стример');
  assert.equal(formatFollowers(74_988)?.replace(/\s/g, ' '), '75 тыс. фолловеров');
  assert.equal(deckRankLabel({ peakRank: 1234 })?.replace(/\s/g, ' '), '#1 234');
  assert.equal(deckRankLabel({ peakRank: null }), null);
  assert.deepEqual(deckRecord({ wins: 11, losses: 8 }), { text: '11–8', winrate: 58 });
  assert.equal(deckRecord({ wins: null, losses: null }), null);
  assert.equal(streamModeLabel('battlegrounds'), 'Поля сражений');
  assert.equal(streamModeLabel('unknown'), null);
  assert.equal(formatLiveSince('2026-10-25T15:54:23Z'), 'с 18:54 мск');
  assert.equal(streamerFilterQuery({ format: 'wild', classKey: 'mage' }, 30), '?format=wild&class=mage&offset=30');
  assert.equal(streamerFilterQuery({ format: null, classKey: null }), '');
  const facets = [
    { format: 'standard' as const, classKey: 'priest', decks: 5 }, { format: 'wild' as const, classKey: 'mage', decks: 2 },
    { format: 'standard' as const, classKey: 'mage', decks: 1 },
  ];
  const all = streamerFacetOptions(facets, { format: null, classKey: null });
  assert.deepEqual(all.formats.map(option => [option.value, option.decks]), [['standard', 6], ['wild', 2]]);
  assert.deepEqual(all.classes.map(option => [option.label, option.decks]), [['Жрец', 5], ['Маг', 3]]);
  const wild = streamerFacetOptions(facets, { format: 'wild', classKey: null });
  assert.deepEqual(wild.classes.map(option => option.value), ['mage'], 'classes follow the chosen format');
  const decks = [{ format: 'standard', archetype: 'Egg Priest' }, { format: 'standard', archetype: 'Egg Priest' }, { format: 'wild', archetype: 'Egg Priest' },
    { format: 'standard', archetype: 'Zoolock' }, { format: 'standard', archetype: 'Raza DH' }] as Parameters<typeof distinctRecentDecks>[0];
  assert.deepEqual(distinctRecentDecks(decks).map(deck => `${deck.format}:${deck.archetype}`), ['standard:Egg Priest', 'wild:Egg Priest', 'standard:Zoolock']);
  const streams = [{ language: 'ru' }, { language: null }] as Parameters<typeof visibleLiveStreams>[0];
  assert.equal(visibleLiveStreams(streams, true).length, 1);
  assert.equal(visibleLiveStreams(streams, false).length, 2);
});

test('leaderboard places match the exact name: current board first, else the last stored season', () => {
  assert.equal(ladderName('NoHandsGamer'), 'NoHandsGamer');
  assert.equal(ladderName('TheoHS_'), null, 'BattleTags have no underscores');
  assert.equal(ladderName('ab'), null);
  const nohands = parseLadderPlayer(LADDER.playersNoHandsGamer, 'nohandsgamer');
  assert.deepEqual(nohands.regions.sort(), ['AP', 'EU', 'US']);
  assert.equal(currentPlace(nohands, 'standard'), null, 'the current season is not collected yet');
  assert.deepEqual(parseLadderPlayer(LADDER.playersNoHandsGamer, 'NoHands'), { regions: [], current: [] }, 'a prefix is not a match');
  // Форма строки `current` — из примера OpenAPI /v1/leaderboards/players.
  const live = copy(LADDER.playersRamses);
  live.data[0].current = [{ mode: 'standard', season_id: 156, rank: 457, rating: null }, { mode: 'wild', season_id: 156, rank: 12, rating: null }];
  live.data[1].current = [{ mode: 'standard', season_id: 156, rank: 900, rating: null }];
  assert.deepEqual(currentPlace(parseLadderPlayer(live, 'Ramses'), 'standard'), { rank: 457, region: 'EU', mode: 'standard', current: true, seasonStart: null });
  assert.equal(currentPlace(parseLadderPlayer(live, 'Ramses'), 'wild')?.rank, 12);
  assert.deepEqual(lastSeasonPlace(LADDER.playerUS, 'standard', 'US'), { rank: 105, region: 'US', mode: 'standard', current: false, seasonStart: '2026-09-01', seasonId: 155 });
  assert.equal(lastSeasonPlace(LADDER.playerUS, 'wild', 'US'), null);
});

test('the week groups decks by archetype, most played first', () => {
  const decks = FIXTURE.streamerDecks.data.map((row: unknown) => parseDeck(row, namer)).filter(Boolean) as StreamerDeck[];
  const week = streamerWeek(decks);
  assert.equal(week.decks, 6);
  assert.deepEqual({ wins: week.wins, losses: week.losses }, { wins: 76, losses: 45 });
  assert.deepEqual(week.archetypes.map(item => [item.archetype, item.decks, item.wins, item.losses]), [
    ['Egg Priest', 3, 36, 23], ["C'Thun Warlock", 1, 16, 14], ["C'Thun Priest", 1, 16, 5], ["C'Thun Shaman", 1, 8, 3],
  ]);
  assert.equal(week.archetypes[0].archetypeLabel, 'Яичный жрец');
  assert.deepEqual(streamerWeek([]), { decks: 0, wins: 0, losses: 0, archetypes: [] });
});

test('the card model: favourite classes, best rank once, leaderboard label, VOD time and search text', () => {
  const decks = ['priest', 'mage', 'priest', null, 'warrior', 'mage', 'rogue'].map(classKey => ({ classKey }));
  assert.deepEqual(favoriteClasses(decks), ['priest', 'mage', 'warrior']);
  assert.deepEqual(favoriteClasses([]), []);
  assert.equal(cardBestRank(12, [{ peakRank: 40 }]), '#12');
  assert.equal(cardBestRank(12, [{ peakRank: 12 }]), null, 'the same number is not shown twice');
  assert.equal(cardBestRank(null, []), null);
  assert.deepEqual(ladderLabel({ rank: 457, region: 'EU', mode: 'standard', current: true, seasonStart: null }),
    { text: '#457 · EU', title: 'Место сейчас в таблице лидеров Blizzard, Стандарт, EU' });
  assert.equal(ladderLabel({ rank: 1105, region: 'US', mode: 'wild', current: false, seasonStart: '2026-09-01' })?.text.replace(/\s/g, ' '), '#1 105 · US · сентябрь');
  assert.equal(ladderLabel(null), null);
  assert.equal(vodTimecode('https://www.twitch.tv/videos/2909721478?t=5h41m20s'), '5:41:20');
  assert.equal(vodTimecode('https://www.twitch.tv/videos/1?t=7m5s'), '7:05');
  assert.equal(vodTimecode('https://www.twitch.tv/videos/1'), null);
  assert.equal(streamerSearchQuery('  Jostik_HS <b> '), 'Jostik_HS b');
  assert.equal(streamerSearchQuery('<>'), null);
  assert.equal(streamerFilterQuery({ ...ALL, language: 'ru', live: true, query: 'reqvam', sort: 'rank' }), '?lang=ru&live=1&q=reqvam&sort=rank');
  assert.equal(streamerFilterQuery(ALL), '');
});
