import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEntitySitemapRouter,
  loadStaticSitemapArtifact,
} from '../server/entitySitemapRoutes.js';

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
  now: () => number;
  cacheTtlMs?: number;
}) {
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: 'https://arena.hs-manacost.ru',
    staticUrls,
    loadStandardCards: options.load,
    stateDirectory: options.directory,
    now: options.now,
    cacheTtlMs: options.cacheTtlMs ?? 300_000,
    minimumStandardCardCount: 1,
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
  assert.doesNotMatch(staticXml, /<lastmod>/, 'static sitemap must not invent freshness');

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
  assert.doesNotMatch(firstXml, /<lastmod>/, 'first entity observation must omit lastmod');
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

  now += 5 * 60_000 + 1;
  cards = [{ ...publicCard, text: { ru: 'Получает +2/+2.' } }];
  const changed = await fetch(`${app.origin}/sitemaps/standard-cards.xml`);
  assert.equal(changed.status, 200);
  assert.equal(calls, 2);
  const changedXml = await changed.text();
  assert.match(changedXml, /<lastmod>2026-07-21<\/lastmod>/,
    'a semantic public change must set an entity lastmod');
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
  staticUrls.slice(0, 28),
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
