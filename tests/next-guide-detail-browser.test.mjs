import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const teaser = {
  slug: 'arena-100-percent', title: 'Арена 100% побед', description: 'Подробное описание',
  image: '/images/arena.png', publishedAt: '2026-07-10T12:00:00.000Z',
  kind: 'Гайды', kindSlug: 'guides', menuName: 'Арена',
  updatedAt: '2026-07-10T12:00:00.000Z',
  excerptHtml: '<p>Открытый текст гайда.</p><h2 id="guide-heading-1">Открытый раздел</h2><p>Продолжение открытого текста.</p>',
  toc: [{ id: 'guide-heading-1', text: 'Открытый раздел', level: 2 }, { id: 'guide-heading-2', text: 'Платный раздел', level: 2 }],
  hasPaid: true, indexable: true,
  contentHtml: 'PRIVATE_CONTENT', bodyText: 'PRIVATE_BODY', sourceUrl: 'PRIVATE_SOURCE',
};
// Fewer than 150 own words: out of the sitemap, noindex, and nothing is left behind a gate.
const shortTeaser = { ...teaser, slug: 'short-guide', excerptHtml: '<p>Короткий гайд целиком.</p>', toc: [], hasPaid: false, indexable: false };
const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));

test('Next guide detail renders an anonymous teaser, canonicalizes old IDs and returns real 404s', async () => {
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (['/api/guides-archive/teaser/arena-100-percent', '/api/guides-archive/teaser/1'].includes(pathname)) {
      response.end(JSON.stringify(teaser)); return;
    }
    if (pathname === '/api/guides-archive/teaser/short-guide') { response.end(JSON.stringify(shortTeaser)); return; }
    if (pathname.startsWith('/api/guides-archive/teaser/')) {
      response.writeHead(404).end('{"error":"missing"}'); return;
    }
    if (pathname === '/api/auth/me') {
      response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return;
    }
    if (isMenuBackgroundRead(pathname)) { response.end(JSON.stringify(MENU_PATCH_ARCHIVE)); return; }
    if (pathname.startsWith('/api/')) {
      response.writeHead(401).end('{"error":"guest"}'); return;
    }
    if (/\.(?:webp|png|jpg|jpeg)$/.test(pathname)) {
      response.setHeader('Content-Type', 'image/webp'); response.end(placeholder); return;
    }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, `Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = []; const failed = []; const protectedCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request)) failed.push(request.url()); });
    page.on('request', request => {
      if (/^\/api\/guides-archive\/(?!teaser\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
    });
    for (const [slug, width] of [['arena-100-percent', 1440], ['1', 390]]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}/guides-archive/${slug}/`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.evaluate(axe);
      const document = await page.evaluate(async () => ({
        html: document.documentElement.outerHTML,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        main: document.querySelectorAll('main').length,
        toc: [...document.querySelectorAll('.guide-archive-toc a')].map(node => node.textContent),
        tocTargets: [...document.querySelectorAll('.guide-archive-toc a')].map(node => Boolean(document.getElementById(node.getAttribute('href').slice(1)))),
        paidBlocks: document.querySelectorAll('.guide-archive-paid').length,
        author: document.querySelector('.guide-archive-detail-meta')?.textContent ?? '',
        overflow: document.documentElement.scrollWidth > innerWidth,
        accessibility: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(document.h1, ['Арена 100% побед']);
      assert.equal(document.main, 1);
      assert.equal(document.overflow, false);
      assert.deepEqual(document.accessibility, []);
      assert.equal(document.canonical, 'https://hearthpulse.net/guides-archive/arena-100-percent/');
      assert.equal(document.html.includes('PRIVATE_'), false);
      assert.match(document.html, /Открытый текст гайда\./, 'the open part is in the server HTML');
      assert.deepEqual(document.toc, ['Открытый раздел', 'Платный раздел']);
      assert.deepEqual(document.tocTargets, [true, true], 'every contents link has a target on the page');
      assert.equal(document.paidBlocks, 1);
      assert.ok(document.author.includes('HearthPulse'));
      // The continuation is a lock in place (the subscriber's page, not a banner): it opens the offer, no gate text.
      assert.equal(document.html.includes('Полный гайд доступен подписчикам'), false, 'no full-width gate instead of the text');
    }
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${origin}/guides-archive/arena-100-percent/`, { waitUntil: 'networkidle2' });
    const lock = await page.$('button ::-p-text(Продолжение гайда — по подписке)');
    assert.ok(lock, 'the lock stands where the text goes on');
    assert.equal(await page.$eval('.guide-archive-paid', node => Boolean(node.querySelector('button.guide-archive-lock'))), true);
    await page.evaluate(() => document.querySelector('button.guide-archive-lock').click());
    await page.waitForSelector('[data-testid="arena-paid-offer"]', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    // Robots and guests get the same document: the open part, the gate placeholder and the markup.
    for (const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'Mozilla/5.0 Chrome/130']) {
      const html = await (await fetch(`${origin}/guides-archive/arena-100-percent/`, { headers: { 'user-agent': agent } })).text();
      assert.match(html, /Открытый текст гайда\./);
      assert.match(html, /Автор: HearthPulse/);
      assert.match(html, /<meta name="robots" content="index, follow/);
      const ld = [...html.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")(?=[^>]*data-server-entity-jsonld)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => JSON.parse(match[1]));
      assert.equal(ld.length, 1);
      const [article, breadcrumb] = ld[0]['@graph'];
      assert.equal(article['@type'], 'Article');
      assert.equal(article.isAccessibleForFree, false);
      assert.deepEqual(article.author, { '@id': 'https://hearthpulse.net/#org' });
      assert.deepEqual(article.hasPart, [{ '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.guide-archive-paid' }]);
      assert.equal('articleBody' in article || 'wordCount' in article, false);
      assert.deepEqual(breadcrumb.itemListElement.map(item => item.name), ['Главная', 'Архив гайдов', 'Арена 100% побед']);
      assert.ok(html.includes('class="guide-archive-paid"'), 'the selector of the JSON-LD exists on the page');
    }
    // The flight payload carries the open part only.
    const flight = await (await fetch(`${origin}/guides-archive/arena-100-percent/`, { headers: { RSC: '1' } })).text();
    assert.equal(flight.includes('PRIVATE_'), false);
    const shortHtml = await (await fetch(`${origin}/guides-archive/short-guide/`)).text();
    assert.match(shortHtml, /<meta name="robots" content="noindex, follow"/);
    assert.equal(/application\/ld\+json" data-server-entity-jsonld/.test(shortHtml), false);
    assert.equal(shortHtml.includes('class="guide-archive-paid"'), false, 'no closed block, no gate');
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(protectedCalls, []);
    assert.equal((await page.goto(`${origin}/guides-archive/missing/`, { waitUntil: 'networkidle2' })).status(), 404);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});

test('archive reader keeps legacy section anchors visible and readable at desktop and mobile widths', async () => {
  const storybook = await startStorybookStatic();
  const browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 844 });
      await openStory(page, storybook.storyUrl('guides-measured-loading-geometry--reading-layout'));
      await page.waitForSelector('.guide-archive-reader a[href="#guide-section-mulligan"]');
      await page.click('.guide-archive-reader a[href="#guide-section-mulligan"]');
      const reading = await page.evaluate(() => {
        const reader = document.querySelector('.guide-archive-reader');
        const anchor = document.getElementById('guide-section-mulligan');
        const paragraphs = [...reader.querySelectorAll('p')].filter(node => node.textContent.includes('оставляйте'));
        const gaps = paragraphs.slice(1).map((node, i) => node.getBoundingClientRect().top - paragraphs[i].getBoundingClientRect().bottom);
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          anchorVisible: getComputedStyle(anchor).display !== 'none' && anchor.getClientRects().length > 0,
          anchorTop: anchor.getBoundingClientRect().top,
          textSize: parseFloat(getComputedStyle(reader).fontSize), gaps,
        };
      });
      assert.equal(reading.overflow, false, `overflow at ${width}px`);
      assert.equal(reading.anchorVisible, true, 'legacy empty anchors must remain scroll targets');
      assert.ok(reading.anchorTop >= 0 && reading.anchorTop < 844, 'TOC click reaches its section');
      assert.ok(reading.textSize >= 16, 'body text remains readable');
      assert.ok(reading.gaps.every(gap => gap >= 0 && gap <= 24), 'no decorative-image gaps between mulligan paragraphs');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await storybook.close();
  }
});

const reader = { id: 'reader-1', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const subscription = { hasAccess: true, entitlements: { arena: true, guidesArchive: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const FULL_TEXT = 'PAID_FULL_TEXT_ONLY_FOR_SUBSCRIBERS';
const cardsOf = count => Array.from({ length: count }, (_, index) => index + 1).map(id => ({ id, slug: `guide-${id}`, title: `Гайд номер ${id}`, description: `Описание ${id}`, image: null,
  publishedAt: '2026-07-10T12:00:00.000Z', menuName: 'Арена', menuCode: 'arena', kind: 'Гайды', kindSlug: 'guides', oldUrl: null }));
const listPageOf = count => ({ page: 1, limit: 18, total: count, totalPages: 1, items: cardsOf(count),
  filters: { kinds: [{ slug: 'guides', label: 'Гайды', count }], menus: [] } });
const listPage = listPageOf(3);

/** A Next server and gateway on a fixture of Express; `state` is changed by the test while the page lives. */
async function withStack(state, run) {
  const legacy = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const subscriber = /(?:^|;\s*)sm_session=reader/.test(request.headers.cookie ?? '');
    const json = (status, body) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    state.calls.push(url.pathname + url.search);
    if (url.pathname === '/api/auth/me') return json(200, { user: subscriber ? reader : null });
    if (url.pathname === '/api/subscription/status') return subscriber ? json(200, subscription) : json(401, { error: 'guest' });
    if (isMenuBackgroundRead(url.pathname)) return json(200, MENU_PATCH_ARCHIVE);
    if (url.pathname === '/api/guides-archive/public/list') {
      (state.listReads ??= []).push(request.headers['x-hearthpulse-prerender'] ?? '');
      return state.listDown ? json(503, { error: 'down' }) : json(200, state.cardCount ? listPageOf(state.cardCount) : listPage);
    }
    if (url.pathname === '/api/guides-archive') return subscriber ? json(200, listPage) : json(401, { error: 'guest' });
    if (url.pathname.startsWith('/api/guides-archive/teaser/')) {
      const slug = url.pathname.split('/').pop();
      state.teaserReads[slug] = (state.teaserReads[slug] ?? 0) + 1;
      if (state.teaserDown(slug, state.teaserReads[slug])) return json(503, { error: 'down' });
      return json(200, { ...teaser, slug, contentHtml: 'PRIVATE_CONTENT' });
    }
    if (url.pathname.startsWith('/api/guides-archive/')) {
      if (!subscriber) return json(401, { error: 'guest' });
      return state.fullDown ? json(503, { error: 'down' }) : setTimeout(() => json(200, { ...teaser, id: 1, menuCode: 'arena', kindSlug: 'guides', oldUrl: null,
        keywords: null, replyCount: 0, fallbackText: '', sourceUrl: null,
        contentHtml: `${teaser.excerptHtml}<h2 id="guide-heading-2">Платный раздел</h2><p>${FULL_TEXT}</p>` }), 300);
    }
    if (/\.(?:webp|png|jpg|jpeg)$/.test(url.pathname)) { response.setHeader('Content-Type', 'image/webp'); return response.end(placeholder); }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin,
      NODE_OPTIONS: `--require=${fileURLToPath(new URL('./helpers/shiftableClock.cjs', import.meta.url))}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200 && !ready; attempt++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (!ready) await delay(50);
    }
    assert.ok(ready, `Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    await run({ origin, browser, nextOrigin, shiftClock: () => process.kill(child.pid, 'SIGUSR2') });
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
}

async function openPage(browser, origin, path, { subscriber = false, width = 1440 } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/status of 503/.test(message.text())) errors.push(message.text()); });
  await page.setViewport({ width, height: 900 });
  if (subscriber) await page.setCookie({ name: 'sm_session', value: 'reader', url: origin });
  await page.evaluateOnNewDocument(() => {
    window.__shifts = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
      .observe({ type: 'layout-shift', buffered: true });
  });
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
  return { page, errors, response, context };
}

test('a subscriber gets the same guide page with the full text, and a failed full text keeps the open part and a retry', async () => {
  const state = { calls: [], teaserReads: {}, teaserDown: () => false, fullDown: false };
  await withStack(state, async ({ origin, browser }) => {
    for (const width of [1440, 390]) {
      const { page, errors, context } = await openPage(browser, origin, '/guides-archive/arena-100-percent/', { subscriber: true, width });
      // The header and the open text are the guest's own nodes: marked before the full text arrives, still the same after.
      await page.evaluate(() => {
        document.querySelector('.guide-archive-detail-header').dataset.mark = 'kept';
        document.querySelector('.guide-archive-excerpt')?.setAttribute('data-mark', 'excerpt');
      });
      await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 20_000 }, FULL_TEXT);
      assert.equal(await page.$eval('.guide-archive-detail-header', node => node.dataset.mark), 'kept', `${width}px: no remount`);
      assert.equal(await page.$('button.guide-archive-lock'), null, 'the subscriber has no lock');
      assert.equal(await page.$('[data-app-error]'), null);
      assert.ok(await page.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0)) < 0.01, `${width}px: CLS`);
      assert.deepEqual(errors, []);
      await context.close();
    }
    // The full request fails: the open part stays, the message has «Повторить»; after it the text comes.
    state.fullDown = true;
    const { page, errors, context } = await openPage(browser, origin, '/guides-archive/arena-100-percent/', { subscriber: true });
    await page.waitForSelector('[role="alert"]', { timeout: 20_000 });
    assert.match(await page.evaluate(() => document.body.innerText), /Открытый текст гайда\./, 'the open part stays');
    assert.equal(await page.evaluate(text => document.body.innerText.includes(text), FULL_TEXT), false);
    state.fullDown = false;
    await page.evaluate(() => [...document.querySelectorAll('[role="alert"] button')].find(node => node.textContent.trim() === 'Повторить').click());
    await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 20_000 }, FULL_TEXT);
    assert.equal(await page.$('[role="alert"]'), null);
    assert.deepEqual(errors, []);
    await context.close();
  });
});

test('the archive list is the same for a guest, a robot and a subscriber; Express hiccups never make a 500', async () => {
  const state = { calls: [], teaserReads: {}, teaserDown: slug => slug === 'flaky' ? state.teaserReads[slug] === 1 : slug === 'gone' ? state.allDown : false,
    fullDown: false, allDown: false };
  await withStack(state, async ({ origin, browser, shiftClock }) => {
    // The copy made at build time has no list (no Express then): the page is regenerated after its five minutes.
    // Server HTML: the cards and the filter are there before any script runs.
    let html = '';
    for (let attempt = 0; attempt < 40 && !html.includes('Гайд номер 1'); attempt++) {
      shiftClock();
      html = await (await fetch(`${origin}/guides-archive/`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } })).text();
      if (!html.includes('Гайд номер 1')) await delay(250);
    }
    for (const text of ['Гайд номер 1', 'Гайд номер 3', 'Описание 2', 'Гайды']) assert.ok(html.includes(text), text);
    assert.equal(html.includes('Архив гайдов доступен подписчикам'), false, 'no gate instead of the list');
    assert.equal(/PRIVATE_|PAID_/.test(html), false);
    for (const subscriber of [false, true]) {
      state.calls.length = 0;
      const { page, errors, context } = await openPage(browser, origin, '/guides-archive/', { subscriber });
      assert.equal(await page.$$eval('a.guide-archive-card', cards => cards.length), 3, `subscriber=${subscriber}: three cards`);
      assert.ok(await page.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0)) < 0.01, 'CLS');
      assert.equal(state.calls.some(call => call.startsWith('/api/guides-archive?') || call.startsWith('/api/guides-archive/public/list')), false,
        'the first page is not asked for again');
      await page.type('.guide-archive-search input', 'гайд');
      await page.click('.guide-archive-search button');
      await page.waitForNetworkIdle({ idleTime: 300, timeout: 10_000 }).catch(() => undefined);
      const asked = state.calls.filter(call => call.includes('q=')).join();
      assert.match(asked, subscriber ? /\/api\/guides-archive\?/ : /\/api\/guides-archive\/public\/list\?/);
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Express answers 503 once: a second try gives the page.
    const flaky = await fetch(`${origin}/guides-archive/flaky/`);
    assert.equal(flaky.status, 200);
    assert.ok((await flaky.text()).includes('Открытый текст гайда.'));
    assert.equal(state.teaserReads.flaky, 2);
    // Express is gone: the last good copy of a guide seen before; a guide never seen says so, without a 500 and without index.
    state.teaserDown = () => true;
    const copy = await fetch(`${origin}/guides-archive/flaky/`);
    assert.equal(copy.status, 200);
    assert.ok((await copy.text()).includes('Открытый текст гайда.'), 'the last good copy');
    const unseen = await fetch(`${origin}/guides-archive/never-seen/`);
    const unseenHtml = await unseen.text();
    assert.equal(unseen.status, 200);
    assert.match(unseenHtml, /Гайд временно недоступен/);
    assert.match(unseenHtml, /<meta name="robots" content="noindex, nofollow"/);
  });
});

test('the deploy warm-up replaces the skeletons of /guides-archive/ with 18 cards, and a down source keeps the earlier copy', async () => {
  const state = { calls: [], teaserReads: {}, teaserDown: () => false, fullDown: false, listDown: true, cardCount: 18 };
  await withStack(state, async ({ origin, nextOrigin, shiftClock }) => {
    const html = async () => (await fetch(`${origin}/guides-archive/`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } })).text();
    const count = (text, token) => text.split(token).length - 1;
    const revalidate = async () => (await fetch(`${nextOrigin}/health/next/revalidate/`, { method: 'POST' })).json();
    // The build copy has no Express: skeletons and no card.
    const build = await html();
    assert.equal(count(build, 'guide-archive-card-skeleton'), 18);
    assert.equal(count(build, 'guide-archive-card-meta'), 0);
    // The source is down: the page is not marked stale, and a regeneration without data does not replace the copy or fail.
    const skipped = await revalidate();
    assert.ok(skipped.skipped.some(entry => entry.path === '/guides-archive'), JSON.stringify(skipped));
    assert.equal(skipped.revalidated.includes('/guides-archive'), false);
    for (let attempt = 0; attempt < 3; attempt++) { shiftClock(); assert.equal((await fetch(`${origin}/guides-archive/`)).status, 200); await delay(200); }
    // The source answers: the warm-up marks the page stale and the next requests print the cards.
    state.listDown = false;
    assert.ok((await revalidate()).revalidated.includes('/guides-archive'));
    let after = '';
    for (let attempt = 0; attempt < 40 && count(after, 'guide-archive-card-meta') === 0; attempt++) { shiftClock(); after = await html(); await delay(250); }
    assert.equal(count(after, 'guide-archive-card-meta'), 18, 'the HTML after the deploy has 18 cards');
    assert.equal(count(after, 'guide-archive-card-skeleton'), 0, 'no skeletons');
    assert.ok(state.listReads.every(value => value === '1'), 'every read of the page and its probe asks for fresh data only');
    // The source goes down again: the regeneration throws and the cards stay.
    state.listDown = true;
    for (let attempt = 0; attempt < 4; attempt++) { shiftClock(); assert.equal(count(await html(), 'guide-archive-card-meta'), 18); await delay(250); }
  });
});
