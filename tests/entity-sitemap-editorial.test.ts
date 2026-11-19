import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCosmeticsSitemapRows,
  loadGuideArchiveSitemapRows,
  projectCosmeticsSitemapCatalog,
  projectGuideArchiveSitemapCatalog,
} from '../server/entitySitemapEditorial.js';
import { createGuidesArchiveRouter } from '../server/guidesArchiveRoutes.js';
import { createGuideExcerptDatabase, words } from './helpers/guideExcerptFixture.js';
import { SemanticSitemapStore } from '../server/entitySitemapStore.js';
import { createEntitySitemapRouter } from '../server/entitySitemapRoutes.js';

const ORIGIN = 'https://hearthpulse.net';
const hero = (cardId: string, extra: Record<string, unknown> = {}) => ({
  cardId, name: { ru: 'Скин', en: 'Skin' }, images: { static: `https://api.kolodahearthstone.com/${cardId}.png` },
  releaseDate: '2026-10-13', sourceAddedAt: '2026-10-17 10:30:25', updatedAt: '2026-10-27 10:28:41', ...extra,
});

// Pagination walks every catalog page; a pet family contributes each variant.
const requested: string[] = [];
const rows = await loadCosmeticsSitemapRows(async (kind, query) => {
  requested.push(`${kind}:${query.page}:${query.perPage}`);
  if (kind === 'heroes') return { items: [hero(`HERO_${query.page}`)], pagination: { totalPages: 2 } };
  if (kind === 'coins') return { items: [hero('COIN_1')], pagination: { totalPages: 1 } };
  return { items: [{ petId: 16, cardId: 'PET_16_1', variants: [hero('PET_16_1'), hero('PET_16_2')] }] };
});
assert.deepEqual(requested, ['heroes:1:100', 'heroes:2:100', 'coins:1:100', 'pets:1:100']);
const cosmetics = projectCosmeticsSitemapCatalog(rows, ORIGIN);
assert.deepEqual(cosmetics.map(entry => entry.location), [
  `${ORIGIN}/cosmetics/coins/COIN_1/`,
  `${ORIGIN}/cosmetics/heroes/HERO_1/`,
  `${ORIGIN}/cosmetics/heroes/HERO_2/`,
  `${ORIGIN}/cosmetics/pets/PET_16_1/`,
  `${ORIGIN}/cosmetics/pets/PET_16_2/`,
]);
await assert.rejects(loadCosmeticsSitemapRows(async () => ({ items: [] })), /empty/,
  'an empty upstream catalog fails closed so the last-known-good sitemap stays');

const heroHash = (item: Record<string, unknown>) => projectCosmeticsSitemapCatalog([{ kind: 'heroes', item }], ORIGIN)[0].semanticHash;
assert.equal(heroHash(hero('HERO_1')), heroHash(hero('HERO_1', { updatedAt: '2026-10-28 10:00:00', sourceAddedAt: 'x' })),
  'the daily upstream re-sync stamp must not move lastmod');
assert.notEqual(heroHash(hero('HERO_1')), heroHash(hero('HERO_1', { name: { ru: 'Новое имя' } })),
  'a visible change still moves lastmod');
assert.throws(() => projectCosmeticsSitemapCatalog([{ kind: 'cards', item: hero('HERO_1') }], ORIGIN), /invalid/);
assert.throws(() => projectCosmeticsSitemapCatalog([{ kind: 'heroes', item: hero('../x') }], ORIGIN), /invalid/);

// A fake guides table: the listing query carries a text signature, the per-slug query the texts.
const longText = { free_html: `<p>${words(170, 'слово')}</p>`, body_html: '', short_html: '' };
let textReads = 0;
const fakeGuides = (texts: Record<string, typeof longText>) => ({
  prepare: (sql: string) => ({
    all: (...params: unknown[]) => {
      if (/text_signature/.test(sql)) {
        return Object.entries(texts).map(([slug, text]) => ({
          slug, title: 'Гайд', text_signature: `${text.free_html.length}:0:0`,
        }));
      }
      textReads += 1;
      return [texts[String(params[0])]];
    },
  }),
});
const texts = { 'guide-230': longText, 'guide-216': longText, 'guide-short': { ...longText, free_html: `<p>${words(95, 'мало')}</p>` } };
const first = loadGuideArchiveSitemapRows(fakeGuides(texts));
assert.deepEqual(first, [{ slug: 'guide-230', title: 'Гайд' }, { slug: 'guide-216', title: 'Гайд' }],
  'the short guide is out, and the signature never reaches the rows');
assert.equal(textReads, 3, 'a first build reads each text once');
assert.deepEqual(loadGuideArchiveSitemapRows(fakeGuides(texts)), first);
assert.equal(textReads, 3, 'a repeat build reads no text');
// A changed text (another signature) is judged again.
const edited = loadGuideArchiveSitemapRows(fakeGuides({ ...texts, 'guide-short': { ...longText, free_html: `<p>${words(180, 'много')}</p>` } }));
assert.equal(textReads, 4);
assert.equal(edited.length, 3);
const guides = projectGuideArchiveSitemapCatalog(first, ORIGIN);
assert.deepEqual(guides.map(entry => entry.location), [`${ORIGIN}/guides-archive/guide-216/`, `${ORIGIN}/guides-archive/guide-230/`]);

// One predicate for page and sitemap: a guide is outside the sitemap exactly when its page is noindex.
{
  const database = createGuideExcerptDatabase();
  const app = express();
  app.use('/api', createGuidesArchiveRouter({
    getDatabase: () => database, accessGuard: (_request, _response, next) => next(),
    publicUrl: 'https://legacy.example.test', logError: () => {},
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const listed = new Set(projectGuideArchiveSitemapCatalog(loadGuideArchiveSitemapRows(database), ORIGIN).map(entry => entry.key));
    assert.equal(listed.has('short-guide'), false);
    assert.equal(listed.has('sentinel-guide'), true);
    for (const { slug } of database.prepare('SELECT slug FROM guides').all() as Array<{ slug: string }>) {
      const projection = await (await fetch(`http://127.0.0.1:${port}/api/guides-archive/teaser/${slug}`)).json() as { indexable: boolean };
      assert.equal(listed.has(slug), projection.indexable, `${slug}: sitemap and page robots agree`);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    database.close();
  }
}
assert.throws(() => projectGuideArchiveSitemapCatalog([{ slug: 'a/b' }], ORIGIN), /invalid/);

// A guide is dated by the day it was published, from the column the guide page prints.
{
  const publishedDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-guide-dates-'));
  try {
    const store = new SemanticSitemapStore({
      directory: publishedDirectory, segment: 'guides-archive', canonicalOrigin: ORIGIN,
      now: () => Date.parse('2026-11-16T08:00:00Z'), minimumEntryCount: 1,
    });
    const document = store.publish(projectGuideArchiveSitemapCatalog([
      { slug: 'iso', published_iso: '2019-03-04T21:30:00+03:00', published_at: 1 },
      { slug: 'unix-only', published_iso: null, published_at: 1_551_657_600 },
      { slug: 'no-date', published_iso: null, published_at: null },
      { slug: 'garbage', published_iso: 'not a date', published_at: 'x' },
    ], ORIGIN));
    assert.deepEqual(document.entries.map(entry => [entry.key, entry.lastmod]), [
      ['garbage', '2026-11-16'],
      ['iso', '2019-03-04'],
      ['no-date', '2026-11-16'],
      ['unix-only', '2019-03-04'],
    ]);
  } finally {
    rmSync(publishedDirectory, { recursive: true, force: true });
  }
}

// The index is served only when every sitemap can be dated, so the standard cards need a source too.
const standardCard = {
  card_id: 'CARD_1', name: { ru: 'Карта', en: 'Card' }, text: { ru: 'Получает +1/+1.' }, card_set: 'CORE',
  card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', rarity: 'COMMON', mana_cost: 1, attack: 1, health: 1,
  images: { card: 'https://cdn.example.test/CARD_1.png' },
};

// The store accepts the editorial keys and locations and keeps lastmod stable.
const directory = mkdtempSync(join(tmpdir(), 'arena-sitemap-editorial-'));
try {
  for (const [segment, entries] of [['cosmetics', cosmetics], ['guides-archive', guides]] as const) {
    const store = new SemanticSitemapStore({ directory, segment, canonicalOrigin: ORIGIN, now: () => Date.parse('2026-10-27T00:00:00Z') });
    assert.equal(store.publish(entries).entryCount, entries.length);
    assert.deepEqual(store.readLastKnownGood()?.entries.map(entry => entry.key), entries.map(entry => entry.key));
  }

  // The router lists and serves both segments when the runtime provides them.
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: ORIGIN, stateDirectory: directory, staticUrls: [`${ORIGIN}/`],
    loadStandardCards: async () => [standardCard], minimumStandardCardCount: 1, loadCosmetics: async () => rows, loadGuidesArchive: async () => [{ slug: 'guide-216' }],
    minimumCosmeticsCount: 1, minimumGuideCount: 1,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const index = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.deepEqual([...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]),
      ['static', 'standard-cards', 'cosmetics', 'guides-archive'].map(name => `${ORIGIN}/sitemaps/${name}.xml`));
    const guidesXml = await fetch(`${base}/sitemaps/guides-archive.xml`);
    assert.equal(guidesXml.status, 200);
    assert.match(await guidesXml.text(), /<loc>https:\/\/hearthpulse\.net\/guides-archive\/guide-216\/<\/loc>/);
    assert.match(await (await fetch(`${base}/sitemaps/cosmetics.xml`)).text(), /\/cosmetics\/pets\/PET_16_2\//);
  } finally {
    server.close();
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('entity sitemap editorial segment tests passed');
