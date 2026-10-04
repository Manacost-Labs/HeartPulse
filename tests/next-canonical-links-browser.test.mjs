import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { qaSessionCookie } from '../scripts/qa/mockApi.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// Each route names a link its content must render, so a page that lost its
// fixture data (and with it the links under test) fails instead of passing empty.
const GUEST_ROUTES = [
  ['/', '.arena-content a[href^="/tierlist"]'],
  ['/tierlist/', '.arena-content a[href^="/classes"]'],
  ['/classes/', '.arena-content a[href^="/legendaries"]'],
  ['/legendaries/', '.arena-content a[href^="/classes"]'],
  ['/standard/cards/', '.arena-content a[href^="/standard/cards/standard/"]'],
  ['/standard/cards/standard/CARD_QA_1/', '.constructed-card-detail__breadcrumb a'],
  ['/standard/archetypes/', '.arena-content a[href^="/standard/archetypes/standard/"]'],
  ['/standard/meta/', '.arena-content a[href^="/standard/archetypes/standard/"]'],
  ['/cosmetics/', '.arena-content a[href^="/cosmetics/coins"]'],
  ['/battlegrounds/tier-list/', '.arena-content a[href^="/library"]'],
  ['/articles/', '.arena-content a[href]'],
  ['/no-such-page/', '.arena-content a[href^="/articles"]'],
];
// Battlegrounds and the guides archive list their entries only for subscribers.
const SUBSCRIBER_ROUTES = [
  ['/heroes/', '.arena-content a[href^="/heroes/"]'],
  ['/library/', '.arena-content a[data-library-card-tile]'],
  ['/guides-archive/', '.arena-content a.guide-archive-card'],
  ['/tierlist/', '.arena-content a[href^="/legendaries"]'],
];

/**
 * A page URL without its trailing slash answers with an uncached 301 and never
 * matches the prerender rule. In-page (`#…`) and query-only (`?…`) links stay
 * on the current page; `/api/`, `/_next/` and files keep their own URLs.
 */
function slashlessPageHrefs(hrefs, pageUrl) {
  const { origin } = new URL(pageUrl);
  return [...new Set(hrefs)].filter(href => {
    if (!href || href.startsWith('#') || href.startsWith('?')) return false;
    const { origin: target, pathname } = new URL(href, pageUrl);
    return target === origin && !pathname.endsWith('/') && !/^\/(api|_next)\//.test(pathname)
      && !/\.[^/]*$/.test(pathname);
  });
}

// What crawlers, no-JS visitors and clicks before hydration follow.
function serverAnchorHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
}

// Reads every link of each route twice: in the server HTML and after hydration.
async function collectSlashless(page, origin, routes, cookie = '') {
  const found = {};
  for (const [route, contentLink] of routes) {
    const url = `${origin}${route}`;
    const html = await fetch(url, { headers: cookie ? { cookie } : {} }).then(response => response.text());
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForSelector(contentLink, { timeout: 15_000 })
      .catch(() => assert.fail(`${route} rendered no ${contentLink}; its fixture data did not load`));
    const hydrated = await page.$$eval('a[href]', anchors => anchors.map(anchor => anchor.getAttribute('href')));
    const slashless = slashlessPageHrefs([...serverAnchorHrefs(html), ...hydrated], url);
    if (slashless.length) found[route] = slashless;
  }
  return found;
}

// Records the requests the browser makes ahead of a visit.
async function startSpeculationRecorder(runtimeOrigin) {
  const speculative = [];
  const upstream = new URL(runtimeOrigin);
  const server = http.createServer((request, response) => {
    if (request.headers['sec-purpose']) speculative.push(request.url);
    const forwarded = http.request(upstream, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    forwarded.on('error', () => response.writeHead(502).end());
    request.pipe(forwarded);
  });
  return { server, origin: await listenLocal(server), speculative };
}

// An activated prerender replaces the page's frame, which a pending
// `waitForFunction` does not follow; separate evaluations do.
async function arrival(page, pathname) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const state = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0];
      return { pathname: location.pathname, loaded: document.readyState === 'complete',
        redirects: entry.redirectCount, prerendered: entry.activationStart > 0 };
    }).catch(() => null);
    if (state?.pathname === pathname && state.loaded) return { redirects: state.redirects, prerendered: state.prerendered };
    assert.ok(Date.now() < deadline, `${pathname} did not open; last state: ${JSON.stringify(state)}`);
    await delay(50);
  }
}

test('pages link to canonical trailing-slash URLs, so a card link is fetched when pressed', async () => {
  const runtime = await startQaNextRuntime();
  let recorder;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, defaultViewport: null, args: ['--no-sandbox', '--window-size=1440,900'] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const subscriberContext = await browser.createBrowserContext();
    const subscriberPage = await subscriberContext.newPage();
    subscriberPage.on('pageerror', error => pageErrors.push(error.message));
    const cookie = qaSessionCookie();
    const [name, value] = cookie.split('=');
    await subscriberPage.setCookie({ name, value, url: runtime.origin });

    const found = {
      guest: await collectSlashless(page, runtime.origin, GUEST_ROUTES),
      subscriber: await collectSlashless(subscriberPage, runtime.origin, SUBSCRIBER_ROUTES, cookie),
    };
    assert.deepEqual(found, { guest: {}, subscriber: {} },
      'page links must not point at URLs that only redirect to their trailing-slash form');
    assert.deepEqual(pageErrors, []);

    // Dark gifts and timewarped cards have no archive: the greyed-out control
    // is not a link, or hovering it would prerender the archive's 404.
    for (const section of ['dark-gifts', 'timewarped']) {
      await subscriberPage.goto(`${runtime.origin}/library/${section}/`, { waitUntil: 'networkidle0' });
      assert.deepEqual(await subscriberPage.$$eval('.arena-content [aria-disabled="true"]', nodes => nodes
        .map(node => ({ text: node.textContent.trim(), href: node.getAttribute('href'), role: node.getAttribute('role') }))),
      [{ text: 'Архив', href: null, role: 'link' }], `/library/${section}/ offers no archive`);
      assert.equal(await subscriberPage.$(`a[href^="/library/archive/${section}"]`), null);
    }

    // The catalog's card links are the densest set; with the slash they match
    // the prerender rule, and the click handler opens that same URL.
    recorder = await startSpeculationRecorder(runtime.origin);
    await page.goto(`${recorder.origin}/standard/cards/`, { waitUntil: 'networkidle0' });
    const card = '.arena-content a[href^="/standard/cards/standard/"]';
    const href = await page.$eval(card, anchor => anchor.getAttribute('href'));
    assert.match(href, /^\/standard\/cards\/standard\/[^/?#]+\/$/);
    recorder.speculative.length = 0;
    await page.hover(card);
    await delay(600);
    assert.deepEqual(recorder.speculative, [], 'hovering a card in the grid prerenders nothing');
    // A press fetches the card page's HTML (no prerender, so no /api calls),
    // and the release opens that page from the prefetched response.
    await page.mouse.down();
    const deadline = Date.now() + 15_000;
    while (!recorder.speculative.includes(href)) {
      assert.ok(Date.now() < deadline, `${href} was not prefetched; speculative requests: ${recorder.speculative}`);
      await delay(50);
    }
    await delay(500);
    await page.mouse.up();
    assert.ok(recorder.speculative.every(url => !url.startsWith('/api/')), 'a press fetches no data ahead of the visit');
    assert.deepEqual(await arrival(page, href), { redirects: 0, prerendered: false });
  } finally {
    await browser?.close();
    if (recorder) await closeLocal(recorder.server);
    await runtime.close();
  }
});
