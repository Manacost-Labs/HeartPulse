import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import {
  createEntitySitemapRouter,
  loadStaticSitemapArtifact,
} from '../server/entitySitemapRoutes.js';
import { sitemapContentHash } from '../server/entitySitemapValidation.js';
import { createEntitySitemapRuntimeOptions } from '../server/entitySitemapSources.js';
import { isIndexableArchetype } from '../shared/constructedArchetypeIndexing.js';
import { sitemapEntries } from '../scripts/production-monitor.mjs';
import { assertAsyncProperty } from './helpers/propertyRuns.js';

const datedEntries = (xml: string, root: 'urlset' | 'sitemapindex' = 'urlset') => (
  sitemapEntries(xml, root, 'sitemap under test').map(({ location, lastmod }) => [new URL(location).pathname, lastmod])
);

const staticUrls = Array.from({ length: 29 }, (_, index) => index === 0
  ? 'https://arena.hs-manacost.ru/'
  : `https://arena.hs-manacost.ru/static-${index}/`);
const publicCard = {
  card_id: 'CARD_1',
  name: { ru: 'Карта & один', en: 'Card One' },
  text: { ru: 'Получает +1/+1.' },
  card_set: 'CORE',
  card_type: { slug: 'MINION', name_ru: 'Существо' },
  class: 'MAGE',
  rarity: 'COMMON',
  mana_cost: 1,
  attack: 1,
  health: 1,
  images: { card: 'https://cdn.example.test/CARD_1.png' },
  stats: { privateSentinel: 'QA_PRIVATE_STATS' },
  subscriptionPayload: 'QA_PRIVATE_SUBSCRIPTION',
};

async function start(options: {
  directory: string;
  load: () => Promise<any[]>;
  loadWildCards?: () => Promise<any[]>;
  loadBattlegroundMinions?: () => Promise<any[]>;
  loadBattlegroundSpells?: () => Promise<any[]>;
  loadBattlegroundHeroes?: () => Promise<any[]>;
  loadArchetypes?: () => Promise<any[]>;
  minimumArchetypeCount?: number;
  now: () => number;
  cacheTtlMs?: number;
}) {
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: 'https://arena.hs-manacost.ru',
    staticUrls,
    loadStandardCards: options.load,
    loadWildCards: options.loadWildCards,
    loadBattlegroundMinions: options.loadBattlegroundMinions,
    loadBattlegroundSpells: options.loadBattlegroundSpells,
    loadBattlegroundHeroes: options.loadBattlegroundHeroes,
    loadArchetypes: options.loadArchetypes,
    minimumArchetypeCount: options.minimumArchetypeCount,
    stateDirectory: options.directory,
    now: options.now,
    cacheTtlMs: options.cacheTtlMs ?? 300_000,
    minimumStandardCardCount: 1,
    minimumWildCardCount: 1,
    minimumBattlegroundMinionCount: 1,
    minimumBattlegroundSpellCount: 1,
    minimumBattlegroundHeroCount: 1,
    retryAfterSeconds: 17,
  }));
  app.use((_request, response) => response.status(299).send('DOWNSTREAM_SHELL'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

function rawRequest(origin: string, path: string, headers: Record<string, string>) {
  const target = new URL(path, origin);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const pending = httpRequest({
      host: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers,
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    pending.once('error', reject);
    pending.end();
  });
}

const directory = mkdtempSync(join(tmpdir(), 'arena-sitemap-routes-'));
let now = Date.parse('2026-07-21T08:00:00.000Z');
let calls = 0;
let cards = [publicCard];
let failure: Error | null = null;
const app = await start({
  directory,
  now: () => now,
  cacheTtlMs: 5 * 60_000,
  load: async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    if (failure) throw failure;
    return cards;
  },
});

try {
  const index = await fetch(`${app.origin}/sitemap.xml?ignored=1`, {
    headers: { Cookie: 'private=1', Authorization: 'Bearer private' },
  });
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type') || '', /^application\/xml; charset=utf-8/i);
  assert.equal(index.headers.get('last-modified'), null,
    'process start time must not masquerade as sitemap-index freshness');
  const indexXml = await index.text();
  assert.deepEqual([...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), [
    'https://arena.hs-manacost.ru/sitemaps/static.xml',
    'https://arena.hs-manacost.ru/sitemaps/standard-cards.xml',
  ]);
  assert.doesNotMatch(indexXml, /ignored|private|authorization/i);

  const staticResponse = await fetch(`${app.origin}/sitemaps/static.xml`);
  assert.equal(staticResponse.status, 200);
  assert.equal(staticResponse.headers.get('last-modified'), null,
    'static segment freshness must be omitted unless a real artifact mtime is supplied');
  const staticXml = await staticResponse.text();
  assert.equal([...staticXml.matchAll(/<url>/g)].length, 29);
  assert.deepEqual(
    [...staticXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]),
    staticUrls,
  );
  assert.deepEqual([...new Set(datedEntries(staticXml).map(([, lastmod]) => lastmod))], ['2026-07-21'],
    'a static page the store sees for the first time takes the day of first sight');

  const [first, concurrent] = await Promise.all([
    fetch(`${app.origin}/sitemaps/standard-cards.xml`),
    fetch(`${app.origin}/sitemaps/standard-cards.xml`),
  ]);
  assert.equal(first.status, 200);
  assert.equal(concurrent.status, 200);
  assert.equal(calls, 1, 'concurrent cold requests must share one catalog job');
  assert.equal(first.headers.get('x-sitemap-source'), 'catalog');
  const etag = first.headers.get('etag');
  const lastModified = first.headers.get('last-modified');
  assert.ok(etag);
  assert.ok(lastModified);
  const firstXml = await first.text();
  assert.match(firstXml, /<loc>https:\/\/arena\.hs-manacost\.ru\/standard\/cards\/standard\/CARD_1\/<\/loc>/);
  assert.deepEqual(datedEntries(firstXml), [['/standard/cards/standard/CARD_1/', '2026-07-21']],
    'the first observation of an entity is dated by the day of first sight');
  assert.doesNotMatch(firstXml, /QA_PRIVATE|stats|subscription|deckCode/i);
  assert.equal(await concurrent.text(), firstXml);
  const identityInvariant = await fetch(`${app.origin}/sitemaps/standard-cards.xml?preview=private`, {
    headers: { Cookie: 'session=private-user', Authorization: 'Bearer private-token' },
  });
  assert.equal(await identityInvariant.text(), firstXml,
    'the sitemap document must not vary by auth, cookies or query state');
  assert.doesNotMatch(identityInvariant.headers.get('vary') || '', /cookie|authorization/i);

  const cached = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
  assert.equal(cached.status, 200);
  assert.equal(calls, 1, 'the document cache must avoid catalog refreshes inside its TTL');

  const exact304 = await fetch(`${app.origin}/sitemaps/standard-cards.xml`, {
    headers: { 'If-None-Match': etag! },
  });
  assert.equal(exact304.status, 304);
  assert.equal(await exact304.text(), '');
  const weakMustNot304 = await fetch(`${app.origin}/sitemaps/standard-cards.xml`, {
    headers: { 'If-None-Match': `W/${etag}` },
  });
  assert.equal(weakMustNot304.status, 200, 'only the exact document ETag may produce 304');
  const imsMustNot304 = await fetch(`${app.origin}/sitemaps/standard-cards.xml`, {
    headers: { 'If-Modified-Since': lastModified! },
  });
  assert.equal(imsMustNot304.status, 200, 'Last-Modified is diagnostic; IMS alone must not produce 304');
  assert.equal((await rawRequest(app.origin, '/sitemaps/standard-cards.xml', {
    'If-None-Match': `W/${etag}`,
  })).status, 200, 'Express must not convert a weak validator to 304 implicitly');
  assert.equal((await rawRequest(app.origin, '/sitemaps/standard-cards.xml', {
    'If-Modified-Since': lastModified!,
  })).status, 200, 'Express must not convert IMS alone to 304 implicitly');

  const head = await fetch(`${app.origin}/sitemaps/standard-cards.xml`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('etag'), etag);

  now += 24 * 60 * 60_000 + 1;
  cards = [{ ...publicCard, text: { ru: 'Получает +2/+2.' } }];
  const changed = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
  assert.equal(changed.status, 200);
  assert.equal(calls, 2);
  const changedXml = await changed.text();
  assert.deepEqual(datedEntries(changedXml), [['/standard/cards/standard/CARD_1/', '2026-07-22']],
    'a semantic public change dates the entity by the day it was seen');
  assert.notEqual(changed.headers.get('etag'), etag);

  now += 5 * 60_000 + 1;
  cards = [
    { ...publicCard, text: { ru: 'Получает +3/+3.' } },
    { ...publicCard, text: { ru: 'Конфликтующий дубликат.' } },
  ];
  const rejectedDuplicate = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
  assert.equal(rejectedDuplicate.status, 200);
  assert.equal(rejectedDuplicate.headers.get('x-sitemap-source'), 'last-known-good');
  assert.equal(await rejectedDuplicate.text(), changedXml,
    'an invalid upstream candidate must never replace the valid LKG');

  now += 5 * 60_000 + 1;
  cards = [{ ...publicCard, name: { ru: ' ', en: '' } }];
  const rejectedInvalid = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
  assert.equal(rejectedInvalid.status, 200);
  assert.equal(rejectedInvalid.headers.get('x-sitemap-source'), 'last-known-good');
  assert.equal(await rejectedInvalid.text(), changedXml,
    'an invalid non-pending entity must never replace the valid LKG');

  now += 365 * 24 * 60 * 60_000;
  failure = new Error('upstream secret QA_PRIVATE_UPSTREAM');
  const lkg = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
  assert.equal(lkg.status, 200, 'even an old valid LKG must remain available during an outage');
  assert.equal(lkg.headers.get('x-sitemap-source'), 'last-known-good');
  assert.equal(lkg.headers.get('cache-control'), 'public, max-age=30, stale-while-revalidate=30',
    'an outage copy must not be pinned by shared caches for the full sitemap lifetime');
  assert.equal(await lkg.text(), changedXml);
  assert.doesNotMatch(lkg.headers.get('x-sitemap-source') || '', /private|error|upstream/i);

  const unknown = await fetch(`${app.origin}/sitemaps/private-or-unknown.xml`);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
  assert.notEqual(await unknown.text(), 'DOWNSTREAM_SHELL');
} finally {
  await app.close();
  rmSync(directory, { recursive: true, force: true });
}

const coldDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-cold-'));
const cold = await start({
  directory: coldDirectory,
  now: () => Date.parse('2026-07-21T08:00:00.000Z'),
  load: async () => { throw new Error('cold outage private details'); },
});
try {
  const unavailable = await fetch(`${cold.origin}/sitemaps/standard-cards.xml`);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('retry-after'), '17');
  assert.equal(unavailable.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
  assert.doesNotMatch(await unavailable.text(), /private|outage details/i);
} finally {
  await cold.close();
  rmSync(coldDirectory, { recursive: true, force: true });
}

for (const [label, coldCards] of [
  ['duplicate', [publicCard, { ...publicCard, text: { ru: 'duplicate' } }]],
  ['invalid', [{ ...publicCard, name: { ru: ' ', en: '' } }]],
] as const) {
  const coldInvalidDirectory = mkdtempSync(join(tmpdir(), `arena-sitemap-cold-${label}-`));
  const coldInvalid = await start({
    directory: coldInvalidDirectory,
    now: () => Date.parse('2026-07-21T08:00:00.000Z'),
    load: async () => [...coldCards],
  });
  try {
    const unavailable = await fetch(`${coldInvalid.origin}/sitemaps/standard-cards.xml`);
    assert.equal(unavailable.status, 503, `a ${label} cold catalog must fail closed`);
    assert.equal(unavailable.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
  } finally {
    await coldInvalid.close();
    rmSync(coldInvalidDirectory, { recursive: true, force: true });
  }
}

for (const invalidStaticUrls of [
  [],
  [...staticUrls.slice(0, 28), staticUrls[0]],
  [...staticUrls.slice(0, 28), 'https://evil.example.test/private/'],
  [...staticUrls.slice(0, 28), 'https://arena.hs-manacost.ru/admin/'],
  [...staticUrls.slice(0, 28), 'https://arena.hs-manacost.ru/articles/?preview=1'],
]) {
  assert.throws(() => createEntitySitemapRouter({
    canonicalOrigin: 'https://arena.hs-manacost.ru',
    staticUrls: invalidStaticUrls,
    loadStandardCards: async () => [publicCard],
    stateDirectory: '/tmp',
    minimumStandardCardCount: 1,
  }), /static sitemap/i, 'invalid static registry materialization must fail at startup');
}

let developmentDiagnostic = '';
assert.equal(loadStaticSitemapArtifact(
  ['/definitely/missing/static.xml'],
  { required: false, onMissing: message => { developmentDiagnostic = message; } },
), null, 'development startup may skip sitemap routing when prerender artifacts do not exist yet');
assert.match(developmentDiagnostic, /missing|build/i,
  'development skip must leave an actionable diagnostic');
assert.throws(
  () => loadStaticSitemapArtifact(['/definitely/missing/static.xml'], { required: true }),
  /missing|build/i,
  'production startup must fail closed when the release sitemap artifact is absent',
);

console.log('entity sitemap runtime route contracts passed');

const allSegmentsDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-all-segments-'));
const allSegments = await start({
  directory: allSegmentsDirectory,
  now: () => Date.parse('2026-09-03T08:00:00.000Z'),
  load: async () => [publicCard],
  loadWildCards: async () => [{
    ...publicCard,
    card_id: 'WILD_ONLY_1',
    dbf: 202,
    name: { ru: 'Только Вольный', en: 'Wild Only' },
  }],
  loadBattlegroundMinions: async () => [{
    dbf: 98582,
    card_id: 'BG26_146',
    name: { ru: 'Баюбот', en: 'Lullabot' },
    text: { ru: 'Получает +1/+1.' },
    card_type: { slug: 'minion', name_ru: 'Существо' },
    in_pool: true,
  }],
  loadBattlegroundSpells: async () => [{
    dbf: 105752,
    card_id: 'BG28_897',
    name: { ru: 'Банан в меню', en: 'Tavern Dish Banana' },
    text: { ru: 'Дает существу +1/+1.' },
    card_type: { slug: 'spell', name_ru: 'Заклинание' },
    in_pool: true,
  }],
  loadBattlegroundHeroes: async () => [{
    dbfId: 132608,
    id: 'BG36_HERO_105',
    hero: 'Повелитель кошмаров Ксавий',
    hero_power: { card: { name: 'Сила кошмара', text: 'Пассивная сила.' } },
  }],
  loadArchetypes: async () => [{
    item: { slug: 'pure-paladin', archetype: 'Pure Paladin', format: 'standard', games: 5_000, deckCount: 2, popularity: 2 },
    updatedAt: '2026-09-03T05:00:00+00:00',
    period: 'black_empire',
  }],
  minimumArchetypeCount: 1,
});
try {
  const indexResponse = await fetch(`${allSegments.origin}/sitemap.xml`);
  assert.equal(indexResponse.status, 200);
  assert.deepEqual(
    [...(await indexResponse.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]),
    [
      'https://arena.hs-manacost.ru/sitemaps/static.xml',
      'https://arena.hs-manacost.ru/sitemaps/standard-cards.xml',
      'https://arena.hs-manacost.ru/sitemaps/wild-cards.xml',
      'https://arena.hs-manacost.ru/sitemaps/battleground-minions.xml',
      'https://arena.hs-manacost.ru/sitemaps/battleground-spells.xml',
      'https://arena.hs-manacost.ru/sitemaps/battleground-heroes.xml',
      'https://arena.hs-manacost.ru/sitemaps/archetypes.xml',
    ],
  );

  const expectedLocations = new Map([
    ['/sitemaps/wild-cards.xml', '/standard/cards/wild/WILD_ONLY_1/'],
    ['/sitemaps/battleground-minions.xml', '/library/minions/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-98582/'],
    ['/sitemaps/battleground-spells.xml', '/library/spells/%D0%B1%D0%B0%D0%BD%D0%B0%D0%BD-%D0%B2-%D0%BC%D0%B5%D0%BD%D1%8E-105752/'],
    ['/sitemaps/battleground-heroes.xml', '/heroes/132608/'],
    ['/sitemaps/archetypes.xml', '/standard/archetypes/standard/pure-paladin/'],
  ]);
  for (const [segmentPath, entityPath] of expectedLocations) {
    const segment = await fetch(`${allSegments.origin}${segmentPath}`);
    assert.equal(segment.status, 200, segmentPath);
    assert.equal(segment.headers.get('x-sitemap-source'), 'catalog');
    assert.match(await segment.text(), new RegExp(`<loc>https://arena\\.hs-manacost\\.ru${entityPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/loc>`));
  }
} finally {
  await allSegments.close();
  rmSync(allSegmentsDirectory, { recursive: true, force: true });
}

// The archetypes segment: a real Express router over a catalog fixture, wired the way server/index.ts wires it.
const archetypeItem = (slug: string, overrides: Record<string, unknown> = {}) => ({
  slug,
  archetype: slug,
  archetypeLabel: slug,
  classKey: 'paladin',
  format: 'standard',
  games: 5_000,
  winrate: 51.5,
  popularity: 2.5,
  turns: 8,
  durationMinutes: 8,
  climbingSpeed: 1.2,
  deckCount: 3,
  builds: [{ deckCode: 'QA_PRIVATE_DECK_CODE', games: 800, winrate: 60 }],
  sourceUrl: '',
  ...overrides,
});
const strongSlugs = ['egg-priest', 'pure-paladin', 'zoolock', 'quest-hunter'];
const catalogDay = '2026-10-30';
let archetypeCatalog: { format: string; period: string; updatedAt: string | null; items: unknown[] } = {
  format: 'standard',
  period: 'black_empire_ban',
  updatedAt: `${catalogDay}T11:00:03.937811+00:00`,
  items: [
    ...strongSlugs.map(slug => archetypeItem(slug)),
    archetypeItem('weak-priest', { games: 999 }),
    archetypeItem('wild-zoo', { format: 'wild' }),
    archetypeItem('buildless-druid', { deckCount: 0 }),
  ],
};
// Wild (#637): a strong Wild archetype with a slug Standard also has, and one under the Wild threshold of 5000 games.
const wildDay = '2026-10-28';
let wildArchetypeCatalog: typeof archetypeCatalog = {
  format: 'wild',
  period: 'black_empire_ban',
  updatedAt: `${wildDay}T09:00:00+00:00`,
  items: [archetypeItem('egg-priest', { format: 'wild', games: 6_000 }), archetypeItem('thin-rogue', { format: 'wild', games: 4_999 })],
};
let archetypeFailure: Error | null = null;
let wildArchetypeFailure: Error | null = null;
let archetypeReads = 0;
const archetypeRuntime = createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), { SITEMAP_ARCHETYPES_MIN: '3' }, undefined, {
  loadCatalogs: async format => {
    archetypeReads += 1;
    if (archetypeFailure) throw archetypeFailure;
    if (format === 'wild' && wildArchetypeFailure) throw wildArchetypeFailure;
    return [format === 'wild' ? wildArchetypeCatalog : archetypeCatalog];
  },
});
const archetypeDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-archetypes-'));
// Requests come two days after the data: lastmod must be the data's day, not the request's.
let archetypeNow = Date.parse('2026-11-01T09:00:00.000Z');
const archetypeApp = await start({
  directory: archetypeDirectory,
  now: () => archetypeNow,
  load: async () => [publicCard],
  loadArchetypes: archetypeRuntime.loadArchetypes,
  minimumArchetypeCount: archetypeRuntime.minimumArchetypeCount,
});
const archetypeUrls = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const archetypeLastmods = (xml: string) => [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(match => match[1]);
const archetypeLoc = (slug: string) => `https://arena.hs-manacost.ru/standard/archetypes/standard/${slug}/`;
const wildLoc = (slug: string) => `https://arena.hs-manacost.ru/standard/archetypes/wild/${slug}/`;
/** The `<loc>`/`<lastmod>` pairs of one format's pages, in document order. */
const pagesOf = (xml: string, format: 'standard' | 'wild') => [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
  .filter(match => match[1].includes(`/standard/archetypes/${format}/`)).map(match => [match[1], match[2]]);
const standardUrls = (xml: string) => pagesOf(xml, 'standard').map(([location]) => location);
const standardLastmods = (xml: string) => pagesOf(xml, 'standard').map(([, lastmod]) => lastmod);
const wildPages = [[wildLoc('egg-priest'), wildDay]];
try {
  const index = await fetch(`${archetypeApp.origin}/sitemap.xml`);
  assert.ok(archetypeUrls(await index.text()).includes('https://arena.hs-manacost.ru/sitemaps/archetypes.xml'),
    'the segment is part of the sitemap index');

  const response = await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/xml; charset=utf-8/i);
  assert.equal(response.headers.get('x-sitemap-source'), 'catalog');
  const xml = await response.text();
  assert.equal(response.headers.get('etag'), `"sha256-${createHash('sha256').update(xml).digest('hex')}"`,
    'the ETag is the SHA-256 of the document, as for every other segment');
  assert.ok(response.headers.get('last-modified'));
  assert.deepEqual(standardUrls(xml), ['egg-priest', 'pure-paladin', 'quest-hunter', 'zoolock'].map(archetypeLoc),
    'strong Standard archetypes, in the canonical family');
  assert.deepEqual(standardLastmods(xml), Array(4).fill(catalogDay),
    'lastmod is the day of the catalog data, not the day of the request');
  assert.deepEqual(pagesOf(xml, 'wild'), wildPages,
    'the strong Wild archetype is its Wild page, dated by the Wild catalog; the same slug in Standard is another page');
  assert.equal(archetypeUrls(xml).length, 5, 'four Standard pages and one Wild page, nothing else');
  assert.doesNotMatch(xml, /weak-priest|wild-zoo|thin-rogue|buildless|\/standard\/meta\/|QA_PRIVATE|deckCode/);

  const conditional = await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml`, {
    headers: { 'If-None-Match': response.headers.get('etag')! },
  });
  assert.equal(conditional.status, 304);
  const head = await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml?preview=1`, {
    method: 'HEAD', headers: { Cookie: 'session=private' },
  });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('etag'), response.headers.get('etag'), 'no query or cookie varies the document');

  // A later refresh: the catalog is a day newer, one archetype's numbers moved, a weak one crossed the line,
  // a strong one fell below it. Only the changed and the new archetypes take the new data day.
  archetypeNow += 24 * 60 * 60_000 + 5 * 60_000;
  archetypeCatalog = {
    ...archetypeCatalog,
    updatedAt: '2026-10-31T11:00:00.000000+00:00',
    items: [
      archetypeItem('egg-priest'),
      archetypeItem('pure-paladin', { games: 5_400, winrate: 51.9 }),
      archetypeItem('zoolock', { games: 400 }),
      archetypeItem('quest-hunter'),
      archetypeItem('weak-priest', { games: 1_300 }),
    ],
  };
  const refreshed = await (await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml`)).text();
  assert.deepEqual(standardUrls(refreshed), ['egg-priest', 'pure-paladin', 'quest-hunter', 'weak-priest'].map(archetypeLoc));
  assert.deepEqual(standardLastmods(refreshed), [catalogDay, '2026-10-31', catalogDay, '2026-10-31'],
    'unchanged numbers keep their date; changed and new archetypes take the data day');
  assert.deepEqual(pagesOf(refreshed, 'wild'), wildPages, 'a Standard refresh moves no Wild page');

  // The catalog identical to the last one: the document does not change at all.
  archetypeNow += 6 * 60_000;
  archetypeCatalog = { ...archetypeCatalog, updatedAt: '2026-11-01T08:00:00+00:00' };
  const restamped = await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml`);
  assert.equal(await restamped.text(), refreshed, 'a newer catalog stamp over the same numbers moves no lastmod');

  // A patch: the list may legitimately shrink by far more than a tenth (to the floor of 3).
  archetypeNow += 6 * 60_000;
  archetypeCatalog = {
    ...archetypeCatalog,
    period: 'patch_37.0.1',
    updatedAt: '2026-11-01T08:30:00+00:00',
    items: [archetypeItem('egg-priest', { games: 1_100 }), archetypeItem('pure-paladin', { games: 1_200 }),
      archetypeItem('zoolock', { games: 1_300 }), ...Array.from({ length: 20 }, (_, index) => archetypeItem(`fresh-${index}`, { games: 40 }))],
  };
  const afterPatch = await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml`);
  assert.equal(afterPatch.headers.get('x-sitemap-source'), 'catalog', 'four archetypes down to three is not a truncation');
  const afterPatchXml = await afterPatch.text();
  assert.deepEqual(standardUrls(afterPatchXml), ['egg-priest', 'pure-paladin', 'zoolock'].map(archetypeLoc));
  assert.deepEqual(standardLastmods(afterPatchXml), Array(3).fill('2026-11-01'));
  assert.deepEqual(pagesOf(afterPatchXml, 'wild'), wildPages);

  // Below the floor, empty, broken or unreadable: the last good segment, never an empty urlset.
  const failures: Array<[string, () => void]> = [
    ['one strong Standard and one strong Wild archetype are below the floor', () => {
      archetypeCatalog = { ...archetypeCatalog, items: [archetypeItem('egg-priest')] };
    }],
    ['no strong Standard archetype at all', () => { archetypeCatalog = { ...archetypeCatalog, items: [archetypeItem('weak', { games: 5 })] }; }],
    ['an empty catalog', () => { archetypeCatalog = { ...archetypeCatalog, items: [] }; }],
    ['a catalog without a data date', () => {
      archetypeCatalog = { ...archetypeCatalog, updatedAt: null, items: strongSlugs.map(slug => archetypeItem(slug)) };
    }],
    ['a Wild catalog', () => { archetypeCatalog = { ...archetypeCatalog, format: 'wild', updatedAt: '2026-11-01T09:00:00+00:00' }; }],
    ['an unreadable catalog', () => { archetypeFailure = new Error('catalog down QA_PRIVATE_UPSTREAM'); }],
    ['an unreadable Wild catalog', () => { wildArchetypeFailure = new Error('wild catalog down'); }],
    ['a Standard catalog where Wild was asked for', () => { wildArchetypeCatalog = { ...wildArchetypeCatalog, format: 'standard' }; }],
  ];
  const wildBefore = wildArchetypeCatalog;
  for (const [label, arrange] of failures) {
    archetypeCatalog = { ...archetypeCatalog, format: 'standard', updatedAt: '2026-11-02T08:00:00+00:00' };
    wildArchetypeCatalog = wildBefore;
    archetypeFailure = null;
    wildArchetypeFailure = null;
    arrange();
    archetypeNow += 6 * 60_000;
    const lkg = await fetch(`${archetypeApp.origin}/sitemaps/archetypes.xml`);
    assert.equal(lkg.status, 200, label);
    assert.equal(lkg.headers.get('x-sitemap-source'), 'last-known-good', label);
    assert.equal(await lkg.text(), afterPatchXml, `${label}: the last good state, byte for byte`);
  }
  archetypeFailure = null;
  wildArchetypeFailure = null;
  assert.ok(archetypeReads > 5);
} finally {
  await archetypeApp.close();
  rmSync(archetypeDirectory, { recursive: true, force: true });
}

// Cold start with an unreadable or too small catalog: a retryable 503, never an empty urlset.
for (const [label, load] of [
  ['unreadable', async () => { throw new Error('catalog down'); }],
  ['too small', async () => [{ item: archetypeItem('egg-priest'), updatedAt: '2026-10-30T11:00:00+00:00', period: null }]],
  ['listing a noindex page', async () => ['a', 'b', 'c'].map(slug => ({ item: archetypeItem(slug, { games: 12 }), updatedAt: '2026-10-30T11:00:00+00:00', period: null }))],
] as const) {
  const coldDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-archetypes-cold-'));
  const cold = await start({
    directory: coldDirectory, now: () => Date.parse('2026-11-01T09:00:00.000Z'), load: async () => [publicCard],
    loadArchetypes: load, minimumArchetypeCount: 3,
  });
  try {
    const unavailable = await fetch(`${cold.origin}/sitemaps/archetypes.xml`);
    assert.equal(unavailable.status, 503, `a cold ${label} catalog fails closed`);
    assert.equal(unavailable.headers.get('retry-after'), '17');
    assert.doesNotMatch(await unavailable.text(), /<urlset|catalog down/);
  } finally {
    await cold.close();
    rmSync(coldDirectory, { recursive: true, force: true });
  }
}

// The router's own floor, when nothing overrides it, is 30 archetypes: 29 are a truncation, 30 are a segment.
for (const [count, status] of [[29, 503], [30, 200]] as const) {
  const floorDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-archetypes-floor-'));
  const floor = await start({
    directory: floorDirectory, now: () => Date.parse('2026-11-01T09:00:00.000Z'), load: async () => [publicCard],
    loadArchetypes: async () => Array.from({ length: count }, (_, index) => ({
      item: archetypeItem(`deck-${index}`), updatedAt: '2026-10-30T11:00:00+00:00', period: null,
    })),
  });
  try {
    assert.equal((await fetch(`${floor.origin}/sitemaps/archetypes.xml`)).status, status, `${count} archetypes`);
  } finally {
    await floor.close();
    rmSync(floorDirectory, { recursive: true, force: true });
  }
}

// Without a catalog the segment is absent from the index and answers 404, like any unknown segment.
const withoutArchetypesDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-no-archetypes-'));
const withoutArchetypes = await start({
  directory: withoutArchetypesDirectory, now: () => Date.parse('2026-11-01T09:00:00.000Z'), load: async () => [publicCard],
});
try {
  assert.equal((await fetch(`${withoutArchetypes.origin}/sitemaps/archetypes.xml`)).status, 404);
  assert.doesNotMatch(await (await fetch(`${withoutArchetypes.origin}/sitemap.xml`)).text(), /archetypes\.xml/);
} finally {
  await withoutArchetypes.close();
  rmSync(withoutArchetypesDirectory, { recursive: true, force: true });
}

// Property: whatever the Standard and Wild catalogs hold, the served segment is exactly the pages the shared rule marks
// indexable, each in its own format (a Wild row in the Standard catalog, or the reverse, is no page of that list).
const archetypePropertyItem = fc.record({
  slug: fc.constantFrom('a-deck', 'b-deck', 'c-deck', 'd-deck', 'e-deck', 'f-deck'),
  format: fc.constantFrom('standard', 'wild'),
  games: fc.integer({ min: 0, max: 8_000 }),
  deckCount: fc.integer({ min: 0, max: 3 }),
  popularity: fc.double({ min: 0, max: 10, noNaN: true }),
});
const archetypePropertyCatalogs = fc.record({
  standard: fc.array(archetypePropertyItem, { maxLength: 24 }),
  wild: fc.array(archetypePropertyItem, { maxLength: 24 }),
});
await assertAsyncProperty(fc.asyncProperty(archetypePropertyCatalogs, async catalogs => {
  const directoryForRun = mkdtempSync(join(tmpdir(), 'arena-sitemap-archetypes-property-'));
  const runtime = createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), { SITEMAP_ARCHETYPES_MIN: '1' }, undefined, {
    loadCatalogs: async format => [{ format, period: null, updatedAt: '2026-10-30T11:00:00+00:00', items: catalogs[format] }],
  });
  const app = await start({
    directory: directoryForRun, now: () => Date.parse('2026-11-01T09:00:00.000Z'), load: async () => [publicCard],
    loadArchetypes: runtime.loadArchetypes, minimumArchetypeCount: runtime.minimumArchetypeCount,
  });
  try {
    const response = await fetch(`${app.origin}/sitemaps/archetypes.xml`);
    const expected = (['standard', 'wild'] as const).flatMap(format => {
      const firstOfSlug = new Map<string, (typeof catalogs.standard)[number]>();
      for (const item of catalogs[format]) if (!firstOfSlug.has(item.slug)) firstOfSlug.set(item.slug, item);
      return [...firstOfSlug.values()].filter(item => item.format === format && isIndexableArchetype(item))
        .map(item => `https://arena.hs-manacost.ru/standard/archetypes/${format}/${item.slug}/`);
    });
    if (expected.length === 0) {
      assert.equal(response.status, 503, 'no indexable archetype: no sitemap, never an empty one');
      return;
    }
    assert.equal(response.status, 200);
    assert.deepEqual(archetypeUrls(await response.text()).sort(), expected.sort());
  } finally {
    await app.close();
    rmSync(directoryForRun, { recursive: true, force: true });
  }
}));

console.log('entity sitemap archetype segment contracts passed');

// Dates of the static pages and of the index: every entry has one, and only a change of content moves it.
async function startDated(options: {
  directory: string;
  now: () => number;
  fingerprints: Map<string, string>;
  staticUrls: string[];
  loadStandardCards: () => Promise<any[]>;
  loadArchetypes?: () => Promise<any[]>;
}) {
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: 'https://hearthpulse.net',
    staticUrls: options.staticUrls,
    staticFingerprints: options.fingerprints,
    loadStandardCards: options.loadStandardCards,
    loadArchetypes: options.loadArchetypes,
    minimumStandardCardCount: 1,
    minimumArchetypeCount: 1,
    stateDirectory: options.directory,
    now: options.now,
    responseDeadlineMs: 500,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

const datedDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-dated-'));
try {
  const staticPages = ['https://hearthpulse.net/', 'https://hearthpulse.net/faq/', 'https://hearthpulse.net/standard/cards/'];
  const fingerprints = new Map(staticPages.map((url, position) => [url, String(position + 1).repeat(64)]));
  let datedNow = Date.parse('2026-11-10T08:00:00.000Z');
  const archetype = {
    item: { slug: 'pure-paladin', archetype: 'Pure Paladin', format: 'standard', games: 5_000, deckCount: 2, popularity: 2 },
    updatedAt: '2026-11-08T05:00:00+00:00',
    period: 'black_empire',
  };
  const boot = () => startDated({
    directory: datedDirectory,
    now: () => datedNow,
    fingerprints,
    staticUrls: staticPages,
    loadStandardCards: async () => [publicCard],
    loadArchetypes: async () => [archetype],
  });
  const read = async (origin: string, path: string, root: 'urlset' | 'sitemapindex' = 'urlset') => (
    datedEntries(await (await fetch(`${origin}${path}`)).text(), root)
  );

  let app = await boot();
  try {
    assert.deepEqual(await read(app.origin, '/sitemaps/static.xml'), [
      ['/', '2026-11-10'],
      ['/faq/', '2026-11-10'],
      ['/standard/cards/', '2026-11-10'],
    ], 'a static page is dated by the day its content was first seen');
    assert.deepEqual(await read(app.origin, '/sitemaps/archetypes.xml'), [['/standard/archetypes/standard/pure-paladin/', '2026-11-08']]);
    assert.deepEqual(await read(app.origin, '/sitemap.xml', 'sitemapindex'), [
      ['/sitemaps/static.xml', '2026-11-10'],
      ['/sitemaps/standard-cards.xml', '2026-11-10'],
      ['/sitemaps/archetypes.xml', '2026-11-08'],
    ], 'the index dates each sitemap by the latest lastmod among its addresses');
  } finally {
    await app.close();
  }

  // A rebuild and restart a week later over the same content, but the FAQ text changed and a new card appeared.
  datedNow = Date.parse('2026-11-17T08:00:00.000Z');
  fingerprints.set('https://hearthpulse.net/faq/', 'f'.repeat(64));
  const rebooted = await startDated({
    directory: datedDirectory,
    now: () => datedNow,
    fingerprints,
    staticUrls: staticPages,
    loadStandardCards: async () => [publicCard, { ...publicCard, card_id: 'CARD_NEW', name: { ru: 'Новая', en: 'New' } }],
    loadArchetypes: async () => [archetype],
  });
  try {
    assert.deepEqual(await read(rebooted.origin, '/sitemaps/static.xml'), [
      ['/', '2026-11-10'],
      ['/faq/', '2026-11-17'],
      ['/standard/cards/', '2026-11-17'],
    ], 'only the page whose content changed moves; the cards listing follows its newest card');
    assert.deepEqual(await read(rebooted.origin, '/sitemaps/standard-cards.xml'), [
      ['/standard/cards/standard/CARD_1/', '2026-11-10'],
      ['/standard/cards/standard/CARD_NEW/', '2026-11-17'],
    ]);
    assert.deepEqual(await read(rebooted.origin, '/sitemap.xml', 'sitemapindex'), [
      ['/sitemaps/static.xml', '2026-11-17'],
      ['/sitemaps/standard-cards.xml', '2026-11-17'],
      ['/sitemaps/archetypes.xml', '2026-11-08'],
    ]);
  } finally {
    await rebooted.close();
  }

  // An unchanged rebuild leaves every date where it was.
  datedNow = Date.parse('2026-12-01T08:00:00.000Z');
  app = await boot();
  try {
    assert.deepEqual((await read(app.origin, '/sitemaps/static.xml')).map(([, lastmod]) => lastmod),
      ['2026-11-10', '2026-11-17', '2026-11-17']);
  } finally {
    await app.close();
  }
} finally {
  rmSync(datedDirectory, { recursive: true, force: true });
}

// The two archetype lists (#637): each is dated by its own format's pages, so a Wild change moves the Wild list only.
const listsDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-archetype-lists-'));
try {
  const read = async (origin: string, path: string) => datedEntries(await (await fetch(`${origin}${path}`)).text(), 'urlset');
  const lists = ['https://hearthpulse.net/standard/archetypes/', 'https://hearthpulse.net/standard/archetypes/wild/'];
  const fingerprints = new Map(lists.map((url, position) => [url, String(position + 1).repeat(64)]));
  const row = (format: string, games: number, updatedAt: string) => ({
    item: { slug: 'pure-paladin', archetype: 'Pure Paladin', format, games, deckCount: 2, popularity: 2 }, updatedAt, period: 'black_empire',
  });
  const boot = (now: string, wild: ReturnType<typeof row>) => startDated({
    directory: listsDirectory, now: () => Date.parse(now), fingerprints, staticUrls: lists,
    loadStandardCards: async () => [publicCard],
    loadArchetypes: async () => [row('standard', 5_000, '2026-11-08T05:00:00+00:00'), wild],
  });
  let app = await boot('2026-11-10T08:00:00.000Z', row('wild', 6_000, '2026-11-08T05:00:00+00:00'));
  try {
    assert.deepEqual(await read(app.origin, '/sitemaps/static.xml'),
      [['/standard/archetypes/', '2026-11-10'], ['/standard/archetypes/wild/', '2026-11-10']]);
  } finally {
    await app.close();
  }
  app = await boot('2026-11-17T08:00:00.000Z', row('wild', 6_500, '2026-11-16T05:00:00+00:00'));
  try {
    assert.deepEqual(await read(app.origin, '/sitemaps/archetypes.xml'), [
      ['/standard/archetypes/standard/pure-paladin/', '2026-11-08'],
      ['/standard/archetypes/wild/pure-paladin/', '2026-11-16'],
    ]);
    assert.deepEqual(await read(app.origin, '/sitemaps/static.xml'),
      [['/standard/archetypes/', '2026-11-10'], ['/standard/archetypes/wild/', '2026-11-16']],
      'the Standard list keeps its day; the Wild list follows its changed archetype');
  } finally {
    await app.close();
  }
} finally {
  rmSync(listsDirectory, { recursive: true, force: true });
}

// Every record of the index has a day. A segment that cannot be built is dated from the state the store saved
// earlier (it survives a restart); with no state at all it is left out, so one failing source does not take the
// index from crawlers. The index answers 503 only when no record can be dated.
const outageDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-outage-'));
try {
  const down = async () => { throw new Error('source down'); };
  const archetype = {
    item: { slug: 'pure-paladin', archetype: 'Pure Paladin', format: 'standard', games: 5_000, deckCount: 2, popularity: 2 },
    updatedAt: '2026-11-08T05:00:00+00:00',
    period: 'black_empire',
  };
  const indexOf = async (loadArchetypes: () => Promise<any[]>) => {
    const app = await startDated({
      directory: outageDirectory,
      now: () => Date.parse('2026-11-10T08:00:00.000Z'),
      fingerprints: new Map(),
      staticUrls: ['https://hearthpulse.net/'],
      loadStandardCards: async () => [publicCard],
      loadArchetypes,
    });
    try {
      const startedAt = Date.now();
      const response = await fetch(`${app.origin}/sitemap.xml`);
      return { response, text: await response.text(), elapsedMs: Date.now() - startedAt };
    } finally {
      await app.close();
    }
  };
  const recordsOf = (text: string) => sitemapEntries(text, 'sitemapindex', 'index', { requireLastmod: false })
    .map(({ location, lastmod }) => [new URL(location).pathname, lastmod]);

  const withoutState = await indexOf(down);
  assert.equal(withoutState.response.status, 200, 'one undatable sitemap does not take the index down');
  assert.deepEqual(recordsOf(withoutState.text), [
    ['/sitemaps/static.xml', '2026-11-10'],
    ['/sitemaps/standard-cards.xml', '2026-11-10'],
  ], 'the sitemap with no day and no source is not listed; every listed one has a day');
  assert.ok(withoutState.elapsedMs < 2_000, `the index answers within 2 s, took ${withoutState.elapsedMs} ms`);

  assert.equal((await indexOf(async () => [archetype])).response.status, 200);
  const fromState = await indexOf(down);
  assert.equal(fromState.response.status, 200, 'the saved state dates the sitemap the source cannot deliver');
  assert.deepEqual(recordsOf(fromState.text), [
    ['/sitemaps/static.xml', '2026-11-10'],
    ['/sitemaps/standard-cards.xml', '2026-11-10'],
    ['/sitemaps/archetypes.xml', '2026-11-08'],
  ]);

  // State written before every address had a day: the sitemap takes the day the state was last written.
  for (const filename of ['seo-archetypes-sitemap-v1.json', 'seo-archetypes-sitemap-v1.lkg.json']) {
    const file = join(outageDirectory, filename);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const unsigned = {
      ...saved,
      updatedAt: '2026-11-03T05:00:00.000Z',
      entries: saved.entries.map(({ lastmod: _lastmod, ...entry }: { lastmod?: string }) => entry),
    };
    delete unsigned.contentHash;
    writeFileSync(file, JSON.stringify({ ...unsigned, contentHash: sitemapContentHash(unsigned) }), 'utf8');
  }
  const legacy = await indexOf(down);
  assert.equal(legacy.response.status, 200);
  assert.deepEqual(recordsOf(legacy.text).at(-1), ['/sitemaps/archetypes.xml', '2026-11-10'],
    'state without days: its addresses take the day the store first sees them, like any address it has no date for');
} finally {
  rmSync(outageDirectory, { recursive: true, force: true });
}

// Nothing to list: no source delivers and the store cannot hold a day (its directory is a file).
const brokenStore = mkdtempSync(join(tmpdir(), 'arena-sitemap-broken-'));
try {
  const blocker = join(brokenStore, 'not-a-directory');
  writeFileSync(blocker, 'x', 'utf8');
  const app = await startDated({
    directory: blocker,
    now: () => Date.parse('2026-11-10T08:00:00.000Z'),
    fingerprints: new Map(),
    staticUrls: ['https://hearthpulse.net/'],
    loadStandardCards: async () => { throw new Error('source down'); },
  });
  try {
    const response = await fetch(`${app.origin}/sitemap.xml`);
    assert.equal(response.status, 503, 'no record has a day: nothing to list, a retryable 503');
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
  } finally {
    await app.close();
  }
} finally {
  rmSync(brokenStore, { recursive: true, force: true });
}
// State written before the store dated every address, a source that does not answer: every served address still has
// a day, and the day does not move when the rebuild catches up (not even across midnight).
const legacyDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-legacy-'));
const releases: Array<() => void> = [];
try {
  const cards = [1, 2, 3, 4].map(number => ({
    ...publicCard, card_id: `CARD_${number}`, name: { ru: `Карта ${number}`, en: `Card ${number}` },
  }));
  const seedDay = Date.parse('2026-11-10T08:00:00.000Z');
  const seed = await startDated({
    directory: legacyDirectory, now: () => seedDay, fingerprints: new Map(),
    staticUrls: ['https://hearthpulse.net/'], loadStandardCards: async () => cards,
  });
  try {
    assert.equal((await fetch(`${seed.origin}/sitemaps/standard-cards.xml`)).status, 200);
  } finally {
    await seed.close();
  }
  for (const filename of ['seo-standard-cards-sitemap-v1.json', 'seo-standard-cards-sitemap-v1.lkg.json']) {
    const file = join(legacyDirectory, filename);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const unsigned = {
      ...saved,
      entries: saved.entries.map(({ lastmod: _lastmod, ...entry }: { lastmod?: string }, position: number) => (
        position % 2 === 0 ? entry : { ...entry, lastmod: '2026-10-01' }
      )),
    };
    delete unsigned.contentHash;
    writeFileSync(file, JSON.stringify({ ...unsigned, contentHash: sitemapContentHash(unsigned) }), 'utf8');
  }

  let legacyNow = Date.parse('2026-11-12T08:00:00.000Z');
  const hung = new Promise<void>(resolve => releases.push(resolve));
  const app = await startDated({
    directory: legacyDirectory, now: () => legacyNow, fingerprints: new Map(),
    staticUrls: ['https://hearthpulse.net/'], loadStandardCards: async () => { await hung; return cards; },
  });
  try {
    const entriesOf = async () => {
      const response = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
      return { source: response.headers.get('x-sitemap-source'), entries: datedEntries(await response.text()) };
    };
    const served = await entriesOf();
    assert.equal(served.source, 'last-known-good', 'the source does not answer: the saved copy is served');
    assert.deepEqual(served.entries.map(([, lastmod]) => lastmod),
      ['2026-11-12', '2026-10-01', '2026-11-12', '2026-10-01'],
      'every address has a day; the ones the state dated keep it');

    legacyNow = Date.parse('2026-11-13T08:00:00.000Z'); // the rebuild catches up the next day
    releases.forEach(release => release());
    let caughtUp = await entriesOf();
    for (let attempt = 0; attempt < 40 && caughtUp.source !== 'catalog'; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
      caughtUp = await entriesOf();
    }
    assert.equal(caughtUp.source, 'catalog', 'the rebuild replaced the saved copy');
    assert.deepEqual(caughtUp.entries, served.entries, 'a day shown from the saved copy is the day the store keeps');
  } finally {
    await app.close();
  }
} finally {
  releases.forEach(release => release());
  rmSync(legacyDirectory, { recursive: true, force: true });
}

// The index answers from the saved state without waiting for a rebuild, and asks a hung source only once.
const coldIndexDirectory = mkdtempSync(join(tmpdir(), 'arena-sitemap-cold-index-'));
try {
  const gate = new Promise<void>(resolve => releases.push(resolve));
  const indexRequest = async (loadStandardCards: () => Promise<any[]>, loadArchetypes: () => Promise<any[]>) => {
    const app = await startDated({
      directory: coldIndexDirectory, now: () => Date.parse('2026-11-10T08:00:00.000Z'), fingerprints: new Map(),
      staticUrls: ['https://hearthpulse.net/'], loadStandardCards, loadArchetypes,
    });
    try {
      const startedAt = Date.now();
      const response = await fetch(`${app.origin}/sitemap.xml`);
      const text = await response.text();
      return { status: response.status, elapsedMs: Date.now() - startedAt, text };
    } finally {
      await app.close();
    }
  };
  const archetypeRow = {
    item: { slug: 'pure-paladin', archetype: 'Pure Paladin', format: 'standard', games: 5_000, deckCount: 2, popularity: 2 },
    updatedAt: '2026-11-08T05:00:00+00:00',
    period: 'black_empire',
  };
  const slow = async () => { await gate; return [publicCard]; };
  const slowArchetypes = async () => { await gate; return [archetypeRow]; };

  const noState = await indexRequest(slow, slowArchetypes);
  assert.equal(noState.status, 200);
  assert.ok(noState.elapsedMs < 900, `a hung source with no state is waited for once (500 ms), took ${noState.elapsedMs} ms`);

  assert.equal((await indexRequest(async () => [publicCard], async () => [archetypeRow])).status, 200);
  const restarted = await indexRequest(slow, slowArchetypes);
  assert.equal(restarted.status, 200);
  assert.ok(restarted.elapsedMs < 400, `the index does not wait for slow sources, took ${restarted.elapsedMs} ms`);
  assert.deepEqual(
    sitemapEntries(restarted.text, 'sitemapindex', 'index').map(({ location, lastmod }) => [new URL(location).pathname, lastmod]),
    [
      ['/sitemaps/static.xml', '2026-11-10'],
      ['/sitemaps/standard-cards.xml', '2026-11-10'],
      ['/sitemaps/archetypes.xml', '2026-11-08'],
    ],
    'the dates come from the saved state',
  );
} finally {
  releases.forEach(release => release());
  rmSync(coldIndexDirectory, { recursive: true, force: true });
}

console.log('entity sitemap lastmod contracts passed');
