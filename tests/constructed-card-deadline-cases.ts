import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import express, { type RequestHandler } from 'express';
import { createConstructedCardDataService, createConstructedCardRouter } from '../server/constructedCardRoutes.js';
import { createEntitySitemapRouter } from '../server/entitySitemapRoutes.js';
import { createEntitySitemapLoaders } from '../server/entitySitemapSources.js';

// Incident 2026-11-15: a source read that never settles stayed in the shared
// load map forever, so the catalog, card pages and card sitemaps hung with it.

const card = (id: string, dbf: number) => ({
  card_id: id, dbf, name: { ru: `Карта ${id}`, en: id }, card_set: 'CORE',
  card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', multi_class: [], rarity: 'COMMON',
  mana_cost: 2, attack: 3, health: 4, mechanics: [], referenced_tags: [],
  images: { card: `https://cdn.example.test/${id}.png` },
});
const RESPONSE_MS = 150;
const LOAD_MS = 500;
const directories: string[] = [];
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'arena-card-deadline-'));
  directories.push(directory);
  const state = { hang: false, hangDetail: false, now: Date.parse('2026-11-15T12:00:00.000Z'), cards: [card('CARD_1', 1), card('CARD_2', 2)] };
  const deadlines: string[] = [];
  const service = createConstructedCardDataService({
    stateDirectory: directory,
    now: () => state.now,
    cacheTtlMs: 1_000,
    detailCacheTtlMs: 1_000,
    maxCatalogStaleMs: 48 * 60 * 60_000,
    minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
    responseDeadlineMs: RESPONSE_MS,
    loadDeadlineMs: LOAD_MS,
    onDeadline: operation => { deadlines.push(operation); },
    onCatalogError: () => {},
    fetchJson: url => {
      if (state.hang) return new Promise(() => {}); // never settles, never rejects
      const parsed = new URL(url);
      if (parsed.hostname === 'stats.example.test') {
        return Promise.resolve({
          fetched_at: new Date(state.now).toISOString(), url: 'https://hsreplay.net/cards/',
          view: { cards: [{ id: 'CARD_1', dbfId: 1, deck_popularity: '12.5%', deck_winrate: '53%', times_played: 200 }] },
        });
      }
      if (parsed.pathname.endsWith('/constructed-cards')) {
        return Promise.resolve({
          data: parsed.searchParams.get('format') === 'wild' ? [...state.cards, card('CARD_W', 99)] : state.cards,
          updated_at: new Date(state.now).toISOString(),
          pagination: { page: 1, total: parsed.searchParams.get('format') === 'wild' ? state.cards.length + 1 : state.cards.length, total_pages: 1 },
        });
      }
      if (state.hangDetail) return new Promise(() => {});
      const cardId = decodeURIComponent(parsed.pathname.split('/').pop() || '');
      return Promise.resolve({ data: { ...state.cards.find(item => item.card_id === cardId), wiki: { patch_changes: [] } } });
    },
    catalogBaseUrl: 'https://db.example.test/api/v1',
    statsDatasetByFormat: { standard: 'standard-cards', wild: 'wild-cards' },
    statsBaseUrl: 'https://stats.example.test',
  });
  return { directory, state, deadlines, service };
}

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

async function timed(url: string) {
  const started = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  return { response, body, elapsed: Date.now() - started };
}

function app(h: ReturnType<typeof harness>) {
  const server = express();
  const adminGuard: RequestHandler = (_request, _response, next) => next();
  server.use('/api', createConstructedCardRouter({
    ...h.service, adminGuard, canAccessStats: () => false,
    setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
  }));
  const loaders = createEntitySitemapLoaders(format => h.service.loadCards(format));
  server.use(createEntitySitemapRouter({
    canonicalOrigin: 'https://arena.hs-manacost.ru',
    staticUrls: Array.from({ length: 29 }, (_, index) => index === 0
      ? 'https://arena.hs-manacost.ru/' : `https://arena.hs-manacost.ru/static-${index}/`),
    ...loaders,
    stateDirectory: h.directory, now: () => h.state.now, cacheTtlMs: 300_000,
    minimumStandardCardCount: 1, minimumWildCardCount: 1,
    responseDeadlineMs: RESPONSE_MS, loadDeadlineMs: LOAD_MS, retryAfterSeconds: 17,
  }));
  return server;
}

test('a source that never answers: list, card and sitemaps are served from the last good version, then recover', async () => {
  const h = harness();
  const router = await listen(app(h));
  try {
    const list = `${router.origin}/api/constructed-cards?format=standard&perPage=20`;
    const detail = `${router.origin}/api/constructed-cards/CARD_1?format=standard`;
    const sitemap = `${router.origin}/sitemaps/standard-cards.xml`;
    const wildSitemap = `${router.origin}/sitemaps/wild-cards.xml`;

    // Healthy start: everything is fetched once, so the last good versions exist.
    assert.equal((await timed(list)).response.headers.get('x-data-cache'), 'fresh');
    assert.equal((await timed(detail)).response.status, 200);
    assert.equal((await timed(sitemap)).response.status, 200);
    assert.equal((await timed(wildSitemap)).response.status, 200);

    // Every cache expires and every source stops answering without an error.
    h.state.now += 400_000;
    h.state.hang = true;

    const hungList = await timed(list);
    assert.equal(hungList.response.status, 200, hungList.body);
    assert.equal(hungList.response.headers.get('x-data-cache'), 'LKG');
    assert.match(hungList.response.headers.get('warning') ?? '', /Stale/);
    assert.ok(hungList.elapsed < RESPONSE_MS + 2_500, `list took ${hungList.elapsed} ms`);
    assert.equal((JSON.parse(hungList.body) as { cards: unknown[] }).cards.length, 2);

    const hungDetail = await timed(detail);
    assert.equal(hungDetail.response.status, 200, hungDetail.body);
    assert.equal(hungDetail.response.headers.get('x-data-cache'), 'LKG');
    assert.ok(hungDetail.elapsed < RESPONSE_MS + 2_500, `detail took ${hungDetail.elapsed} ms`);

    for (const path of [sitemap, wildSitemap]) {
      const hungSitemap = await timed(path);
      assert.equal(hungSitemap.response.status, 200, path);
      assert.ok(hungSitemap.elapsed < RESPONSE_MS + 2_500, `${path} took ${hungSitemap.elapsed} ms`);
      assert.match(hungSitemap.body, path === sitemap ? /CARD_1/ : /CARD_W/);
    }

    // The same hang must not make the next request wait again.
    const missed = h.deadlines.filter(name => name.startsWith('constructed-cards-response:standard')).length;
    const again = await timed(list);
    assert.equal(again.response.status, 200);
    assert.equal(h.deadlines.filter(name => name.startsWith('constructed-cards-response:standard')).length, missed,
      'a repeated request must not wait for the hung load again');

    // The source is back; the hung loads are dropped after their deadline,
    // so the next load reads fresh data instead of joining a dead promise.
    h.state.hang = false;
    h.state.cards = [...h.state.cards, card('CARD_3', 3)];
    await new Promise(resolve => setTimeout(resolve, LOAD_MS * 2 + 100));
    for (const name of ['constructed-cards-response:standard:legend:1d', 'constructed-cards:catalog:standard']) {
      assert.ok(h.deadlines.includes(name), `no deadline line for ${name}: ${h.deadlines.join(', ')}`);
    }
    h.state.now += 400_000;
    const recovered = await timed(list);
    assert.equal(recovered.response.status, 200);
    assert.equal(recovered.response.headers.get('x-data-cache'), 'fresh', recovered.body);
    assert.equal((JSON.parse(recovered.body) as { cards: unknown[] }).cards.length, 3);
  } finally {
    await router.close();
  }
});

test('a source that never answers and no stored version: a quick 503 with Retry-After', async () => {
  const h = harness();
  h.state.hang = true;
  const router = await listen(app(h));
  try {
    const result = await timed(`${router.origin}/api/constructed-cards?format=standard`);
    assert.equal(result.response.status, 503);
    assert.equal(result.response.headers.get('retry-after'), '60');
    assert.ok(result.elapsed < RESPONSE_MS + 2_500, `took ${result.elapsed} ms`);
    const sitemap = await timed(`${router.origin}/sitemaps/standard-cards.xml`);
    assert.equal(sitemap.response.status, 503);
    assert.equal(sitemap.response.headers.get('retry-after'), '17');
  } finally {
    await router.close();
  }
});

test('only the card detail read hangs: repeats answer at once, and after the load deadline the next read is fresh', async () => {
  const h = harness();
  const router = await listen(app(h));
  try {
    const detail = `${router.origin}/api/constructed-cards/CARD_1?format=standard`;
    assert.equal((await timed(`${router.origin}/api/constructed-cards?format=standard`)).response.status, 200);
    h.state.hangDetail = true;
    const first = await timed(detail);
    assert.equal(first.response.status, 200, first.body);
    assert.equal((JSON.parse(first.body) as { partial: boolean }).partial, true);
    const missed = () => h.deadlines.filter(name => name.startsWith('constructed-cards:detail-response:')).length;
    const before = missed();
    for (let index = 0; index < 5; index += 1) assert.equal((await timed(detail)).response.status, 200);
    assert.equal(missed(), before, 'a repeated detail request must not wait for the hung load again');

    // The same load is dropped after the load deadline, not after twice that.
    h.state.hangDetail = false;
    await new Promise(resolve => setTimeout(resolve, LOAD_MS + 150));
    h.state.now += 400_000;
    const fresh = await timed(detail);
    assert.equal(fresh.response.status, 200, fresh.body);
    const body = JSON.parse(fresh.body) as { partial: boolean; warning: string | null };
    assert.equal(body.partial, false, fresh.body);
    assert.equal(fresh.response.headers.get('x-data-cache'), 'fresh');
  } finally {
    await router.close();
  }
});
