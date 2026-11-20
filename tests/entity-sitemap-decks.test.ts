import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEntitySitemapRouter } from '../server/entitySitemapRoutes.js';
import { createEntitySitemapRuntimeOptions } from '../server/entitySitemapSources.js';
import { projectDeckClassSitemapCatalog, selectIndexableDeckClassRows } from '../server/entitySitemapDeckSources.js';
import { CLASS_DECKS_MIN_ARCHETYPES, DECK_CLASS_KEYS } from '../shared/deckClassIndexing.js';
import { classArchetypes, classDecksIndexable, DECK_CLASSES } from '../apps/public-web/lib/classDecks';
import { publicArchetypeCatalog } from '../apps/public-web/lib/publicArchetypeCatalogTeaserData';
import { sitemapEntries } from '../scripts/production-monitor.mjs';
import { DATA_PAGES } from '../scripts/lib/post-deploy-data-pages.mjs';

// The `decks` segment (#650): the class pages of Standard decks that the page itself marks indexable, judged on the
// catalog the page reads, dated by the catalog's data day, with the last good segment when the catalog fails.
const ORIGIN = 'https://arena.hs-manacost.ru';
const row = (slug: string, classKey: string, overrides: Record<string, unknown> = {}) => ({
  slug, archetype: slug, archetypeLabel: slug, translated: true, classKey, format: 'standard', games: 5_000, winrate: 52,
  popularity: 2, turns: 8, durationMinutes: 8, climbingSpeed: 1, deckCount: 3, sourceUrl: '',
  builds: [{ deckCode: 'QA_PRIVATE_DECK_CODE' }], ...overrides,
});
const strong = (classKey: string, count: number) => Array.from({ length: count }, (_, index) => row(`${classKey}-${index + 1}`, classKey));
// Paladin: four strong archetypes and one below the sample (in). Druid: five, one without builds (in, four rows).
// Warlock: three (out, one short). Hunter: four rows, but nobody plays one (out). Other classes: none.
const ITEMS = [
  ...strong('paladin', 4), row('weak-paladin', 'paladin', { games: 999 }),
  ...strong('druid', 4), row('buildless-druid', 'druid', { deckCount: 0 }),
  ...strong('warlock', 3),
  ...strong('hunter', 3), row('dead-hunter', 'hunter', { popularity: 0 }),
];
const catalogOf = (items: unknown[], updatedAt = '2026-11-18T06:00:00+00:00') => ({
  format: 'standard', formatLabel: 'Стандарт', patch: '37.0.2', minimumGames: 10, period: 'patch_37.0.2', updatedAt, coverage: {}, items,
});
const locations = (xml: string) => sitemapEntries(xml, 'urlset', 'decks').map(({ location, lastmod }) => [new URL(location).pathname, lastmod]);

test('the class keys of the segment are the classes the page serves and the route inventory allows', () => {
  const inventory = JSON.parse(readFileSync('src/shared/seo/publicRouteInventory.json', 'utf8')) as {
    routes: { id: string; pathParameters?: Record<string, { allowedValues?: string[] }> }[];
  };
  const route = inventory.routes.find(entry => entry.id === 'standard-decks-class');
  assert.deepEqual(DECK_CLASSES.map(entry => entry.key), [...DECK_CLASS_KEYS]);
  assert.deepEqual(route?.pathParameters?.classKey?.allowedValues, [...DECK_CLASS_KEYS]);
  assert.equal(CLASS_DECKS_MIN_ARCHETYPES, 4);
  // The deploy warm-up primes the hub and every class page (dynamic pages: no ISR copy to revalidate).
  const warmed = DATA_PAGES.filter(page => page.path.startsWith('/standard/decks/'));
  assert.deepEqual(warmed.map(page => page.path), ['/standard/decks/', ...DECK_CLASS_KEYS.map(key => `/standard/decks/${key}/`)]);
  assert.ok(warmed.every(page => !('isr' in page)));
});

test('a class enters the segment exactly when its page is indexable', () => {
  const rows = selectIndexableDeckClassRows(catalogOf(ITEMS));
  assert.deepEqual(rows.map(entry => [entry.classKey, entry.archetypes.length]), [['druid', 4], ['paladin', 4]]);
  // The page's own decision on the same answer, through the page's projection of the teaser.
  const page = publicArchetypeCatalog(catalogOf(ITEMS), 'standard');
  assert.ok(page);
  assert.deepEqual(DECK_CLASS_KEYS.filter(key => classDecksIndexable(classArchetypes(page, key))), ['druid', 'paladin']);
  assert.deepEqual(projectDeckClassSitemapCatalog(rows, ORIGIN).map(entry => [entry.location, entry.dataDate]), [
    [`${ORIGIN}/standard/decks/druid/`, '2026-11-18'], [`${ORIGIN}/standard/decks/paladin/`, '2026-11-18'],
  ]);
  // A wiring mistake (a class below the threshold) rejects the whole candidate instead of listing a noindex page.
  assert.throws(() => projectDeckClassSitemapCatalog([{ ...rows[0], archetypes: rows[0].archetypes.slice(0, 3) }], ORIGIN),
    /not indexable/);
  assert.throws(() => selectIndexableDeckClassRows({ ...catalogOf(ITEMS), format: 'wild' }), /invalid/);
  assert.throws(() => selectIndexableDeckClassRows(undefined), /invalid/);
});

test('decks.xml: listed classes by data day, in the index, the last good state when the catalog fails', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-sitemap-decks-'));
  let items: unknown[] = ITEMS;
  let updatedAt = '2026-11-18T06:00:00+00:00';
  let failure: Error | null = null;
  // The first request is on the day of the data, so the hub's own day is that day too.
  let now = Date.parse('2026-11-18T09:00:00.000Z');
  const runtime = createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), {}, undefined, {
    loadCatalogs: async format => {
      if (failure) throw failure;
      // The page reads the first window; a later window never decides a class.
      return [{ ...catalogOf(items, updatedAt), format }, { ...catalogOf(strong('warlock', 6)), format }];
    },
  });
  assert.equal(runtime.minimumDeckClassCount, 1);
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: ORIGIN, staticUrls: [`${ORIGIN}/`, `${ORIGIN}/standard/decks/`], stateDirectory: directory, now: () => now,
    cacheTtlMs: 300_000, retryAfterSeconds: 17, minimumStandardCardCount: 1,
    loadStandardCards: async () => [{ card_id: 'CARD_1', name: { ru: 'Карта', en: 'Card' }, card_set: 'CORE',
      card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', rarity: 'COMMON', mana_cost: 1 }],
    loadDecks: runtime.loadDecks, minimumDeckClassCount: runtime.minimumDeckClassCount,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const first = await fetch(`${origin}/sitemaps/decks.xml`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-sitemap-source'), 'catalog');
    const firstXml = await first.text();
    assert.deepEqual(locations(firstXml), [['/standard/decks/druid/', '2026-11-18'], ['/standard/decks/paladin/', '2026-11-18']]);
    assert.doesNotMatch(firstXml, /QA_PRIVATE|deckCode/);
    const index = await (await fetch(`${origin}/sitemap.xml`)).text();
    assert.deepEqual(sitemapEntries(index, 'sitemapindex', 'index').map(({ location }) => new URL(location).pathname).at(-1),
      '/sitemaps/decks.xml');

    // Warlock crosses the threshold, paladin falls under it: the next refresh follows the page.
    const changedItems = [...ITEMS.filter(item => item.slug !== 'paladin-1'), row('warlock-4', 'warlock')];
    items = changedItems;
    updatedAt = '2026-11-19T06:00:00+00:00';
    now = Date.parse('2026-11-19T09:00:00.000Z');
    const changedXml = await (await fetch(`${origin}/sitemaps/decks.xml`)).text();
    assert.deepEqual(locations(changedXml), [['/standard/decks/druid/', '2026-11-18'], ['/standard/decks/warlock/', '2026-11-19']],
      'an unchanged class keeps its day, a new one takes the day of its data');
    // The hub of static.xml is dated by the class pages it leads to, not only by its own text.
    const staticXml = await (await fetch(`${origin}/sitemaps/static.xml`)).text();
    assert.deepEqual(locations(staticXml).find(([path]) => path === '/standard/decks/'), ['/standard/decks/', '2026-11-19']);
    assert.deepEqual(locations(staticXml).find(([path]) => path === '/'), ['/', '2026-11-18']);

    for (const [label, arrange] of [
      ['an unreadable catalog', () => { failure = new Error('catalog down'); }],
      ['a catalog without a data date', () => { updatedAt = 'вчера'; }],
      ['no class above the threshold', () => { items = strong('mage', 3); }],
    ] as const) {
      failure = null;
      items = changedItems;
      updatedAt = '2026-11-19T06:00:00+00:00';
      arrange();
      now += 6 * 60_000;
      const lkg = await fetch(`${origin}/sitemaps/decks.xml`);
      assert.equal(lkg.status, 200, label);
      assert.equal(lkg.headers.get('x-sitemap-source'), 'last-known-good', label);
      assert.equal(await lkg.text(), changedXml, `${label}: the last good state, byte for byte`);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a cold start without a good catalog answers 503, never an empty segment', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-sitemap-decks-cold-'));
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: ORIGIN, staticUrls: [`${ORIGIN}/`], stateDirectory: directory, retryAfterSeconds: 17,
    loadStandardCards: async () => [], loadDecks: async () => selectIndexableDeckClassRows(catalogOf(strong('mage', 3))),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/sitemaps/decks.xml`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '17');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
