import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundBuildsRouter } from '../server/battlegroundBuildsPublicRoutes.ts';
import { buildSourcePayload, BUILD_COUNT, closedValues, OPEN_BUILDS, sourceOf } from './helpers/battlegroundBuildsFixture.ts';

// The built /battlegrounds/tier-list/ and /battlegrounds/strategies/ against an Express that serves the real
// open-builds projection: a guest and a robot get the same HTML with every build of the base slice by tier, the
// ItemList equals the printed list, and no closed value is in the HTML, the RSC payload (`self.__next_f`) or the
// JSON-LD. The strategies page prints its open list (title, facts, conditions, key minions, example board, link to
// the builder); the tier list prints the subscriber's view on the open builds (strategy cards with the framed key
// minions and the example board, the other lists locked). A failing Express never turns a page with builds into an
// empty one.

const CLOSED = closedValues();
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const PAGES = [['/battlegrounds/tier-list/', 'compositions'], ['/battlegrounds/strategies/', 'strategies']];
const format = (value, digits) => value.toFixed(digits).replace('.', ',');

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  // `state.reset()` makes a new router: the last known copy of the old one is gone.
  const make = () => createBattlegroundBuildsRouter({
    loadSource: async list => {
      if (state.down) throw new Error('service down');
      const payload = buildSourcePayload(sourceOf(list));
      // More tier-S builds than a tier's first page (6): the tier list must still print every one of them.
      for (let index = 0; index < state.extraS; index += 1) {
        payload.tiers.S.push({ ...payload.tiers.S[0], key: `fx-s-extra-${index}`, title: `Сборка 0 hsreplay: вариант ${index}` });
      }
      return payload;
    },
    fallbackDir: null,
    onError: () => undefined,
  });
  let router = make();
  state.reset = () => { router = make(); };
  app.use('/api', (request, response, next) => router(request, response, next));
  return app;
}

const pageHtml = async (origin, path, headers = {}) => {
  const response = await fetch(`${origin}${path}`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};
const clean = html => html.replace(/<!-- -->/g, '');

/** The strategy cards of the tier list: tier, title, meta line, the key minions and the example board (framed renders). */
function strategyCardsOf(html) {
  const page = clean(html);
  const out = [];
  for (const section of page.matchAll(/<section class="bg-tierlist__tier" data-tier="([SABCD])"[^>]*>([\s\S]*?)<\/section>/g)) {
    for (const article of section[2].matchAll(/<article id="build-([^"]+)"[^>]*class="bg-tierlist-strategy"[^>]*>([\s\S]*?)<\/article>/g)) {
      const body = article[2];
      const group = label => [...(body.match(new RegExp(`<div class="bg-tierlist-strategy__group"><p>${label}</p>([\\s\\S]*?)</div></div>`))?.[1] ?? '')
        .matchAll(/<img src="([^"]+)" alt="([^"]+)"/g)].map(match => ({ src: match[1], alt: match[2] }));
      out.push({
        key: article[1], tier: section[1], title: body.match(/<h4>([^<]+)<\/h4>/)?.[1],
        meta: body.match(/<p class="bg-tierlist-strategy__meta">([^<]+)<\/p>/)?.[1] ?? null,
        core: group('Ключевые'), extra: group('Дополнительные'),
      });
    }
  }
  return out;
}

/** The articles of the page: tier of the section, title, facts, conditions, key minions, example board, builder link. */
function articlesOf(html) {
  const page = clean(html);
  const out = [];
  for (const section of page.matchAll(/<section id="tier-([sabcd])"[^>]*>([\s\S]*?)<\/section>/g)) {
    for (const article of section[2].matchAll(/<article id="build-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)) {
      const body = article[2];
      out.push({
        key: article[1], tier: section[1].toUpperCase(),
        title: body.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1],
        facts: body.match(/<p class="bg-builds-public__facts">([^<]+)<\/p>/)?.[1] ?? null,
        description: body.match(/<\/h3>(?:<p class="bg-builds-public__facts">[^<]*<\/p>)?<p>([^<]+)<\/p>/)?.[1],
        core: [...(body.match(/<ul class="bg-builds-public__minions"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '').matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1]),
        extra: body.match(/Пример стола дополняют: ([^<]+)\.<\/p>/)?.[1].split(', ') ?? [],
        builder: body.match(/<a class="bg-builds-public__builder" href="([^"]+)"/)?.[1],
      });
    }
  }
  return out;
}

/** The open list of /battlegrounds/strategies/: every build with its open figures, then the closed part. */
function checkStrategiesList(path, html, expected) {
  assert.equal(articlesOf(html).length, BUILD_COUNT, `${path}: every build is printed (${(clean(html).match(/<article id="[^"]+"/g) ?? []).join(' ')}; ${(clean(html).match(/<section id="[^"]+"/g) ?? []).join(' ')})`);
  assert.deepEqual(articlesOf(html), expected.map(item => ({
    key: item.key, tier: item.tier, title: item.title,
    facts: [item.archetype, `сложность: ${item.difficulty.toLowerCase()}`,
      item.avgPlacement === null ? null : `среднее место ${format(item.avgPlacement, 2)}`,
      item.popularity === null ? null : `популярность ${format(item.popularity, 1)}%`].filter(Boolean).join(' · '),
    description: item.description, core: item.core, extra: item.extra, builder: '/battlegrounds/tier-builder/',
  })), `${path}: the open figures of every build, by tier`);
  assert.match(clean(html), /Данные на <time dateTime="2026-11-19T06:00:17\.742Z">19 ноября 2026, 09:00 МСК<\/time> · источник (HSReplay|Firestone)/, 'date and source');
  assert.ok(html.indexOf('<h1') < html.indexOf('class="bg-builds-public"') && html.indexOf('class="bg-builds-public"') < html.indexOf('class="paywalled-builds"'),
    'the list stands after the H1 and before the closed part');
  assert.doesNotMatch(html, /arena-paywall-pending|class="arena-paywall"/, 'no placeholder or gate for a visitor of an open page');
  assert.match(html, /Подробнее по подписке/, 'the closed part is named');
}

/**
 * The tier list for a guest: the subscriber's view on the open builds. The strategies tab with the HSReplay source
 * is on, the other lists' tabs are locked in place (the closed part of the JSON-LD), every build is a strategy card
 * with its meta line and the framed key minions and example board, and the toolbar says how many, whence and when.
 */
function checkTierList(html, expected) {
  const page = clean(html);
  const cards = strategyCardsOf(html);
  assert.equal(cards.length, BUILD_COUNT, `every build is printed: ${(page.match(/<article id="[^"]+"/g) ?? []).join(' ')}`);
  const framed = name => ({ src: `/api/public-resource/db/uploads/framed/BG_SENT_${name.split(' ').at(-1)}.png`, alt: name });
  assert.deepEqual(cards, expected.map(item => ({
    key: item.key, tier: item.tier, title: item.title,
    meta: [item.archetype, item.avgPlacement === null ? null : `ср. место ${format(item.avgPlacement, 2)}`, item.difficulty.toLowerCase()]
      .filter(Boolean).join(' · '),
    core: item.core.map(framed), extra: item.extra.map(framed),
  })), 'the open builds as strategy cards, by tier');
  assert.match(page, /<button type="button" aria-pressed="true"[^>]*data-tour-id="bg-tier-list-strategy"[^>]*>Стратегии<\/button>/, 'the strategies tab is on');
  assert.match(page, /<button type="button" class="bg-tierlist-choice" aria-pressed="true">HSReplay<\/button>/, 'the HSReplay source is on');
  const locked = [...page.matchAll(/<button ([^>]*class="bg-tierlist-tab--locked paywalled-builds"[^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)]
    .map(([, attributes, body]) => ({ pressed: attributes.includes('aria-pressed="false"'), label: body.replace(/<svg[\s\S]*?<\/svg>/, '') }));
  assert.deepEqual(locked, ['Существа', 'Заклинания', 'Аксессуары'].map(label => ({ pressed: true, label: `${label}<span class="sr-only"> — по подписке</span>` })),
    'the other lists are locked in place');
  assert.match(page, /<p class="bg-tierlist-toolbar__meta" role="status">5 · HSReplay · 19\.11, 09:00 МСК<\/p>/, 'count, source and date (Moscow time)');
  const at = text => page.indexOf(text);
  assert.ok(at('<h1') > 0 && at('<h1') < at('class="bg-tierlist-tab--locked paywalled-builds"')
    && at('class="bg-tierlist-tab--locked paywalled-builds"') < at('class="bg-tierlist-strategy__cards"'),
    'the H1, then the toolbar with the locked lists, then the builds');
  assert.doesNotMatch(html, /arena-paywall-pending|class="arena-paywall"|bg-builds-public/, 'no placeholder, gate or old open list');
}

test('the guest HTML of both builds pages carries every open build and nothing closed', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: true, extraS: 0 };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // The tier list is a five-minute ISR page (the strategies page is rendered per request): move the server's clock past that window until the regenerated copy is served.
  const regenerated = async (path, ready, phase, headers = { 'User-Agent': BROWSER_UA, Cookie: 'session=guest-fixture' }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await pageHtml(next.origin, path, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`${path} was not regenerated: ${phase}; ${next.output().slice(-300)}`);
  };
  const hasBuilds = html => (html.includes('class="bg-builds-public"') || html.includes('bg-tierlist-strategy__cards')) && html.includes('id="build-');
  try {
    for (const [path] of PAGES) {
      const buildCopy = await pageHtml(next.origin, path);
      assert.equal(hasBuilds(buildCopy), false, `${path}: the copy made without Express has no builds but is a 200 page`);
      assert.match(buildCopy, /class="[^"]*paywalled-builds[^"]*"/);
      if (path.includes('tier-list')) assert.match(buildCopy, /Сборки временно недоступны/, 'the view says the builds are unavailable');
      // A page that has no list to show must not be indexed that way (the strategies page is rendered per request).
      if (path.includes('strategies')) assert.match(buildCopy, /<meta name="robots" content="noindex, follow"/, 'no data: noindex');
    }
    state.down = false;
    for (const [path, list] of PAGES) {
      const html = await regenerated(path, hasBuilds, 'builds appear');
      const expected = OPEN_BUILDS(list);
      if (path.includes('strategies')) assert.doesNotMatch(html, /<meta name="robots" content="noindex/, 'with data: indexable');
      if (path.includes('tier-list')) checkTierList(html, expected);
      else checkStrategiesList(path, html, expected);

      // Nothing closed in the HTML, in the RSC payload and in the JSON-LD: each is checked on its own.
      assert.match(html, /self\.__next_f/, 'the page carries an RSC payload');
      const payload = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
      const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
      assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
      for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
        assert.deepEqual(CLOSED.filter(value => text.includes(value)), [], `${path}: ${name} has no closed value`);
      }
      const graph = JSON.parse(jsonLd.find(text => text.includes('Dataset')))['@graph'];
      const dataset = graph.find(node => node['@type'] === 'Dataset');
      assert.equal(dataset.isAccessibleForFree, false);
      assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-builds' });
      const itemList = graph.find(node => node['@type'] === 'ItemList');
      assert.equal(itemList.numberOfItems, BUILD_COUNT);
      assert.deepEqual(itemList.itemListElement.map(item => ({ name: item.name, url: item.url })),
        (path.includes('tier-list') ? strategyCardsOf(html) : articlesOf(html))
          .map(item => ({ name: item.title, url: `https://hearthpulse.net${path}#build-${item.key}` })), 'the ItemList equals the printed list');
    }

    // The server reads the projection anonymously, one list per page.
    const reads = state.reads.filter(read => read.path.startsWith('/api/bg/'));
    assert.ok(reads.length > 0 && reads.every(read => /^\/api\/bg\/tier-lists\/public\?list=(compositions|strategies)$/.test(read.path)), 'only the open projection is read');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A robot and a guest get the same document, once the copies are stable.
    for (const [path] of PAGES) {
      let settled = await pageHtml(next.origin, path);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await delay(250);
        const again = await pageHtml(next.origin, path);
        if (again === settled) break;
        settled = again;
      }
      assert.equal(await pageHtml(next.origin, path, { 'User-Agent': ROBOT_UA }), await pageHtml(next.origin, path, { 'User-Agent': BROWSER_UA }),
        `${path}: the HTML does not depend on the user agent`);
    }

    // Tier S is printed whole in the server HTML, for a robot as for a person: the description names its builds
    // («тир S — …»), so every title of tier S is in an `<h4>` of a strategy card in the HTML without scripts.
    state.extraS = 7;
    state.reset();
    const leaders = await regenerated('/battlegrounds/tier-list/', html => html.includes('вариант 6'), 'nine tier-S builds');
    const tierS = [...OPEN_BUILDS('compositions').filter(item => item.tier === 'S').map(item => item.title),
      ...Array.from({ length: 7 }, (_, index) => `Сборка 0 hsreplay: вариант ${index}`)];
    for (const [agent, html] of [['browser', leaders], ['robot', await pageHtml(next.origin, '/battlegrounds/tier-list/', { 'User-Agent': ROBOT_UA })]]) {
      const printed = strategyCardsOf(html).filter(card => card.tier === 'S').map(card => card.title);
      assert.deepEqual(printed, tierS, `${agent}: every tier-S build is printed`);
      const description = clean(html).match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
      // The description names the tribes of tier S (the part of a title before «:»), the first three and «и другие».
      const named = description.match(/тир S — ([^.]+)\./)?.[1].replace(/ и другие$/, '').split(', ') ?? [];
      assert.ok(named.length > 0, `${agent}: the description names tier S: ${description}`);
      const tribes = new Set(printed.map(title => title.split(':')[0].trim()));
      for (const tribe of named) assert.ok(tribes.has(tribe), `${agent}: «${tribe}» from the description is in the HTML`);
    }
    state.extraS = 0;

    // The service fails: Express has no copy (503), yet a regeneration never turns the page into an empty one.
    state.reset();
    state.down = true;
    const before = state.reads.length;
    for (const [path] of PAGES) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        process.kill(next.pid, 'SIGUSR2');
        const html = await pageHtml(next.origin, path);
        assert.equal(hasBuilds(html), true, `${path}: the page keeps its builds while Express fails`);
        assert.doesNotMatch(html, /Сборки временно недоступны/);
        await delay(250);
      }
    }
    assert.ok(state.reads.length > before, 'the pages did try to regenerate (the scenario is real)');
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
