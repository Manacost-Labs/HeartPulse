import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { listenLocal, closeLocal } from './helpers/publicCardFixture.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';

function homeArticlesChunk() {
  const chunks = join('apps/public-web/.next/static/chunks');
  const matches = readdirSync(chunks, { recursive: true })
    .filter(name => name.endsWith('.js') && readFileSync(join(chunks, name), 'utf8').includes('home-latest-article__image-fallback'));
  assert.equal(matches.length, 1, 'one chunk renders the latest articles section');
  return matches[0];
}

function homeFeedRequestsChunk() {
  const chunks = join('apps/public-web/.next/static/chunks');
  const matches = readdirSync(chunks, { recursive: true })
    .filter(name => name.endsWith('.js') && readFileSync(join(chunks, name), 'utf8').includes('Home feed unavailable'));
  assert.equal(matches.length, 1, 'one lazy chunk owns missing home feed requests');
  return matches[0];
}

// The server-rendered "latest articles" section hydrates once its lazy chunk
// arrives. The account check finishing first must not replace that HTML with
// the loading placeholder, which on slow connections flickered the section
// away for as long as the chunk took.
test('the Next.js home keeps its server-rendered articles while their chunk loads', async () => {
  const articlesChunk = homeArticlesChunk();
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    let releaseChunk;
    const chunkHeld = new Promise(resolve => {
      page.on('request', request => {
        if (new URL(request.url()).pathname !== `/_next/static/chunks/${articlesChunk}`) {
          request.continue();
          return;
        }
        releaseChunk = () => request.continue();
        resolve();
      });
    });
    await page.setRequestInterception(true);
    const accountChecked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me');
    await page.goto(`${runtime.origin}/`, { waitUntil: 'domcontentloaded' });
    await Promise.all([chunkHeld, accountChecked]);
    await page.waitForFunction(() => document.querySelector('.arena-sidebar-profile')?.textContent.includes('Войти'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    assert.equal(await page.$('#root .home-latest-articles') !== null, true,
      'the section stays while its chunk is still loading');
    releaseChunk();
    await page.waitForSelector('#root .home-latest-articles', { visible: true });
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('a slow home feed cannot hold the document and only missing feeds load in the browser', { timeout: 60_000 }, async t => {
  const reads = new Map();
  let cancelled = 0;
  let holdBrowser = false;
  let failArticles = false;
  let firstFeedAt = 0;
  const pending = new Set();
  const app = express();
  app.get('/api/auth/me', (_request, response) => response.status(401).json({ error: 'Guest' }));
  const feeds = {
    '/api/home/summary': { topClasses: [{ id: 'mage', name: 'Маг', winrate: 54 }] },
    '/api/articles': { articles: [{ id: 'recovered', title: 'Статья после медленного API', date: '2026-10-13',
      image: '', excerpt: '', url: 'https://hearthpulse.net/articles/' }] },
  };
  for (const [path, body] of Object.entries(feeds)) app.get(path, (_request, response) => {
    firstFeedAt ||= Date.now();
    const count = (reads.get(path) ?? 0) + 1;
    reads.set(path, count);
    if (path !== '/api/articles' || (!failArticles && count > 1 && !holdBrowser)) { response.json(body); return; }
    if (failArticles) { response.status(503); response.write('{'); }
    const timer = setTimeout(() => {
      pending.delete(timer);
      if (failArticles) response.end('}'); else response.json(body);
    }, failArticles || count > 1 ? 5000 : 1800);
    pending.add(timer);
    response.once('close', () => {
      if (!response.writableEnded) cancelled++;
      clearTimeout(timer); pending.delete(timer);
    });
  });
  app.use(express.static('dist'));
  const backend = http.createServer(app);
  let next, gateway, browser;
  try {
    const backendOrigin = await listenLocal(backend);
    next = await startNextServer({ legacyOrigin: backendOrigin });
    gateway = createPublicWebGateway({ legacyOrigin: backendOrigin, nextOrigin: next.origin,
      enabled: true, pagesEnabled: true, galleryEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 390, height: 844 });
    const articlesChunk = homeArticlesChunk();
    let heldChunk; let didHold = false;
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (!didHold && new URL(request.url()).pathname === `/_next/static/chunks/${articlesChunk}`) {
        didHold = true; heldChunk = request;
      } else request.continue();
    });
    const recoveredFeed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/articles');
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    const timing = await page.evaluate(() => ({ ttfb: performance.getEntriesByType('navigation')[0].responseStart,
      headerAt: performance.timeOrigin + performance.getEntriesByType('navigation')[0].responseStart }));
    const feedWait = timing.headerAt - firstFeedAt;
    t.diagnostic(`slow-feed fixture TTFB=${Math.round(timing.ttfb)}ms; server feed wait=${Math.round(feedWait)}ms`);
    assert.ok(feedWait < 1200, `home header must not wait for the 1800ms feed (wait=${Math.round(feedWait)}ms)`);
    await recoveredFeed;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
    assert.ok(await page.$('[data-home-feed="articles"]'), 'a recovering section must survive a delayed lazy chunk');
    heldChunk.continue();
    await page.waitForFunction(() => document.querySelector('.home-latest-articles')?.textContent.includes('Статья после медленного API'));
    const arrival = await page.$eval('[data-home-feed="articles"]', node => {
      const effect = node.getAnimations()[0]?.effect;
      return effect ? { duration: effect.getTiming().duration,
        frames: effect.getKeyframes().map(({ opacity, transform }) => ({ opacity, transform })) } : null;
    });
    assert.deepEqual(arrival, { duration: 220, frames: [{ opacity: '0.8' }, { opacity: '1' }] },
      'late content must settle softly without moving the page');
    assert.equal(reads.get('/api/home/summary'), 1, 'the completed server feed must not be fetched twice');
    assert.equal(reads.get('/api/articles'), 2, 'only the missing feed is retried in the browser');
    assert.equal(cancelled, 1, 'the expired server read must release its connection');
    assert.equal(await page.$eval('.home-stage', node => node.textContent.includes('Маг')), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const beforeAccount = [...reads.entries()];
    await page.goto(`${origin}/?login`, { waitUntil: 'networkidle2' });
    assert.deepEqual([...reads.entries()], beforeAccount, 'the account screen must not load home feeds');
    reads.clear(); cancelled = 0; holdBrowser = true;
    const browserRead = page.waitForRequest(request => new URL(request.url()).pathname === '/api/articles');
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await browserRead;
    await page.evaluate(() => {
      window.__homeFallbackDocument = true;
      const link = document.createElement('a');
      link.id = 'fixture-leave-home'; link.href = '/faq/'; link.textContent = 'Помощь';
      document.querySelector('.home-page-index').append(link);
    });
    await page.click('#fixture-leave-home');
    await page.waitForFunction(() => location.pathname === '/faq/');
    assert.equal(await page.evaluate(() => window.__homeFallbackDocument), true, 'leaving must use the client router');
    const cancelDeadline = Date.now() + 1000;
    while (cancelled < 2 && Date.now() < cancelDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(cancelled, 2, 'leaving cancels the browser fallback as well as the expired server read');
    assert.deepEqual(errors, []);

    holdBrowser = false;
    const preparedContext = await browser.createBrowserContext();
    const prepared = await preparedContext.newPage();
    const recoveryRequests = [];
    const recoveryChunk = homeFeedRequestsChunk();
    prepared.on('request', request => {
      if (new URL(request.url()).pathname === `/_next/static/chunks/${recoveryChunk}`) recoveryRequests.push(request.url());
    });
    await prepared.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    assert.equal(await prepared.$eval('.home-stage', node => node.textContent.includes('Маг')), true);
    assert.equal(await prepared.$eval('[data-home-feed="articles"]', node => node.textContent.includes('Статья после медленного API')), true);
    assert.deepEqual(recoveryRequests, [], 'prepared home data must not load recovery code');
    await preparedContext.close();

    reads.clear(); cancelled = 0; failArticles = true;
    const failedContext = await browser.createBrowserContext();
    const failed = await failedContext.newPage();
    await failed.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await failed.waitForSelector('[data-home-feed="articles"][aria-busy="false"]');
    const failureDeadline = Date.now() + 1000;
    while (cancelled < 2 && Date.now() < failureDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(cancelled, 2, 'server and browser must release unread error response bodies immediately');
    assert.equal(reads.get('/api/articles'), 2);
    await failedContext.close();

    // A fresh context has no cached recovery module. Its deadline includes lazy
    // code loading, and releasing the code after expiry must not start a request.
    reads.clear(); cancelled = 0; holdBrowser = false; failArticles = false;
    const context = await browser.createBrowserContext();
    const stalled = await context.newPage();
    let releaseRecovery;
    const recoveryHeld = new Promise(resolve => {
      stalled.on('request', request => {
        if (new URL(request.url()).pathname === `/_next/static/chunks/${recoveryChunk}`) {
          releaseRecovery = () => request.continue(); resolve();
        } else request.continue();
      });
    });
    await stalled.setRequestInterception(true);
    await stalled.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await recoveryHeld;
    await stalled.waitForSelector('[data-home-feed="articles"][aria-busy="true"]');
    await stalled.waitForSelector('[data-home-feed="articles"][aria-busy="false"]', { timeout: 15_000 });
    assert.equal(reads.get('/api/articles'), 1, 'a stalled recovery chunk must not start an HTTP retry');
    releaseRecovery();
    await stalled.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    assert.equal(reads.get('/api/articles'), 1, 'code arriving after expiry must respect cancellation');
    await context.close();
  } finally {
    for (const timer of pending) clearTimeout(timer);
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (next) await next.close();
    await closeLocal(backend);
  }
});
