import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { SENTINELS, openAnswer, protectedAnswer } from './helpers/legendariesOpenLayerFixture.ts';

// The built /legendaries/ page against an Express stub: a guest and both robots get the same HTML with the
// real groups (names, companions, class, winrate, pick rate, sample, source, date), and no paid value is in
// the HTML, the RSC payload or the JSON-LD, even when the stub's public answer carries sentinels by mistake
// and the protected route answers with them. Without a snapshot the page says «temporarily unavailable».

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const YANDEXBOT_UA = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.get('/api/legendaries/public', (_request, response) => {
    if (state.down) return response.status(503).set('Retry-After', '60').json({ error: 'no snapshot' });
    return response.json(openAnswer({ noise: true, warning: state.warning }));
  });
  // Nobody is a subscriber here; the page must not even ask for it on the server.
  app.get('/api/legendaries', (_request, response) => response.status(401).json(protectedAnswer()));
  return app;
}

const guestHtml = async (origin, headers = {}) => {
  const response = await fetch(`${origin}/legendaries/`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};

test('the guest HTML of /legendaries/ carries the open groups and no paid value', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: true, warning: undefined };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // /legendaries/ is a five-minute ISR page: move the server's clock past that window and request until
  // the regenerated copy (stale-while-revalidate: the first answer is the old one) satisfies `ready`.
  const regenerated = async (ready, phase, headers = { 'User-Agent': BROWSER_UA }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await guestHtml(next.origin, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`the page was not regenerated: ${phase}; reads ${JSON.stringify(state.reads.map(read => read.path))}; ${next.output().slice(-300)}`);
  };
  const hasGroups = html => html.includes('legendary-group-card');
  try {
    // No snapshot: a 200 page with a «temporarily unavailable» message, never an empty table.
    const unavailable = await regenerated(html => html.includes('Данные временно недоступны'), 'unavailable message');
    assert.equal(hasGroups(unavailable), false);
    assert.doesNotMatch(unavailable, /0 групп/, 'no snapshot is not «0 groups»');
    assert.match(unavailable, /class="seo-page-intro"/, 'the page text stays');

    state.down = false;
    const raw = await regenerated(hasGroups, 'groups appear');
    const html = raw.replaceAll('<!-- -->', '');
    for (const name of ['Ярость Альфа', 'Бета Властелин', 'Гамма Страж', 'Спутник Первый', 'Спутник Третий']) {
      assert.ok(html.includes(name), `${name} is in the server HTML`);
    }
    assert.match(html, /61\.4%/, 'winrate');
    assert.match(html, /Выборка: 4\s210 игр/, 'sample');
    assert.match(html, /Источник: HSReplay/, 'source');
    assert.match(html, /<time dateTime="2026-11-18T09:30:00\.000Z">18\.11\.2026 12:30 МСК<\/time>/, 'date');
    assert.ok(html.includes('Частота предложения') && html.includes('Оценка ArenaSmith'), 'the paid columns are named');
    assert.match(html, /class="paywalled-legendaries/, 'the closed cells have the class the JSON-LD names');
    assert.equal((html.match(/data-rank="/g) ?? []).length, 3, 'three ranked cards');
    assert.doesNotMatch(html, /arena-paywall/, 'no gate over the page');

    // Nothing paid in the HTML, the RSC payload and the JSON-LD: each is checked on its own.
    const payload = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
    for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
      assert.deepEqual(SENTINELS.filter(value => text.includes(value)), [], `${name} has no sentinel`);
      assert.doesNotMatch(text, /futureMetric|55\.555|arenaSmithTier/, `${name} has no unlisted field`);
    }
    const dataset = JSON.parse(jsonLd.find(text => text.includes('Dataset')))['@graph'].find(node => node['@type'] === 'Dataset');
    assert.equal(dataset.isAccessibleForFree, false);
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-legendaries' });
    assert.equal(dataset.dateModified, '2026-11-18T09:30:00.000Z', 'dated by the data the page prints');

    // The server reads only the open projection, anonymously.
    const reads = state.reads.filter(read => read.path.startsWith('/api/legendaries'));
    assert.ok(reads.length > 0 && reads.every(read => read.path === '/api/legendaries/public?source=hsreplay'), `only the open projection is read: ${JSON.stringify(reads)}`);
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A browser, Googlebot and YandexBot get the same document.
    // One at a time, after the copy is warm: a regeneration in flight would make two answers differ for a reason that is not the user agent.
    await guestHtml(next.origin, { 'User-Agent': BROWSER_UA });
    const browser = await guestHtml(next.origin, { 'User-Agent': BROWSER_UA });
    const google = await guestHtml(next.origin, { 'User-Agent': GOOGLEBOT_UA });
    const yandex = await guestHtml(next.origin, { 'User-Agent': YANDEXBOT_UA });
    assert.equal(google, browser, 'Googlebot gets the guest HTML');
    assert.equal(yandex, browser, 'YandexBot gets the guest HTML');

    // Express fell back to its last snapshot: the page shows it with its date.
    state.warning = 'stale';
    const stale = (await regenerated(page => page.includes('последний сохранённый снимок'), 'stale snapshot notice')).replaceAll('<!-- -->', '');
    assert.match(stale, /последний сохранённый снимок от 18\.11\.2026 12:30 МСК/);
    assert.ok(hasGroups(stale));
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
