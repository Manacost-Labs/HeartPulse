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

const guides = projectGuideArchiveSitemapCatalog(loadGuideArchiveSitemapRows({ prepare: sql => ({
  all: () => {
    assert.doesNotMatch(sql, /body_html|body_text/, 'the sitemap does not read guide bodies');
    return [{ slug: 'guide-230', title: 'Гайд' }, { slug: 'guide-216', title: 'Гайд' }];
  },
}) }), ORIGIN);
assert.deepEqual(guides.map(entry => entry.location), [`${ORIGIN}/guides-archive/guide-216/`, `${ORIGIN}/guides-archive/guide-230/`]);
assert.throws(() => projectGuideArchiveSitemapCatalog([{ slug: 'a/b' }], ORIGIN), /invalid/);

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
    loadStandardCards: async () => [], loadCosmetics: async () => rows, loadGuidesArchive: async () => [{ slug: 'guide-216' }],
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
