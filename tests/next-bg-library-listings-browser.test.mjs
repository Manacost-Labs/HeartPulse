import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import express from 'express';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { createBattlegroundLibrarySeoRouter } from '../server/battlegroundLibrarySeoRoutes.ts';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';
import { fetchImpl } from './helpers/battlegroundLibraryOpenFixture.ts';
import './next-library-open.check.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
// Current-pool listings carry the subscriber's listing view on the open cards; the archive keeps the gate.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const listings = [
  ['/library/', 'Библиотека Полей сражений', true],
  ['/library/minions/', 'Существа Полей сражений', true],
  ['/library/spells/', 'Заклинания Полей сражений', true],
  ['/library/anomalies/', 'Аномалии Полей сражений', true],
  ['/library/dark-gifts/', 'Темные дары Полей сражений', true],
  ['/library/quests/', 'Квесты Полей сражений', true],
  ['/library/rewards/', 'Награды Полей сражений', true],
  ['/library/darkmoon-prizes/', 'Призы Ярмарки Новолуния', true],
  ['/library/trinkets/', 'Аксессуары Полей сражений', true],
  ['/library/timewarped/', 'Хрономальные карты Полей сражений', true],
  ['/library/archive/', 'Архив Полей сражений', false],
  ['/library/archive/minions/', 'Архив существ Полей сражений', false],
  ['/library/archive/spells/', 'Архив заклинаний Полей сражений', false],
  ['/library/archive/anomalies/', 'Архив аномалий Полей сражений', false],
  ['/library/archive/quests/', 'Архив квестов Полей сражений', false],
  ['/library/archive/rewards/', 'Архив наград Полей сражений', false],
  ['/library/archive/darkmoon-prizes/', 'Архив призов Ярмарки Новолуния', false],
  ['/library/archive/trinkets/', 'Архив аксессуаров Полей сражений', false],
];

test('Next Battleground library listings preserve anonymous SEO without private requests', async () => {
  const legacyApp = express();
  legacyApp.get('/api/auth/me', (_request, response) => response.json({ user: null, adminAllowed: false, contestAdminAllowed: false }));
  legacyApp.use((request, response, next) => {
    if (isMenuBackgroundRead(request.path)) return response.json(MENU_PATCH_ARCHIVE);
    return next();
  });
  legacyApp.use(createBattlegroundLibrarySeoRouter({ fetchImpl, auxiliaryCatalogBaseUrl: 'https://api.example.test/api/v1', onError: () => undefined }));
  // The card pictures of the tiles (the image proxy is not under test here).
  legacyApp.use('/api/public-resource', (_request, response) => response.type('png').send(PIXEL));
  legacyApp.use('/api', (_request, response) => response.status(401).json({ error: 'guest' }));
  legacyApp.use((_request, response) => response.status(204).end());
  const legacy = http.createServer(legacyApp);
  const legacyOrigin = await listenLocal(legacy);
  const next = await startNextServer({ legacyOrigin });
  const gateway = createPublicWebGateway({ legacyOrigin, nextOrigin: next.origin, enabled: true, pagesEnabled: true });
  const origin = await listenLocal(gateway);
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    // Prerendered pages carry an ETag: the second visit of a path must be a full answer, not a 304.
    await page.setCacheEnabled(false);
    const errors = []; const failed = []; const privateRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request)) failed.push(request.url()); });
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/bg/library/')) privateRequests.push(request.url());
    });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      for (const [path, heading, open] of listings) {
        const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
        assert.equal(response.status(), 200, `${path} at ${width}px`);
        await page.evaluate(axe);
        const state = await page.evaluate(async () => ({
          canonical: document.querySelector('link[rel=canonical]')?.href,
          ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
          robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
          jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
          h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
          main: document.querySelectorAll('main').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          gate: document.body.textContent.includes('доступна подписчикам'),
          openLinks: document.querySelectorAll('[data-library-card-tile][href^="/library/"], .bg-library-public a[href^="/library/"]').length,
          closedPart: Boolean(document.querySelector('.paywalled-library')),
          violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
            .violations.map(violation => violation.id),
        }));
        // The archive has no open layer: noindex without a canonical, og:url or JSON-LD (#553).
        assert.equal(state.canonical, open ? `https://hearthpulse.net${path}` : undefined, path);
        assert.equal(state.ogUrl, open ? `https://hearthpulse.net${path}` : undefined, path);
        assert.equal(state.robots, open ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, follow', path);
        assert.equal(state.jsonLd > 0, open, path);
        assert.deepEqual(state.h1, [heading]);
        assert.equal(state.main, 1);
        assert.equal(state.overflow, false);
        assert.equal(state.gate, !open, `${path}: the open list replaces the gate, the archive keeps it`);
        assert.equal(state.closedPart, open, path);
        assert.equal(state.openLinks > 0, open, `${path}: the open list is in the page without a script`);
        assert.deepEqual(state.violations, []);
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(privateRequests, []);
    assert.equal((await page.goto(`${next.origin}/library/unknown/`, { waitUntil: 'networkidle2' })).status(), 404);
    assert.equal((await page.goto(`${next.origin}/library/archive/dark-gifts/`, { waitUntil: 'networkidle2' })).status(), 404);
    assert.equal((await page.goto(`${next.origin}/library/archive/timewarped/`, { waitUntil: 'networkidle2' })).status(), 404);
    await page.close();
  } finally {
    if (browser) await browser.close();
    await closeLocal(gateway);
    await next.close();
    await closeLocal(legacy);
  }
});
