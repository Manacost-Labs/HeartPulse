import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createTierlistRouter } from '../server/tierlistRoutes.ts';
import { buildTierlistFixture } from './helpers/tierlistPublicFixture.ts';

// The class pages of the Arena tier list (#617) against an Express that serves the real open projection of the
// fixture pool: `/tierlist/<class>/` has every card of its class in the server HTML and no card of another
// class, its title and description carry the data date and the sample the page prints, it is `noindex, follow`
// with no canonical until SEO-A indexes it, and an unknown class is a 404. `/tierlist/` links each class to its
// page. The Next server's clock is fixed (`tests/helpers/fixedClock.cjs`), so the dates read the same any day.

const CLOCK_AT = '2027-03-10T09:00:00.000Z';
// 15:00 in Moscow on 9 March: the day before the clock, so the month is in the title.
const UPDATED_AT = '2027-03-09T12:00:00.000Z';

function startLegacy() {
  const app = express();
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.use('/api', createTierlistRouter({
    accessGuard: (_request, response) => { response.status(403).json({ error: 'subscription required' }); },
    cache: new Map(),
    resolveSource: () => 'hsreplay',
    getData: async () => ({ data: { ...buildTierlistFixture(), updatedAt: UPDATED_AT }, etag: '"fixture"', cacheSource: 'origin' }),
    present: data => ({ ...data, classPositions: {} }),
    loadFallback: () => null,
    onError: () => undefined,
  }));
  return app.listen(0, '127.0.0.1');
}

const shownCards = html => [...html.matchAll(/aria-label="Открыть карту ([^"]+)"/g)].map(match => match[1]).sort();
const metaContent = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1] ?? null;
const title = html => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
const classLinks = html => [...html.matchAll(/<a href="\/tierlist\/([a-z-]+)\/"/g)].map(match => match[1]);

test('/tierlist/<class>/ renders its class whole on the server, with its own title, noindex and no canonical', async () => {
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
    assert.equal(title(mageHtml), 'Тир-лист Арены Hearthstone: Маг, март 2027');
    assert.equal(metaContent(mageHtml, 'description'), 'Маг: тир-лист карт Арены Hearthstone на 9 марта 2027. '
      + 'Тир, винрейт и частота выбора каждой карты, более 980 000 игр. Данные HSReplay.');
    // The page prints the same sample with a no-break space (the description has a plain one).
    assert.match(mageHtml, /по данным более 980\u00a0000 игр/, 'the sample of the description is printed on the page');
    assert.equal(metaContent(mageHtml, 'robots'), 'noindex, follow');
    assert.doesNotMatch(mageHtml, /rel="canonical"/, 'no canonical while the page is noindex');
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
    assert.equal(metaContent(neutralHtml, 'robots'), 'noindex, follow');

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
    legacy.close();
  }
});
