import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { hasMarker } from '../scripts/lib/post-deploy-data-pages.mjs';
import { createTierlistRouter } from '../server/tierlistRoutes.ts';
import { buildTierlistFixture } from './helpers/tierlistPublicFixture.ts';

// The class pages of the Arena tier list (#617) against an Express that serves the real open projection of the
// fixture pool: `/tierlist/<class>/` has every card of its class in the server HTML and no card of another
// class, its title and description (its record in the SEO registry) carry the data date and the sample the page
// prints, it is indexable with a canonical of its own and its JSON-LD (#668), and an unknown class is a 404. `/tierlist/` links each class to its
// page. The Next server's clock is fixed (`tests/helpers/fixedClock.cjs`), so the dates read the same any day.

const CLOCK_AT = '2027-03-10T09:00:00.000Z';
// 15:00 in Moscow on 9 March: the day before the clock, so the month is in the title.
const UPDATED_AT = '2027-03-09T12:00:00.000Z';

// `state.down`: the open projection fails (Express without a copy). A new `state.generation` builds a new router,
// so no answer of an earlier generation is cached in Express.
function startLegacy(state = { down: false, generation: 0 }) {
  const app = express();
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  let router = null; let builtFor = -1;
  const build = () => createTierlistRouter({
    accessGuard: (_request, response) => { response.status(403).json({ error: 'subscription required' }); },
    cache: new Map(),
    resolveSource: () => 'hsreplay',
    getData: async () => {
      if (state.down) throw new Error('origin down');
      return { data: { ...buildTierlistFixture(), updatedAt: UPDATED_AT }, etag: '"fixture"', cacheSource: 'origin' };
    },
    present: data => ({ ...data, classPositions: {} }),
    loadFallback: () => null,
    onError: () => undefined,
  });
  app.use('/api', (request, response, next) => {
    if (builtFor !== state.generation) { router = build(); builtFor = state.generation; }
    return router(request, response, next);
  });
  return app.listen(0, '127.0.0.1');
}

const shownCards = html => [...html.matchAll(/aria-label="Открыть карту ([^"]+)"/g)].map(match => match[1]).sort();
const metaContent = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1] ?? null;
const title = html => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
const classLinks = html => [...html.matchAll(/<a href="\/tierlist\/([a-z-]+)\/"/g)].map(match => match[1]);
const canonical = html => html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null;
const jsonLdTypes = html => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
  .flatMap(match => JSON.parse(match[1])['@graph'] ?? []).map(node => node['@type']);
const INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

test('/tierlist/<class>/ renders its class whole on the server, with its own title, indexable with a canonical and JSON-LD', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const legacy = startLegacy();
  await once(legacy, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacy.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/fixedClock.cjs')}`, TEST_CLOCK_AT: CLOCK_AT } });
  try {
    const mage = await fetch(`${next.origin}/tierlist/mage/`);
    assert.equal(mage.status, 200);
    const mageHtml = await mage.text();
    assert.deepEqual(shownCards(mageHtml), ['Карта mage-0', 'Карта mage-1', 'Карта mage-2', 'Карта mage-3', 'Карта mage-4',
      'Карта mage-5', 'Карта mage-6', 'Карта mage-7', 'Карта mage-s0', 'Карта mage-s1'], 'every mage card, and only those');
    assert.equal(title(mageHtml), 'Тир-лист Арены Hearthstone (хс): Маг, март 2027');
    assert.equal(metaContent(mageHtml, 'description'), 'Маг: тир-лист карт Арены Hearthstone на 9 марта 2027. '
      + 'Тир, винрейт и частота выбора каждой карты, более 980 000 игр. Данные HSReplay.');
    // The page prints the same sample with a no-break space (the description has a plain one).
    assert.match(mageHtml, /по данным более 980\u00a0000 игр/, 'the sample of the description is printed on the page');
    assert.equal(metaContent(mageHtml, 'robots'), INDEXABLE);
    assert.equal(canonical(mageHtml), 'https://hearthpulse.net/tierlist/mage/');
    // Share tags of a registry page (#668), with the Arena preview.
    assert.equal(mageHtml.match(/<meta property="og:url" content="([^"]*)"/)?.[1], 'https://hearthpulse.net/tierlist/mage/');
    assert.equal(mageHtml.match(/<meta property="og:title" content="([^"]*)"/)?.[1], 'Тир-лист Арены Hearthstone (хс): Маг, март 2027');
    assert.equal(mageHtml.match(/<meta name="twitter:description" content="([^"]*)"/)?.[1], metaContent(mageHtml, 'description'));
    assert.match(mageHtml, /<meta property="og:image" content="https:\/\/hearthpulse\.net\/assets\/og\/hearthpulse-arena\.png\?v=\d{8}"\/>/);
    assert.equal(mageHtml.match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1], 'HearthPulse — тир-лист Арены: Маг');
    assert.equal((mageHtml.match(/<h1[\s>]/g) ?? []).length, 1, 'one H1');
    assert.deepEqual(jsonLdTypes(mageHtml), ['Organization', 'BreadcrumbList', 'CollectionPage', 'Dataset']);
    // The closed part the Dataset names is on the page, and the deploy warm-up finds its marker.
    assert.match(mageHtml, /class="[^"]*paywalled-tierlist/);
    assert.equal(hasMarker(mageHtml, 'hs-tier-card'), true, 'the warm-up marker of a class page');
    // The class choice links every class to its page; the page's own class is the current one.
    assert.deepEqual(classLinks(mageHtml), ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest',
      'rogue', 'shaman', 'warlock', 'warrior', 'neutral']);
    assert.match(mageHtml, /<a href="\/tierlist\/mage\/" aria-label="Класс mage" title="Класс mage" aria-current="page">/);

    const neutral = await fetch(`${next.origin}/tierlist/neutral/`);
    assert.equal(neutral.status, 200);
    const neutralHtml = await neutral.text();
    assert.deepEqual(shownCards(neutralHtml), ['Карта any-b0', 'Карта any-s0'], 'the neutral cards, and only those');
    assert.equal(title(neutralHtml), 'Нейтральные карты Арены Hearthstone: тир-лист, март 2027');
    assert.equal(metaContent(neutralHtml, 'description'), 'Нейтральные карты Арены Hearthstone на 9 марта 2027: '
      + 'тир, винрейт и частота выбора каждой карты, более 980 000 игр. Данные HSReplay.');
    assert.equal(metaContent(neutralHtml, 'robots'), INDEXABLE);
    assert.equal(canonical(neutralHtml), 'https://hearthpulse.net/tierlist/neutral/');

    for (const slug of ['unknown', 'any', 'Mage']) {
      const missing = await fetch(`${next.origin}/tierlist/${slug}/`);
      assert.equal(missing.status, 404, `/tierlist/${slug}/ is no class page`);
      assert.match(await missing.text(), /<meta name="robots" content="noindex/, `/tierlist/${slug}/ is not indexed`);
    }

    // `/tierlist/` (its build copy has no cards; the fixed clock makes it stale, so a request regenerates it).
    let hub = '';
    for (let attempt = 0; attempt < 40 && !hub.includes('Карта mage-s0'); attempt += 1) {
      if (attempt > 0) await delay(250);
      const response = await fetch(`${next.origin}/tierlist/`);
      assert.equal(response.status, 200);
      hub = await response.text();
    }
    assert.ok(hub.includes('Карта mage-s0'), 'the tier list was regenerated with the fixture pool');
    assert.deepEqual(classLinks(hub), ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest',
      'rogue', 'shaman', 'warlock', 'warrior', 'neutral'], 'the class choice of /tierlist/ links each class page');
  } finally {
    await next.close();
    legacy.closeAllConnections();
    legacy.close();
  }
});

// GPT review of #657: a class page never trades a full copy for one without cards. A regeneration while the source
// is down keeps the earlier copy; a first request while it is down is an error (noindex), not a cached empty page,
// and the page has its cards again once the source is back.
test('a class page keeps its last full copy while the source is down, and a cold request recovers with the source', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { down: false, generation: 0 };
  const legacy = startLegacy(state);
  await once(legacy, 'listening');
  const legacyOrigin = `http://127.0.0.1:${legacy.address().port}`;
  const shiftable = { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` };
  const warm = await startNextServer({ legacyOrigin, env: shiftable });
  let cold = null;
  try {
    const full = await fetch(`${warm.origin}/tierlist/mage/`);
    assert.equal(full.status, 200);
    assert.ok((await full.text()).includes('Карта mage-s0'), 'the first copy has the mage cards');

    state.down = true;
    state.generation = 1;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // Every SIGUSR2 moves the server's clock an hour on: the copy is stale and the request regenerates it.
      process.kill(warm.pid, 'SIGUSR2');
      const kept = await fetch(`${warm.origin}/tierlist/mage/`);
      assert.equal(kept.status, 200, `no error while a full copy exists: ${warm.output().slice(-300)}`);
      assert.ok((await kept.text()).includes('Карта mage-s0'), 'the last full copy stays while the source is down');
      await delay(300);
    }

    // A server that never had the page (a restart while the source is down).
    cold = await startNextServer({ legacyOrigin, env: shiftable });
    const failed = await fetch(`${cold.origin}/tierlist/warrior/`);
    assert.equal(failed.status, 500, 'no page without cards is published');
    const failedHtml = await failed.text();
    assert.doesNotMatch(failedHtml, /Открыть карту/);
    assert.match(failedHtml, /<meta name="robots" content="noindex/, 'the error is not indexed');

    state.down = false;
    state.generation = 2;
    let recovered = null;
    for (let attempt = 0; attempt < 40 && recovered?.status !== 200; attempt += 1) {
      if (attempt > 0) await delay(250);
      recovered = await fetch(`${cold.origin}/tierlist/warrior/`);
      if (recovered.status !== 200) await recovered.text();
    }
    assert.equal(recovered.status, 200, 'the page renders once the source is back');
    assert.ok((await recovered.text()).includes('Карта warrior-0'), 'with the warrior cards');
  } finally {
    if (cold) await cold.close();
    await warm.close();
    legacy.closeAllConnections();
    legacy.close();
  }
});
