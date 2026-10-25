import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { parseLiveStream, parseProfile, parseSummary, safeUrl } from '../server/modules/streamers/parsing.js';
import { createStreamersRouter } from '../server/modules/streamers/routes.js';
import { StreamerNotFoundError, createStreamersService } from '../server/modules/streamers/service.js';
import type { StreamerPage, StreamersPage } from '../server/modules/streamers/types.js';
import type { StreamerPage as ClientStreamerPage, StreamersPage as ClientStreamersPage } from '../src/modules/streamers/model/types.js';
import {
  deckRecord, deckRankLabel, distinctRecentDecks, formatFollowers, formatLiveSince, isStreamerPage, isStreamersPage, plural,
  streamerFacetOptions, streamerFilterQuery, streamModeLabel, visibleLiveStreams,
} from '../src/modules/streamers/model/streamersView.js';

// Ответы hs-data-api 25.10.2026 (живой прогон сбора HSGuru), урезанные до нескольких строк.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/streamers-hsdata-20261025.json', import.meta.url), 'utf8')) as Record<string, { data: any; meta?: any }>;
const LABELS: Record<string, string> = { 'Thief Priest': 'Жрец-вор', 'Egg Priest': 'Яичный жрец' };
const namer = (name: string) => LABELS[name] ?? name;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
    throw new StreamerNotFoundError('missing');
  };
  return { calls, fetchJson };
}

test('the service reads the catalog with live streams once and caches each slice', async () => {
  const { calls, fetchJson } = upstream();
  let time = 0;
  const service = createStreamersService({ baseUrl: 'https://hs.test/', fetchJson, loadNamer: async () => namer, now: () => time });
  const page = await service.loadList({ format: 'wild', classKey: 'mage' });
  assert.equal(page.streamers.length, 3);
  assert.equal(page.live.length, 4);
  assert.equal(page.total, FIXTURE.streamers.meta.count);
  assert.deepEqual(calls, [
    '/v1/hsguru/streamers?days=30&limit=24&offset=0&decks=8&format=wild&player_class=MAGE',
    '/v1/hsguru/streaming-now?limit=60',
  ]);
  await service.loadList({ format: 'wild', classKey: 'mage' });
  assert.equal(calls.length, 2, 'a fresh slice is served from the cache');
  const next = await service.loadList({ format: null, classKey: null }, 24);
  assert.deepEqual(next.live, [], 'the next portion does not read live streams again');
  time = 61_000;
  assert.equal(await service.loadList({ format: 'wild', classKey: 'mage' }), page, 'an expired slice is served at once');
  assert.equal(calls.filter(call => call.includes('format=wild')).length, 2, 'while one background read refreshes it');
  const streamer = await service.loadStreamer('nohandsgamer', { format: null, classKey: null });
  assert.equal(streamer.decks.length, FIXTURE.streamerDecks.data.length);
  assert.equal(streamer.streamer.name, 'NoHandsGamer');
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
  const list: ClientStreamersPage = await service.loadList({ format: null, classKey: null });
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
