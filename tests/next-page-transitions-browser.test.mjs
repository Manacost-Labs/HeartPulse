import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const SESSION_CHECK = '/api/auth/me';

// The static support pages and the guest tier list need no data; the shell's
// session check is the only API call, and it answers "signed out".
function signedOut(response) {
  response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"Unavailable"}');
}

// Stands where nginx does: pages go to Next.js and `/api/` is answered here.
// `speculative` lists what the browser requested ahead of a visit.
async function startGateway(nextOrigin) {
  const speculative = [];
  // The upstream host is fixed; only the path comes from the request.
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    if (request.headers['sec-purpose']) speculative.push(request.url);
    if (request.url.startsWith('/api/')) { signedOut(response); return; }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server), speculative };
}

// Mirrors how the browser reads a document rule: every `href_matches` string
// is a URL pattern resolved against the document URL.
function ruleMatches(where, href, base) {
  if (where.and) return where.and.every(clause => ruleMatches(clause, href, base));
  if (where.not) return !ruleMatches(where.not, href, base);
  return [where.href_matches].flat().some(pattern => new URLPattern(pattern, base).test(href));
}

// Chromium refuses to prerender under device emulation or an extra DevTools
// session, so pages keep the real window size instead of `setViewport`.
async function openPage(browser, url, reducedMotion = false) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(url, { waitUntil: 'networkidle2' });
  return { page, pageErrors };
}

// Hovering is the intent signal. The hidden page is ready once it has been
// requested as a prerender and its shell has run the session check.
async function hoverUntilPrerendered(page, gateway, selector, path) {
  gateway.speculative.length = 0;
  await page.hover(selector);
  const deadline = Date.now() + 15_000;
  while (!gateway.speculative.includes(path) || !gateway.speculative.includes(SESSION_CHECK)) {
    assert.ok(Date.now() < deadline, `${path} was not prerendered; speculative requests: ${gateway.speculative}`);
    await delay(50);
  }
}

// Session storage survives the document swap, so the outgoing page can report
// whether the browser started a view transition for this navigation.
async function reportOutgoingTransition(page) {
  await page.evaluate(() => addEventListener('pageswap', event => {
    sessionStorage.setItem('outgoing-transition', event.viewTransition ? 'animated' : 'instant');
  }));
}

// An activated prerender replaces the page's frame, which a pending
// `waitForFunction` does not follow; separate evaluations do.
async function arrival(page, pathname) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const state = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0];
      return { pathname: location.pathname, loaded: document.readyState === 'complete',
        redirects: entry.redirectCount, prerendered: entry.activationStart > 0,
        outgoingTransition: sessionStorage.getItem('outgoing-transition') };
    }).catch(() => null);
    if (state?.pathname === pathname && state.loaded) {
      return { redirects: state.redirects, prerendered: state.prerendered, outgoingTransition: state.outgoingTransition };
    }
    assert.ok(Date.now() < deadline, `${pathname} did not open; last state: ${JSON.stringify(state)}`);
    await delay(50);
  }
}

// Records, on the first frame of a document, which entrance animations its
// own elements run: `box` is the content box, `part` a child of the page's
// wrapper (its header or a section); `title` marks one that holds the `h1`.
async function recordEntrance(page) {
  await page.evaluateOnNewDocument(() => addEventListener('pagereveal', () => requestAnimationFrame(() => {
    const box = document.querySelector('.arena-content');
    sessionStorage.setItem('entrance', JSON.stringify(document.getAnimations()
      .filter(animation => !animation.effect?.pseudoElement && /^page-/.test(animation.animationName))
      .map(animation => {
        const target = animation.effect.target;
        const role = target === box ? 'box' : target.parentElement?.parentElement === box ? 'part' : 'other';
        const title = Boolean(target.matches('h1') || target.querySelector('h1'));
        return { name: animation.animationName, role, title, delay: animation.effect.getTiming().delay };
      })));
  })));
}

async function viewTransitionOptIn(page) {
  return page.evaluate(() => {
    const found = [];
    const visit = rules => {
      for (const rule of rules) {
        if (rule.constructor.name === 'CSSViewTransitionRule') {
          found.push({ navigation: rule.navigation, media: rule.parentRule?.conditionText ?? null });
        } else if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) visit(sheet.cssRules);
    return found;
  });
}

test('page links open canonical URLs, prerender on intent, cross-fade between documents and enter on a first load', async () => {
  const express = http.createServer((request, response) => signedOut(response));
  let next;
  let gateway;
  let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, defaultViewport: null, args: ['--no-sandbox', '--window-size=1440,900'] });
    const { page, pageErrors } = await openPage(browser, `${gateway.origin}/privacy/`);

    const links = await page.$$eval('a[href^="/"]', anchors => anchors.map(anchor => anchor.getAttribute('href')));
    assert.deepEqual([...new Set(links)].filter(href => /^\/[^?#.]*[^/?#.]$/.test(href) && !href.startsWith('/api/')), [],
      'page links must not point at URLs that only redirect to their trailing-slash form');

    const optIn = await viewTransitionOptIn(page);
    assert.equal(optIn.length, 1, 'documents opt in to cross-document view transitions once');
    assert.equal(optIn[0].navigation, 'auto');
    assert.match(optIn[0].media ?? '', /prefers-reduced-motion:\s*no-preference/);

    const rules = JSON.parse(await page.$eval('script[type="speculationrules"]', script => script.textContent));
    assert.deepEqual(Object.keys(rules), ['prerender']);
    assert.equal(rules.prerender.length, 1);
    assert.equal(rules.prerender[0].eagerness, 'moderate');
    const eligible = href => ruleMatches(rules.prerender[0].where, new URL(href, gateway.origin).href, gateway.origin);
    for (const href of ['/', '/faq/', '/tierlist/', '/standard/cards/', '/standard/cards/standard/BE_013/',
      '/heroes/57893/', '/library/minions/', '/battlegrounds/tier-list/', '/guides-archive/some-guide/']) {
      assert.equal(eligible(href), true, `${href} is prerendered on intent`);
    }
    for (const href of ['/?login', '/tierlist/?source=hsreplay', '/tierlist', '/admin/', '/admin/people/',
      '/connect/', '/r/tg-july/', '/id/12345/', '/api/v1/openapi.json', '/sitemap.xml', 'https://boosty.to/kolodahearthstone/']) {
      assert.equal(eligible(href), false, `${href} must load only when the visitor opens it`);
    }
    assert.deepEqual(gateway.speculative, [], 'nothing loads ahead of the visit without an intent signal');

    // A navigation link runs the shell's click handler; a footer link is a plain anchor.
    await reportOutgoingTransition(page);
    await hoverUntilPrerendered(page, gateway, '.arena-sidebar a[href="/tierlist/"]', '/tierlist/');
    await page.click('.arena-sidebar a[href="/tierlist/"]');
    assert.deepEqual(await arrival(page, '/tierlist/'), { redirects: 0, prerendered: true, outgoingTransition: 'animated' });

    await reportOutgoingTransition(page);
    await hoverUntilPrerendered(page, gateway, '.arena-footer a[href="/terms/"]', '/terms/');
    await page.click('.arena-footer a[href="/terms/"]');
    assert.deepEqual(await arrival(page, '/terms/'), { redirects: 0, prerendered: true, outgoingTransition: 'animated' });
    assert.deepEqual(pageErrors, []);

    // Without the prerender: the new document cross-fades in place. Its content
    // box must not travel from where the scrolled old page left it, or the new
    // page would fly in across the sticky header.
    const scrolled = await browser.newPage();
    await recordEntrance(scrolled);
    await scrolled.evaluateOnNewDocument(() => addEventListener('pagereveal', async event => {
      // The head's `rel=expect` keeps the page hidden until its content box has opened,
      // however the HTML stream is split, so the incoming page always fades in.
      sessionStorage.setItem('content-at-reveal', String(Boolean(document.querySelector('#main-content .arena-content'))));
      if (!event.viewTransition) return;
      await event.viewTransition.ready;
      sessionStorage.setItem('incoming-animations', document.getAnimations()
        .map(animation => animation.effect?.pseudoElement).filter(Boolean).sort().join(' '));
    }));
    await scrolled.goto(`${gateway.origin}/privacy/`, { waitUntil: 'networkidle2' });
    await scrolled.evaluate(() => {
      document.querySelector('script[type="speculationrules"]').remove();
      scrollTo(0, document.documentElement.scrollHeight);
    });
    await scrolled.click('.arena-footer a[href="/terms/"]');
    assert.equal((await arrival(scrolled, '/terms/')).prerendered, false);
    await scrolled.waitForFunction(() => sessionStorage.getItem('incoming-animations') !== null, { timeout: 15_000 });
    assert.equal(await scrolled.evaluate(() => sessionStorage.getItem('incoming-animations')),
      '::view-transition-new(route-content) ::view-transition-old(route-content)');
    assert.equal(await scrolled.evaluate(() => sessionStorage.getItem('content-at-reveal')), 'true',
      'the new page is revealed with its content, not just the header');
    assert.deepEqual(JSON.parse(await scrolled.evaluate(() => sessionStorage.getItem('entrance'))), [],
      'the cross-fade brings the page in; its own entrance does not play a second time');

    // A first load has no transition: the frame and the header (the largest
    // paint) are there at once, the sections under the header rise in one
    // after another, and afterwards every element is at rest.
    const fresh = await browser.newPage();
    await recordEntrance(fresh);
    await fresh.goto(`${gateway.origin}/privacy/`, { waitUntil: 'networkidle2' });
    const entrance = JSON.parse(await fresh.evaluate(() => sessionStorage.getItem('entrance')));
    const parts = entrance.filter(step => step.role === 'part');
    assert.ok(parts.length >= 2 && parts.every(step => step.name === 'page-enter'), JSON.stringify(entrance));
    assert.ok(parts.at(-1).delay > parts[0].delay, 'the sections rise one after another');
    assert.deepEqual(entrance.filter(step => step.role !== 'part'), [], 'the frame and the header do not move');
    assert.equal(await fresh.evaluate(() => getComputedStyle(document.querySelector('.arena-content > * > :first-child'))
      .animationName), 'none', 'the header is still');

    // The page title is the largest paint; Chrome would count it only once an
    // animation on it ends. On the 404 page it is not the first child.
    const missing = await browser.newPage();
    await recordEntrance(missing);
    await missing.goto(`${gateway.origin}/no-such-page/`, { waitUntil: 'networkidle2' });
    const missingEntrance = JSON.parse(await missing.evaluate(() => sessionStorage.getItem('entrance')));
    assert.ok(missingEntrance.length > 0, 'the 404 page enters too');
    assert.deepEqual([...entrance, ...missingEntrance].filter(step => step.title), [], 'the page title never moves');
    await fresh.waitForFunction(() => !document.documentElement.hasAttribute('data-page-enter'), { timeout: 5_000 });
    assert.deepEqual(await fresh.evaluate(() => [getComputedStyle(document.querySelector('.arena-content')).opacity,
      document.getAnimations().filter(animation => /^page-/.test(animation.animationName)).length]), ['1', 0]);

    const still = await browser.newPage();
    await still.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await recordEntrance(still);
    await still.goto(`${gateway.origin}/privacy/`, { waitUntil: 'networkidle2' });
    assert.deepEqual(JSON.parse(await still.evaluate(() => sessionStorage.getItem('entrance'))), [],
      'reduced motion opens the page without an entrance');

    const calm = await openPage(browser, `${gateway.origin}/privacy/`, true);
    await reportOutgoingTransition(calm.page);
    await calm.page.click('.arena-footer a[href="/terms/"]');
    assert.equal((await arrival(calm.page, '/terms/')).outgoingTransition, 'instant',
      'reduced motion keeps the instant document swap');
    assert.deepEqual(calm.pageErrors, []);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});
