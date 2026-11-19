import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundLibrarySeoRouter } from '../server/battlegroundLibrarySeoRoutes.ts';
import { CLOSED, fetchImpl, slug } from './helpers/battlegroundLibraryOpenFixture.ts';

// The built library pages against an Express that serves the real open projections: a guest and a robot get the
// same HTML with the open listing (every card of the pool, tier, tribe, attack/health, average place and popularity),
// the open layer of a card page (facts, statistics, related cards) and nothing closed, neither in the HTML, nor in the
// RSC payload (`self.__next_f`), nor in the JSON-LD. A card below the indexing threshold is noindex without JSON-LD.

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const closedIn = text => CLOSED.filter(value => text.includes(value));
const payloadOf = html => [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
const jsonLdOf = html => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => { state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' }); next(); });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.use('/api/bg/library/public/listing', (_request, response, next) => state.listingDown ? response.status(503).json({ error: 'down' }) : next());
  app.use(createBattlegroundLibrarySeoRouter({ fetchImpl, auxiliaryCatalogBaseUrl: 'https://api.example.test/api/v1', onError: () => undefined }));
  return app;
}

test('the guest HTML of the library carries the open layer and nothing closed', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], listingDown: false };
  const legacy = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacy, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacy.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  const get = async (path, headers = { 'User-Agent': BROWSER_UA }) => {
    const response = await fetch(`${next.origin}${path}`, { headers });
    return { status: response.status, html: await response.text() };
  };
  try {
    // A listing this process never read, with the source down: a 200 page with a notice instead of the cards (and the
    // closed part); once the source answers, the next regeneration brings the cards.
    state.listingDown = true;
    const cold = await get('/library/minions/');
    assert.equal(cold.status, 200);
    assert.match(cold.html, /Список карт временно недоступен/);
    assert.match(cold.html, /class="paywalled-library"/);
    assert.equal(rowsCount(cold.html), 0);
    state.listingDown = false;
    let listed = cold;
    for (let attempt = 0; attempt < 40 && rowsCount(listed.html) === 0; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      await delay(250);
      listed = await get('/library/minions/');
    }
    // The listing of minions: every card of the current pool, grouped by tavern tier, with the open statistics.
    const { status, html } = listed;
    assert.equal(status, 200);
    // The rows are valid HTML without the optional end tags (`LibraryListingTable`).
    const rows = [...html.matchAll(/<tr><th scope=row><a href="(\/library\/minions\/[^"]+)">([^<]+)<\/a><td>([^<]+)<td>([^<]+)(?:<td>([^<]+)<td>([^<]+))?(?=<tr>|<\/table>)/g)]
      .map(match => ({ href: match[1], name: match[2], tribe: match[3], body: match[4], avg: match[5], popularity: match[6] }));
    assert.deepEqual(rows.map(row => row.name), ['Без выборки', 'Мурлок', 'Первый зверь', 'Второй зверь'], 'every card of the pool, by tier then name');
    assert.deepEqual(rows.find(row => row.name === 'Первый зверь'), {
      href: `/library/minions/${slug('Первый зверь')}-1001/`, name: 'Первый зверь', tribe: 'Зверь', body: '3/4', avg: '3,90', popularity: '7,5%' });
    assert.equal(rows.find(row => row.name === 'Без выборки').avg, '—', 'below the sample there are no figures');
    assert.match(html, /Данные на <time dateTime="2026-11-19T02:45:13\.000Z">19 ноября 2026, 05:45 МСК<\/time> · источник HSReplay · рейтинг «Топ 50%»/);
    assert.ok(html.indexOf('<h1') < html.indexOf('<table') && html.indexOf('<table') < html.indexOf('class="paywalled-library"'),
      'the open list stands after the H1 and before the closed part');
    assert.doesNotMatch(html, /доступна подписчикам/, 'the open list replaces the gate');
    const payload = payloadOf(html);
    const jsonLd = jsonLdOf(html);
    assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
    for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
      assert.deepEqual(closedIn(text), [], `${name} has no closed value`);
    }
    const graph = JSON.parse(jsonLd[0])['@graph'];
    const collection = graph.find(node => node['@type'] === 'CollectionPage');
    assert.equal(collection.isAccessibleForFree, false);
    assert.deepEqual(collection.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-library' });
    const dataset = graph.find(node => node['@type'] === 'Dataset');
    assert.deepEqual(dataset.hasPart, collection.hasPart);
    assert.equal(dataset.isAccessibleForFree, false);
    const list = graph.find(node => node['@type'] === 'ItemList');
    assert.equal(list.numberOfItems, 4);
    assert.deepEqual(list.itemListElement.map(item => item.url), rows.map(row => encodeURI(`https://hearthpulse.net${row.href}`)), 'the ItemList equals the table');

    // The server reads the open projection anonymously: the listing, never a closed route.
    const protectedReads = state.reads.filter(read => /^\/api\/bg\/library\/(?!public\/)/.test(read.path));
    assert.deepEqual(protectedReads, [], 'no closed library route is read by the page');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A robot and a guest get the same document.
    assert.equal((await get('/library/minions/', { 'User-Agent': ROBOT_UA })).html, (await get('/library/minions/', { 'User-Agent': BROWSER_UA, Cookie: 'session=guest' })).html,
      'the HTML does not depend on the viewer');

    // A staged listing and the hub: links to every listing with its size; the hub never fails.
    const anomalies = await get('/library/anomalies/');
    assert.equal(anomalies.status, 200);
    assert.deepEqual([...anomalies.html.matchAll(/<tr><th scope=row><a href="\/library\/anomalies\/[^"]+">(Аномалия \d)<\/a>/g)].map(match => match[1]), ['Аномалия 1', 'Аномалия 2']);
    assert.deepEqual(closedIn(anomalies.html), []);
    // The hub is prerendered at build, without Express, so its copy has the links and no sizes: regenerate it with data.
    let hub = await get('/library/');
    assert.equal(hub.status, 200);
    assert.match(hub.html, /<a href="\/library\/minions\/">Существа<\/a>/, 'the build copy keeps the links without the sizes');
    for (let attempt = 0; attempt < 40 && !/<a href="\/library\/minions\/">Существа<span[^>]*>4<\/span><\/a>/.test(hub.html); attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      await delay(250);
      hub = await get('/library/');
    }
    assert.match(hub.html, /<a href="\/library\/minions\/">Существа<span[^>]*>4<\/span><\/a>/);
    assert.match(hub.html, /<a href="\/library\/archive\/">Архив<\/a>/);

    // A listing source that fails: the last verified listing is served, never an empty page.
    state.listingDown = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const regenerated = await get('/library/minions/');
      assert.equal(regenerated.status, 200);
      assert.equal(rowsCount(regenerated.html), 4, 'the regeneration with a failing source keeps the cards');
      await delay(300);
    }
    state.listingDown = false;

    // A card page: the open layer, the same for everyone; indexable with ten facts.
    const cardPath = `/library/minions/${slug('Первый зверь')}-1001/`;
    const card = await get(cardPath);
    assert.equal(card.status, 200);
    assert.match(card.html, /<meta name="robots" content="index, follow/);
    assert.match(card.html, /<h1[^>]*>Первый зверь<\/h1><p>Существо, Зверь, таверна 2, 3\/4, среднее место 3,90: Провокация\.<\/p>/, 'one line under the H1');
    for (const fact of ['<dt>Уровень таверны</dt><dd>2</dd>', '<dt>Атака/здоровье</dt><dd>3/4</dd>', '<dt>Золотая версия</dt><dd>6/8</dd>',
      '<dt>Среднее место с картой</dt><dd>3,90</dd>', '<dt>Среднее место без карты</dt><dd>4,20</dd>', '<dt>Популярность</dt><dd>7,5%</dd>', '<dt>Игр в выборке</dt>']) {
      assert.ok(card.html.includes(fact), fact);
    }
    assert.match(card.html, /<h2 id="card-related-title">Связанные карты<\/h2>[\s\S]*href="\/library\/minions\/второй-зверь-1002\/"/);
    assert.doesNotMatch(card.html, /href="\/library\/minions\/мурлок-1003\/"/, 'a murloc is not related to a beast');
    assert.ok(card.html.indexOf('card-facts') < card.html.indexOf('card-related') && card.html.indexOf('card-related') < card.html.indexOf('class="paywalled-library-card"'),
      'the open layer stands before the closed part');
    const cardPayload = payloadOf(card.html);
    const cardLd = jsonLdOf(card.html).filter(text => text.includes('data-entity') || text.includes('"@graph"'));
    for (const [name, text] of [['HTML', card.html], ['RSC payload', cardPayload], ['JSON-LD', cardLd.join('\n')]]) {
      assert.deepEqual(closedIn(text), [], `${name} of the card has no closed value`);
    }
    assert.ok(cardLd.length === 1 && cardPayload.length > 0);
    const cardGraph = JSON.parse(cardLd[0])['@graph'];
    const cardDataset = cardGraph.find(node => node['@type'] === 'Dataset');
    assert.deepEqual(cardDataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-library-card' });
    // The card page is rendered per request; the order of the resource hints in `<head>` may differ between two renders
    // (the first one preloads more), so the documents are compared without their `<link>` tags.
    const withoutHints = html => html.replace(/<link [^>]*>/g, '');
    assert.equal(withoutHints((await get(cardPath, { 'User-Agent': ROBOT_UA })).html), withoutHints(card.html), 'a robot gets the same card HTML');

    // Ten facts without statistics (a minion below the sample) are still indexable; a spell (four facts) is noindex without JSON-LD.
    const noStats = await get(`/library/minions/${slug('Без выборки')}-1004/`);
    assert.match(noStats.html, /<meta name="robots" content="index, follow/);
    assert.doesNotMatch(noStats.html, /<h2 id="card-stats-title">/);
    const spell = await get(`/library/spells/${slug('Заклинание')}-3001/`);
    assert.equal(spell.status, 200);
    assert.match(spell.html, /<meta name="robots" content="noindex, follow"/);
    assert.equal(jsonLdOf(spell.html).filter(text => text.includes('"@graph"')).length, 0, 'a page below the threshold has no entity JSON-LD');
    assert.ok(spell.html.includes('<dt>Уровень таверны</dt><dd>2</dd>'), 'but it still states its facts');
  } finally {
    await next.close();
    legacy.closeAllConnections();
    await new Promise(done => legacy.close(done));
  }
});

function rowsCount(html) {
  return [...html.matchAll(/<tr><th scope=row><a href="\/library\//g)].length;
}
