import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEntitySitemapRouter } from '../server/entitySitemapRoutes.js';
import {
  changedSitemapLocations, createIndexNowNotifier, createSitemapIndexNowHook, INDEXNOW_CONFIG, isMassChange, type IndexNowConfig,
} from '../server/indexNow.js';

const ORIGIN = 'https://hearthpulse.net';
const CONFIG: IndexNowConfig = {
  enabled: true, key: '0123456789abcdef0123456789abcdef', endpoint: 'https://indexnow.test/indexnow', maxRequestsPerDay: 3,
};

type Sent = { url: string; body: { host: string; key: string; keyLocation: string; urlList: string[] } };

/** The network boundary: records each POST and answers with the next status. */
function endpoint(statuses: Array<number | 'network'>) {
  const sent: Sent[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    const status = statuses.shift() ?? 200;
    if (status === 'network') throw new TypeError('fetch failed');
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

function notifier(statuses: Array<number | 'network'>, config: IndexNowConfig = CONFIG) {
  const network = endpoint(statuses);
  const lines: string[] = [];
  const notify = createIndexNowNotifier({
    config, origin: ORIGIN, fetchImpl: network.fetchImpl, now: () => Date.parse('2026-11-20T10:00:00Z'),
    log: line => lines.push(line), sleep: async () => undefined,
  });
  return { notify, sent: network.sent, lines };
}

test('the key file is public, named after the key and holds it', () => {
  assert.match(INDEXNOW_CONFIG.key, /^[0-9a-f]{32}$/);
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_CONFIG.key}.txt`, import.meta.url), 'utf8'), INDEXNOW_CONFIG.key);
});

test('one request carries the host, the key, its location and only own addresses', async () => {
  const { notify, sent, lines } = notifier([200]);
  await notify([`${ORIGIN}/heroes/1/`, `${ORIGIN}/heroes/1/`, 'https://elsewhere.test/x/', `${ORIGIN}/heroes/2/`]);
  assert.deepEqual(sent, [{
    url: 'https://indexnow.test/indexnow',
    body: {
      host: 'hearthpulse.net', key: CONFIG.key,
      keyLocation: 'https://hearthpulse.net/0123456789abcdef0123456789abcdef.txt',
      urlList: ['https://hearthpulse.net/heroes/1/', 'https://hearthpulse.net/heroes/2/'],
    },
  }]);
  assert.deepEqual(lines, ['[indexnow] 200: 2 URL sent']);
});

test('more than 10 000 addresses go in batches of 10 000', async () => {
  const { notify, sent } = notifier([200, 200]);
  await notify(Array.from({ length: 10_001 }, (_, index) => `${ORIGIN}/c/${index}/`));
  assert.deepEqual(sent.map(request => request.body.urlList.length), [10_000, 1]);
});

test('a server or network failure is retried once; a rate limit, a rejected request and a pending key are not; nothing throws', async () => {
  const failing = notifier([503, 'network']);
  await failing.notify([`${ORIGIN}/a/`]);
  assert.equal(failing.sent.length, 2);
  assert.deepEqual(failing.lines, [
    '[indexnow] attempt 1 failed (HTTP 503): 1 URL',
    '[indexnow] attempt 2 failed (TypeError): 1 URL',
  ]);
  const limited = notifier([429]);
  await limited.notify([`${ORIGIN}/a/`]);
  assert.equal(limited.sent.length, 1, 'Yandex asks for ten minutes after a 429');
  assert.deepEqual(limited.lines, ['[indexnow] rejected (HTTP 429): 1 URL']);
  const rejected = notifier([422]);
  await rejected.notify([`${ORIGIN}/a/`]);
  assert.deepEqual(rejected.lines, ['[indexnow] rejected (HTTP 422): 1 URL']);
  const pending = notifier([202]);
  await pending.notify([`${ORIGIN}/a/`, `${ORIGIN}/b/`]);
  assert.deepEqual(pending.lines, ['[indexnow] 202 (key pending): 2 URL accepted']);
  const lines = [...failing.lines, ...limited.lines, ...rejected.lines, ...pending.lines];
  assert.equal(JSON.stringify(lines).includes(CONFIG.key), false, 'logs never carry the key');
});

test('nearly the whole of a large segment changing at once is a mass change; a small segment never is', () => {
  assert.equal(isMassChange(5000, 6000), true);
  assert.equal(isMassChange(300, 6000), false);
  assert.equal(isMassChange(78, 78), false);
});

test('the daily limit stops requests, and a disabled notifier sends nothing', async () => {
  const limited = notifier([200, 200, 200, 200]);
  for (const path of ['/a/', '/b/', '/c/', '/d/']) await limited.notify([`${ORIGIN}${path}`]);
  assert.equal(limited.sent.length, 3);
  assert.equal(limited.lines.at(-1), '[indexnow] daily limit 3 reached: 1 URL not sent');
  const disabled = notifier([200], { ...CONFIG, enabled: false });
  await disabled.notify([`${ORIGIN}/a/`]);
  assert.equal(disabled.sent.length, 0);
});

test('the sitemap hook says once whether it is on, sends the changed addresses in production only and skips a mass change', async () => {
  const doc = (count: number, hash: string) => ({
    schemaVersion: 1 as const, segment: 'standard-cards' as const, updatedAt: '2026-11-20T00:00:00.000Z', entryCount: count, contentHash: hash,
    entries: Array.from({ length: count }, (_, index) => ({ key: `C${index}`, location: `${ORIGIN}/c/${index}/`, semanticHash: index === 0 ? hash : 'same', lastmod: '2026-11-20' })),
  });
  const network = endpoint([200]);
  const lines: string[] = [];
  const hook = createSitemapIndexNowHook('production', { config: CONFIG, log: line => lines.push(line), fetchImpl: network.fetchImpl });
  hook('standard-cards', doc(300, 'a'), doc(300, 'b'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(network.sent.map(request => request.body.urlList), [[`${ORIGIN}/c/0/`]]);
  const mass = { ...doc(300, 'x'), entries: doc(300, 'x').entries.map(entry => ({ ...entry, semanticHash: 'new' })) };
  hook('standard-cards', doc(300, 'a'), mass);
  assert.equal(lines.at(-1), '[indexnow] standard-cards: 300 of 300 URL changed at once, not sent');
  assert.equal(lines[0], '[indexnow] enabled');
  const off: string[] = [];
  const silent = endpoint([200]);
  createSitemapIndexNowHook('development', { config: CONFIG, log: line => off.push(line), fetchImpl: silent.fetchImpl })('standard-cards', doc(300, 'a'), doc(300, 'b'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(off, ['[indexnow] disabled (NODE_ENV=development)']);
  assert.equal(silent.sent.length, 0);
});

test('changed addresses: new, changed and removed; none on a first build', () => {
  const document = (entries: Array<[string, string]>) => ({
    schemaVersion: 1 as const, segment: 'battleground-heroes' as const, updatedAt: '2026-11-20T00:00:00.000Z',
    entryCount: entries.length, contentHash: 'x',
    entries: entries.map(([key, hash]) => ({ key, location: `${ORIGIN}/heroes/${key}/`, semanticHash: hash, lastmod: '2026-11-20' })),
  });
  const before = document([['1', 'a'], ['2', 'b'], ['3', 'c']]);
  const after = document([['1', 'a'], ['2', 'B'], ['4', 'd']]);
  assert.deepEqual(changedSitemapLocations(before, after),
    [`${ORIGIN}/heroes/2/`, `${ORIGIN}/heroes/4/`, `${ORIGIN}/heroes/3/`]);
  assert.deepEqual(changedSitemapLocations(null, after), []);
  assert.deepEqual(changedSitemapLocations(after, after), []);
});

test('a sitemap rebuild with one changed card announces exactly that card; a failed source and a throwing hook change nothing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arena-indexnow-'));
  let now = Date.parse('2026-11-20T08:00:00.000Z');
  let failure: Error | null = null;
  let hookThrows = false;
  const published: Array<{ segment: string; changed: string[] }> = [];
  const card = (id: string, text: string) => ({
    card_id: id, name: { ru: `Карта ${id}` }, text: { ru: text }, card_set: 'CORE',
    card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', rarity: 'COMMON', mana_cost: 1, attack: 1, health: 1,
  });
  let cards = [card('CARD_1', 'Провокация.'), card('CARD_2', 'Рывок.')];
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: ORIGIN, staticUrls: [`${ORIGIN}/`], stateDirectory: directory, now: () => now,
    cacheTtlMs: 5 * 60_000, minimumStandardCardCount: 1,
    loadStandardCards: async () => { if (failure) throw failure; return cards; },
    onSegmentPublished: (segment, previous, next) => {
      if (hookThrows) throw new Error('hook failed');
      published.push({ segment, changed: changedSitemapLocations(previous, next) });
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const segment = async () => {
    const response = await fetch(`http://127.0.0.1:${address.port}/sitemaps/standard-cards.xml`);
    return { status: response.status, source: response.headers.get('X-Sitemap-Source') };
  };
  try {
    assert.deepEqual(await segment(), { status: 200, source: 'catalog' });
    assert.deepEqual(published, [{ segment: 'standard-cards', changed: [] }], 'a first build announces nothing');

    now += 6 * 60_000;
    cards = [card('CARD_1', 'Провокация.'), card('CARD_2', 'Рывок. Божественный щит.')];
    assert.deepEqual(await segment(), { status: 200, source: 'catalog' });
    assert.deepEqual(published.at(-1), { segment: 'standard-cards', changed: [`${ORIGIN}/standard/cards/standard/CARD_2/`] });

    now += 6 * 60_000;
    const count = published.length;
    failure = new Error('source down');
    assert.deepEqual(await segment(), { status: 200, source: 'last-known-good' });
    assert.equal(published.length, count, 'a fallback document announces nothing');

    now += 6 * 60_000;
    failure = null;
    hookThrows = true;
    cards = [card('CARD_1', 'Провокация. Яд.'), card('CARD_2', 'Рывок. Божественный щит.')];
    assert.deepEqual(await segment(), { status: 200, source: 'catalog' }, 'a failing announcement never breaks the sitemap');
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
